import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

import { patchConsole, setupErrorHandlers } from '@gmail-agent/shared';
import { prisma } from './db/prisma';

patchConsole();
setupErrorHandlers('email-ingestion', (error, stack) =>
  prisma.errorLog.create({ data: { service: 'email-ingestion', error, stack } }).then(() => {})
);

import { createServer } from './server';
import { startLabelSyncWorker } from './workers/label-sync.worker';
import { startPollingWorker } from './workers/polling.worker';
import { startActionWorker } from './workers/action.worker';
import { startLabelScannerWorker } from './workers/label-scanner.worker';
import { startInboxAdvisorWorker } from './workers/inbox-advisor.worker';
import { startMoveExecutorWorker } from './workers/move-executor.worker';

const PORT = parseInt(process.env.PORT ?? '3001');

async function main() {
  console.log('[email-ingestion] Starting...');

  const app = createServer();
  app.listen(PORT, () => {
    console.log(`[email-ingestion] HTTP server on port ${PORT}`);
  });

  // Phase 2.6 — sync labels/filters to DB first (inbox-advisor and label-scanner need this)
  await startLabelSyncWorker();

  // Phase 2.7 — ensure Agente/* labels exist before any Gmail actions
  await startActionWorker();

  // Phase 2.8 — inbox-advisor runs BEFORE polling so rule-based emails bypass Claude
  await startInboxAdvisorWorker();
  startMoveExecutorWorker();

  // Phase 2.2 — poll inbox; emails already handled by inbox-advisor are gone from inbox
  await startPollingWorker();

  // Phase 2.9 — scan user labels for unread emails (every 15 min)
  await startLabelScannerWorker();

  console.log('[email-ingestion] All workers running');
}

main().catch(err => {
  console.error('[email-ingestion] Fatal:', err);
  process.exit(1);
});
