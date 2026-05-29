import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

import { Queue } from 'bullmq';
import { getConnectionOptions } from '../queues/index';
import { QUEUE_NAMES } from '@gmail-agent/shared';

async function main() {
  const conn = getConnectionOptions();
  const queue = new Queue(QUEUE_NAMES.EMAIL_NEW, { connection: conn });

  const failed = await queue.getJobs(['failed'], 0, 1000);
  console.log(`Jobs fallidos encontrados: ${failed.length}`);

  for (const job of failed) {
    await job.retry('failed');
  }

  console.log(`${failed.length} jobs movidos a waiting.`);
  await queue.close();
}

main().catch(console.error);
