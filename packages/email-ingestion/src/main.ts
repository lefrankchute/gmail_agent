import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

import { createServer } from './server';
import { startPollingWorker } from './workers/polling.worker';
import { startActionWorker } from './workers/action.worker';

const PORT = parseInt(process.env.PORT ?? '3001');

async function main() {
  console.log('[email-ingestion] Starting...');

  const app = createServer();
  app.listen(PORT, () => {
    console.log(`[email-ingestion] HTTP server on port ${PORT}`);
  });

  await startPollingWorker();
  startActionWorker();

  console.log('[email-ingestion] All workers running');
}

main().catch(err => {
  console.error('[email-ingestion] Fatal:', err);
  process.exit(1);
});
