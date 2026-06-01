import Anthropic from '@anthropic-ai/sdk';
import { Queue } from 'bullmq';
import cron from 'node-cron';
import { QUEUE_NAMES, type SendNotificationJob } from '@gmail-agent/shared';
import { prisma } from '../db/prisma';
import { SUMMARY_SYSTEM_PROMPT } from '../prompts';

const MODEL = 'claude-haiku-4-5-20251001';

function getConnectionOptions(): { host: string; port: number } {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return { host: url.hostname, port: parseInt(url.port || '6379') };
}

function getYesterdayRange(): { from: Date; to: Date } {
  // Yesterday in America/Bogota timezone
  const now = new Date();
  const tzDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);

  const today = new Date(`${tzDate}T00:00:00-05:00`);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  return { from: yesterday, to: today };
}

async function buildDailySummary(minGapMs?: number): Promise<void> {
  // Skip if a summary was sent too recently (guards against overlapping runs)
  if (minGapMs) {
    const last = await prisma.dailySummary.findFirst({
      where: { sentAt: { not: null } },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    if (last?.sentAt && Date.now() - last.sentAt.getTime() < minGapMs) {
      console.log('[daily-summary] Skipped — last summary was too recent');
      return;
    }
  }

  const sendQueue = new Queue<SendNotificationJob>(QUEUE_NAMES.NOTIFICATION_SEND, {
    connection: getConnectionOptions(),
  });

  try {
    const { from, to } = getYesterdayRange();
    const dateLabel = from.toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric',
    });

    // Query emails from yesterday
    const emails = await prisma.email.findMany({
      where: { receivedAt: { gte: from, lt: to } },
      select: { action: true, subject: true, category: true, sender: true },
    });

    if (emails.length === 0) {
      console.log('[daily-summary] No emails yesterday, skipping');
      return;
    }

    const personal = emails.filter(e => e.action === 'PERSONAL');
    const summary  = emails.filter(e => e.action === 'SUMMARY');
    const archive  = emails.filter(e => e.action === 'ARCHIVE');
    const unclassified = emails.filter(e => e.action === 'UNCLASSIFIED');

    // Transaction totals for yesterday
    const txResult = await prisma.$queryRaw<[{ total: string; count: bigint }]>`
      SELECT COALESCE(SUM(t."amountCop"), 0)::text as total, COUNT(*)::bigint as count
      FROM transactions t
      JOIN emails e ON e.id = t."emailId"
      WHERE e."receivedAt" >= ${from} AND e."receivedAt" < ${to}
    `;
    const txTotal = parseFloat(txResult[0]?.total ?? '0');
    const txCount = Number(txResult[0]?.count ?? 0);

    // Build context for Claude
    const context = [
      `Fecha: ${dateLabel}`,
      `Emails personales (${personal.length}): ${personal.map(e => `"${e.subject}"`).slice(0, 5).join(', ')}`,
      `Para revisar (${summary.length}): ${summary.map(e => `"${e.subject}"`).slice(0, 5).join(', ')}`,
      `Archivados automáticamente: ${archive.length}`,
      `Sin clasificar: ${unclassified.length}`,
      txCount > 0 ? `Transacciones: ${txCount}, total: $${txTotal.toLocaleString('es-CO')} COP` : 'Sin transacciones',
    ].join('\n');

    // Call Claude
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: [{ type: 'text', text: SUMMARY_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: context }],
    });

    const telegramMessage = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Save to DB
    await prisma.dailySummary.upsert({
      where: { summaryDate: from },
      create: {
        summaryDate: from,
        contentJson: { personal: personal.length, summary: summary.length, archive: archive.length, unclassified: unclassified.length, txTotal, txCount },
        telegramMessage,
        emailCount: emails.length,
        personalCount: personal.length,
        summaryCount: summary.length,
        unclassifiedCount: unclassified.length,
        sentAt: new Date(),
      },
      update: { telegramMessage, sentAt: new Date() },
    });

    // Send via notification queue
    await sendQueue.add('daily-summary', { text: telegramMessage, parseMode: 'Markdown' });

    console.log(`[daily-summary] Sent summary for ${dateLabel} (${emails.length} emails)`);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.warn('[daily-summary] Rate limited — will retry at next scheduled run');
    } else {
      console.error('[daily-summary] Error:', (err as Error).message);
    }
  } finally {
    await sendQueue.close();
  }
}

export function startDailySummaryWorker(): void {
  const intervalMin = process.env.DAILY_SUMMARY_INTERVAL_MIN
    ? parseInt(process.env.DAILY_SUMMARY_INTERVAL_MIN)
    : null;

  const onError = (err: unknown) =>
    console.error('[daily-summary] Error:', (err as Error).message);

  if (intervalMin && intervalMin > 0) {
    const intervalMs = intervalMin * 60 * 1000;
    const minGapMs = Math.floor(intervalMs * 0.8);
    const run = () => buildDailySummary(minGapMs).catch(onError);
    run();
    setInterval(run, intervalMs);
    console.log(`[daily-summary] Scheduled — every ${intervalMin} minute(s)`);
  } else {
    const hour = process.env.DAILY_SUMMARY_HOUR ?? '7';
    const timezone = process.env.TIMEZONE ?? 'America/Bogota';
    cron.schedule(`0 ${hour} * * *`, () => buildDailySummary().catch(onError), { timezone });
    console.log(`[daily-summary] Scheduled — every day at ${hour}:00 (${timezone})`);
  }
}
