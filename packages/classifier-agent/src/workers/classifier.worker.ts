import { Queue, Worker, UnrecoverableError, type Job } from 'bullmq';
import { EmailAction as DBEmailAction } from '@prisma/client';
import {
  QUEUE_NAMES,
  EmailAction,
  type EmailJob,
  type ClassifiedEmailJob,
  type TransactionJobData,
  type UrgentNotificationData,
} from '@gmail-agent/shared';
import { prisma } from '../db/prisma';
import { applyQuickRules } from '../rules/quick-rules';
import { classifyWithClaude } from '../classifier/claude-classifier';
import { analyzeBankEmail } from '../classifier/bank-classifier';
import { detectAirlineTicket } from '../classifier/airline-classifier';
import { isFatalApiError, fatalErrorMessage } from '../classifier/claude-errors';

function getConnectionOptions(): { host: string; port: number } {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return { host: url.hostname, port: parseInt(url.port || '6379') };
}

export function startClassifierWorker(): void {
  // Load user labels in background (non-blocking); refresh every hour
  refreshLabelCache().catch(() => {});
  setInterval(() => refreshLabelCache().catch(() => {}), 60 * 60 * 1000);

  const conn = getConnectionOptions();

  const classifiedQueue = new Queue<ClassifiedEmailJob>(QUEUE_NAMES.EMAIL_CLASSIFIED, {
    connection: conn,
  });
  const transactionQueue = new Queue<TransactionJobData>(QUEUE_NAMES.TRANSACTION_NEW, {
    connection: conn,
  });
  const urgentQueue = new Queue<UrgentNotificationData>(QUEUE_NAMES.NOTIFICATION_URGENT, {
    connection: conn,
  });

  const worker = new Worker<EmailJob>(
    QUEUE_NAMES.EMAIL_NEW,
    async (job: Job<EmailJob>) => {
      try {
      const email = job.data;

      // Dedup check — second line of defense after Redis set in ingestion
      const existing = await prisma.email.findUnique({ where: { id: email.id } });
      if (existing) {
        console.log(`[classifier] Skip duplicate: ${email.id}`);
        return;
      }

      // Step 1: classify (quick rules first, Claude if no match)
      let classification = await applyQuickRules(email);
      if (!classification) {
        classification = await classifyWithClaude(email);
      }

      const category = classification.category.toLowerCase();
      let transactionData: TransactionJobData | undefined;
      let isUrgentBank = false;

      // Step 2: deep analysis for banks overrides the initial classification
      if (category === 'banco') {
        const bankResult = await analyzeBankEmail(email);
        classification = bankResult.classification;
        transactionData = bankResult.transactionData;
        isUrgentBank = bankResult.isUrgent;
      }

      // Step 3: airline ticket detection — publish urgent if confirmed ticket found
      if (category === 'aerolínea' || category === 'aerolinea') {
        const flightData = await detectAirlineTicket(email);
        if (flightData) {
          await urgentQueue.add(
            'airline',
            {
              emailId: email.id,
              type: 'airline_ticket',
              subject: email.subject,
              sender: email.sender,
              flightData,
            },
            { priority: 1 }
          );
        }
      }

      // Fraud / card-blocked alert
      if (isUrgentBank) {
        await urgentQueue.add(
          'fraud',
          { emailId: email.id, type: 'fraud', subject: email.subject, sender: email.sender },
          { priority: 1 }
        );
      }

      // Persist to DB
      await prisma.email.create({
        data: {
          id: email.id,
          threadId: email.threadId,
          subject: email.subject,
          sender: email.sender,
          senderDomain: email.senderDomain,
          receivedAt: new Date(email.receivedAt),
          labels: email.labels,
          action: classification.action as DBEmailAction,
          category: classification.category,
          subCategory: classification.subCategory ?? null,
          confidence: classification.confidence,
          reasoning: classification.reasoning,
          isHistorical: false,
        },
      });

      // Tell email-ingestion which Gmail action to execute
      await classifiedQueue.add('execute', {
        emailId: email.id,
        action: classification.action,
        targetLabelName: getTargetLabelName(classification.action as EmailAction, classification.category),
        source: email.source ?? 'polling',
      });

      // Queue for financial-service (Phase 4)
      if (transactionData) {
        await transactionQueue.add('extract', transactionData);
      }

      await prisma.processLog.create({
        data: {
          service: 'classifier-agent',
          level: 'info',
          message: `Classified: ${email.subject.slice(0, 80)}`,
          metadata: {
            emailId: email.id,
            action: classification.action,
            category: classification.category,
            confidence: classification.confidence,
          },
        },
      });

      console.log(
        `[classifier] ${email.id} → ${classification.action} | ${classification.category} | ${(classification.confidence * 100).toFixed(0)}%`
      );
      } catch (err) {
        if (isFatalApiError(err)) {
          throw new UnrecoverableError(fatalErrorMessage(err));
        }
        throw err;
      }
    },
    { connection: conn, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    console.error(`[classifier] Job ${job?.id} failed: ${err.message}`);
  });

  console.log('[classifier] Classifier worker started');
}

// --- User label cache (loaded at startup, refreshed every hour) ---
let cachedUserLabels: string[] = [];

async function refreshLabelCache(): Promise<void> {
  try {
    const rows = await prisma.gmailLabel.findMany({
      where: { type: 'user', isVisible: true },
      select: { name: true },
    });
    cachedUserLabels = rows.map(r => r.name);
  } catch {
    // DB might not be ready yet on first boot — keep existing cache
  }
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  banco: ['banco', 'bancos'],
  aerolínea: ['aerolinea', 'aerol'],
  aerolinea: ['aerolinea', 'aerol'],
  compras: ['compra', 'compras', 'shopping'],
  trabajo: ['trabajo', 'empleo'],
  redes_sociales: ['redes', 'social'],
  personal: ['personal'],
  suscripción: ['suscripci', 'newsletter'],
  suscripcion: ['suscripci', 'newsletter'],
  gobierno: ['gobierno'],
  otro: [],
};

const CATEGORY_FALLBACK: Record<string, string> = {
  banco: 'bancos',
  aerolínea: 'aerolíneas',
  aerolinea: 'aerolíneas',
  compras: 'compras',
  trabajo: 'trabajo',
  redes_sociales: 'redes_sociales',
  personal: 'personal',
  suscripción: 'suscripciones',
  suscripcion: 'suscripciones',
  gobierno: 'gobierno',
  otro: 'otro',
};

function normalizeStr(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function findBestUserLabel(category: string): string | null {
  const keywords = CATEGORY_KEYWORDS[category.toLowerCase()];
  if (!keywords?.length || !cachedUserLabels.length) return null;

  // Pass 1: standalone top-level labels (no '/')
  const topLevel = cachedUserLabels.filter(n => !n.includes('/'));
  for (const kw of keywords) {
    const match = topLevel.find(n => normalizeStr(n).includes(kw));
    if (match) return match;
  }

  // Pass 2: match via the parent portion of hierarchical labels (e.g. "Aerolíneas/Ryanair" → "Aerolíneas")
  // Gmail always creates parent labels, so the parent name IS a valid Gmail label
  for (const kw of keywords) {
    const child = cachedUserLabels.find(n => {
      const parent = n.split('/')[0];
      return normalizeStr(parent).includes(kw);
    });
    if (child) return child.split('/')[0]; // return parent label name
  }

  return null;
}

function getTargetLabelName(action: EmailAction, category: string): string {
  if (action === EmailAction.UNCLASSIFIED) return 'Agente/pendiente';
  if (action === EmailAction.SUMMARY) return 'Agente/resúmenes';

  const cat = action === EmailAction.PERSONAL ? 'personal' : category;
  const userLabel = findBestUserLabel(cat);
  if (userLabel) return userLabel;

  // Fallback: Agente/* labels (created at action worker startup)
  if (action === EmailAction.PERSONAL) return 'Agente/personal';
  const suffix = CATEGORY_FALLBACK[category.toLowerCase()] ?? 'otro';
  return `Agente/${suffix}`;
}
