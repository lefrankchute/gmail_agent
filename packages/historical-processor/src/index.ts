import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { google, gmail_v1 } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import { patchConsole, QUEUE_NAMES, type EmailJob, type SendNotificationJob } from '@gmail-agent/shared';

patchConsole();

const prisma = new PrismaClient();
const PROCESSED_SET = 'gmail:processed_emails';
const BATCH_SIZE = 50;
// Delay between individual messages.get calls to stay within API quotas
const FETCH_DELAY_MS = 150;

function getConnectionOptions(): { host: string; port: number } {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return { host: url.hostname, port: parseInt(url.port || '6379') };
}

function getGmailClient(): gmail_v1.Gmail {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID!,
    process.env.GMAIL_CLIENT_SECRET!,
    process.env.GMAIL_REDIRECT_URI ?? 'http://localhost:3001/auth/callback'
  );
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN! });
  return google.gmail({ version: 'v1', auth });
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('[historical-processor] Starting...');

  // Resume an interrupted/paused job, or create a new one
  // A 'running' job at startup means the previous process crashed — treat it as resumable
  let job = await prisma.historicalJob.findFirst({
    where: { status: { in: ['running', 'paused'] } },
    orderBy: { startedAt: 'desc' },
  });

  if (!job) {
    job = await prisma.historicalJob.create({
      data: { status: 'running' },
    });
    console.log(`[historical-processor] Created job: ${job.id}`);
  } else {
    job = await prisma.historicalJob.update({
      where: { id: job.id },
      data: { status: 'running' },
    });
    console.log(`[historical-processor] Resuming job: ${job.id} from pageToken: ${job.lastPageToken ?? 'start'}`);
  }

  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  redis.on('error', err => console.error('[redis]', err.message));

  const emailQueue = new Queue<EmailJob>(QUEUE_NAMES.EMAIL_NEW, {
    connection: getConnectionOptions(),
  });
  const gmail = getGmailClient();

  let pageToken: string | undefined = job.lastPageToken ?? undefined;
  let totalQueued = job.totalQueued;
  let errors = job.errors;

  try {
    let hasMore = true;

    while (hasMore) {
      // List unread emails (all folders except spam/trash), one page at a time
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread -in:spam -in:trash',
        maxResults: BATCH_SIZE,
        pageToken,
      });

      const messageIds = (listRes.data.messages ?? []).map(m => m.id!).filter(Boolean);
      pageToken = listRes.data.nextPageToken ?? undefined;
      hasMore = !!pageToken;

      console.log(
        `[historical-processor] Batch of ${messageIds.length} | next page: ${pageToken ? 'yes' : 'none'}`
      );

      for (const id of messageIds) {
        try {
          // Skip if already processed (Redis dedup)
          const alreadyInRedis = await redis.sismember(PROCESSED_SET, id);
          if (alreadyInRedis) continue;

          // Skip if already in DB
          const alreadyInDb = await prisma.email.findUnique({ where: { id } });
          if (alreadyInDb) {
            await redis.sadd(PROCESSED_SET, id);
            continue;
          }

          await sleep(FETCH_DELAY_MS);
          const msgRes = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
          const email = parseEmailJob(msgRes.data);
          if (!email) continue;

          await emailQueue.add(
            'process',
            { ...email, source: 'historical' } as EmailJob,
            {
              removeOnComplete: 100,
              removeOnFail: 50,
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
              priority: 10, // lower priority than real-time emails
            }
          );

          await redis.sadd(PROCESSED_SET, id);
          totalQueued++;
        } catch (err) {
          console.error(`[historical-processor] Error on email ${id}:`, (err as Error).message);
          errors++;
        }
      }

      // Persist progress after each batch (enables resume on crash)
      await prisma.historicalJob.update({
        where: { id: job.id },
        data: { totalQueued, errors, lastPageToken: pageToken ?? null },
      });
    }

    // Mark complete
    await prisma.historicalJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        totalQueued,
        errors,
        lastPageToken: null,
      },
    });

    console.log(
      `[historical-processor] Completed — queued: ${totalQueued}, errors: ${errors}`
    );

    // Send Telegram summary
    const notifQueue = new Queue<SendNotificationJob>(QUEUE_NAMES.NOTIFICATION_SEND, {
      connection: getConnectionOptions(),
    });
    await notifQueue.add('historical-complete', {
      text:
        `📬 *Procesador Histórico Completado*\n\n` +
        `Correos encolados: ${totalQueued}\n` +
        `Errores: ${errors}\n\n` +
        `Todos los correos no leídos han sido enviados a clasificación.`,
      parseMode: 'Markdown',
    });
    await notifQueue.close();
  } catch (err) {
    console.error('[historical-processor] Fatal:', err);
    await prisma.historicalJob.update({
      where: { id: job.id },
      data: { status: 'failed', completedAt: new Date(), totalQueued, errors },
    });
  } finally {
    await redis.quit();
    await emailQueue.close();
    await prisma.$disconnect();
  }
}

// --- Helpers ---

function parseEmailJob(msg: gmail_v1.Schema$Message): Omit<EmailJob, 'source'> | null {
  if (!msg?.id) return null;

  const headers = msg.payload?.headers ?? [];
  const subject = getHeader(headers, 'Subject') ?? '(sin asunto)';
  const from = getHeader(headers, 'From') ?? '';
  const sender = extractEmail(from);
  const senderDomain = extractDomain(sender);
  const receivedAt = new Date(parseInt(msg.internalDate ?? '0')).toISOString();
  const { plain, html } = extractBody(msg.payload);

  return {
    id: msg.id,
    threadId: msg.threadId ?? '',
    subject,
    sender,
    senderDomain,
    snippet: msg.snippet ?? '',
    labels: msg.labelIds ?? [],
    receivedAt,
    body: plain || stripHtml(html),
    bodyHtml: html || undefined,
  };
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[],
  name: string
): string | null {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/);
  return (match ? match[1] : from.trim()).toLowerCase();
}

function extractDomain(email: string): string {
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : '';
}

function extractBody(
  part?: gmail_v1.Schema$MessagePart | null
): { plain: string; html: string } {
  if (!part) return { plain: '', html: '' };

  if (part.mimeType === 'text/plain' && part.body?.data)
    return { plain: decodeBase64(part.body.data), html: '' };

  if (part.mimeType === 'text/html' && part.body?.data)
    return { plain: '', html: decodeBase64(part.body.data) };

  if (part.parts?.length) {
    let plain = '';
    let html = '';
    for (const p of part.parts) {
      const { plain: p2, html: h2 } = extractBody(p);
      if (!plain && p2) plain = p2;
      if (!html && h2) html = h2;
    }
    return { plain, html };
  }

  return { plain: '', html: '' };
}

function decodeBase64(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

main().catch(err => {
  console.error('[historical-processor] Unhandled:', err);
  process.exit(1);
});
