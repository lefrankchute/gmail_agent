import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

import { startClassifierWorker } from './workers/classifier.worker';

console.log('[classifier-agent] Starting...');
startClassifierWorker();
console.log('[classifier-agent] Ready — listening on queue email:new');
