import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

import { patchConsole, setupErrorHandlers } from '@gmail-agent/shared';
import { prisma } from './db/prisma';

patchConsole();
setupErrorHandlers('summary-agent', (error, stack) =>
  prisma.errorLog.create({ data: { service: 'summary-agent', error, stack } }).then(() => {})
);

import { startDailySummaryWorker } from './workers/daily-summary.worker';

console.log('[summary-agent] Starting...');
startDailySummaryWorker();
console.log('[summary-agent] Ready');
