import { Worker } from 'bullmq';
import { QUEUE_NAMES, type TransactionJobData } from '@gmail-agent/shared';
import { prisma } from '../db/prisma';
import { convertToCOP } from '../services/exchange-rate';

function getConnectionOptions(): { host: string; port: number } {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return { host: url.hostname, port: parseInt(url.port || '6379') };
}

export function startTransactionWorker(): void {
  const worker = new Worker<TransactionJobData>(
    QUEUE_NAMES.TRANSACTION_NEW,
    async job => {
      const data = job.data;

      // Dedup by emailId
      const existing = await prisma.transaction.findFirst({ where: { emailId: data.emailId } });
      if (existing) {
        console.log(`[transaction] Duplicate skipped: ${data.emailId}`);
        return;
      }

      const { amountCop, exchangeRate } = await convertToCOP(data.amount, data.currency);

      await prisma.transaction.create({
        data: {
          emailId: data.emailId,
          bank: data.bank,
          amount: data.amount,
          currency: data.currency.toUpperCase(),
          amountCop,
          exchangeRate,
          accountType: data.accountType,
          merchant: data.merchant ?? null,
          transactionType: data.transactionType,
          transactionDate: new Date(data.transactionDate),
        },
      });

      console.log(
        `[transaction] Saved: ${data.bank} ${data.amount} ${data.currency} → ${amountCop.toLocaleString('es-CO')} COP`
      );
    },
    { connection: getConnectionOptions(), concurrency: 2 }
  );

  worker.on('failed', (job, err) =>
    console.error(`[transaction] Job ${job?.id} failed: ${err.message}`)
  );

  console.log('[transaction] Worker started');
}
