import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

import { patchConsole, setupErrorHandlers } from '@gmail-agent/shared';
import { prisma } from './db/prisma';

patchConsole();
setupErrorHandlers('financial-service', (error, stack) =>
  prisma.errorLog.create({ data: { service: 'financial-service', error, stack } }).then(() => {})
);

import express from 'express';
import { router } from './api/routes';
import { startTransactionWorker } from './workers/transaction.worker';
import { startBalanceWorker } from './workers/balance.worker';

const PORT = parseInt(process.env.FINANCIAL_PORT ?? '3002');

async function main() {
  console.log('[financial-service] Starting...');

  const app = express();
  app.use(express.json());
  app.use('/financial', router);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.listen(PORT, () => console.log(`[financial-service] API on port ${PORT}`));

  startTransactionWorker();
  startBalanceWorker();

  console.log('[financial-service] Ready');
}

main().catch(err => {
  console.error('[financial-service] Fatal:', err);
  process.exit(1);
});
