import { Queue } from 'bullmq';
import cron from 'node-cron';
import { QUEUE_NAMES, type SendNotificationJob } from '@gmail-agent/shared';
import { prisma } from '../db/prisma';

function getConnectionOptions(): { host: string; port: number } {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return { host: url.hostname, port: parseInt(url.port || '6379') };
}

async function buildMonthlyBalance(): Promise<void> {
  const now = new Date();
  // Previous month
  const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth(); // JS months 0-based, we want 1-based previous

  const from = new Date(year, month - 1, 1);
  const to   = new Date(year, month, 1);

  const transactions = await prisma.transaction.findMany({
    where: { transactionDate: { gte: from, lt: to } },
  });

  if (transactions.length === 0) {
    console.log(`[balance] No transactions for ${year}/${month} — skipping report`);
    return;
  }

  const totalCop = transactions.reduce((s, t) => s + Number(t.amountCop), 0);

  const byBank = groupSum(transactions, t => t.bank, t => Number(t.amountCop));
  const byAccountType = groupSum(transactions, t => t.accountType, t => Number(t.amountCop));
  const byCategory = groupSum(transactions, t => t.transactionType, t => Number(t.amountCop));

  // Persist report
  await prisma.monthlyReport.upsert({
    where: { year_month: { year, month } },
    create: { year, month, totalCop, byBank, byAccountType, byCategory, transactionsCount: transactions.length },
    update: { totalCop, byBank, byAccountType, byCategory, transactionsCount: transactions.length },
  });

  // Format Telegram message
  const monthLabel = new Date(year, month - 1, 1).toLocaleString('es-CO', { month: 'long', year: 'numeric', timeZone: 'America/Bogota' });
  const bankLines  = Object.entries(byBank)
    .sort(([, a], [, b]) => b - a)
    .map(([bank, total]) => `• ${bank}: $${Math.round(total).toLocaleString('es-CO')} COP`)
    .join('\n');
  const typeLines  = Object.entries(byCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([type, total]) => `• ${type}: $${Math.round(total).toLocaleString('es-CO')} COP`)
    .join('\n');

  const text = [
    `📊 *Balance — ${monthLabel}*`,
    ``,
    `💰 Total: *$${Math.round(totalCop).toLocaleString('es-CO')} COP*`,
    ``,
    `*Por banco:*`,
    bankLines,
    ``,
    `*Por tipo:*`,
    typeLines,
    ``,
    `_${transactions.length} transacciones registradas_`,
  ].join('\n');

  const sendQueue = new Queue<SendNotificationJob>(QUEUE_NAMES.NOTIFICATION_SEND, {
    connection: getConnectionOptions(),
  });
  await sendQueue.add('monthly-balance', { text, parseMode: 'Markdown' });
  await sendQueue.close();

  console.log(`[balance] Report sent for ${monthLabel} (${transactions.length} transactions, $${Math.round(totalCop).toLocaleString('es-CO')} COP)`);
}

function groupSum<T>(items: T[], key: (i: T) => string, val: (i: T) => number): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, i) => {
    const k = key(i);
    acc[k] = (acc[k] ?? 0) + val(i);
    return acc;
  }, {});
}

export function startBalanceWorker(): void {
  const timezone = process.env.TIMEZONE ?? 'America/Bogota';
  const hour     = process.env.DAILY_SUMMARY_HOUR ?? '7';

  // Run on the 1st of every month at the configured hour
  cron.schedule(`0 ${hour} 1 * *`, () => {
    buildMonthlyBalance().catch(err =>
      console.error('[balance] Error:', (err as Error).message)
    );
  }, { timezone });

  console.log(`[balance] Scheduled — 1st of every month at ${hour}:00 (${timezone})`);
}
