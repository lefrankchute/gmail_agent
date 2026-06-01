import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

import { patchConsole, setupErrorHandlers } from '@gmail-agent/shared';
import { prisma } from './db/prisma';

patchConsole();
setupErrorHandlers('classifier-agent', (error, stack) =>
  prisma.errorLog.create({ data: { service: 'classifier-agent', error, stack } }).then(() => {})
);

import { startClassifierWorker } from './workers/classifier.worker';
import { startDomainPolicyWorker } from './workers/domain-policy.worker';

console.log('[classifier-agent] Starting...');
startClassifierWorker();
startDomainPolicyWorker();
console.log('[classifier-agent] Ready — listening on queue email.new');
