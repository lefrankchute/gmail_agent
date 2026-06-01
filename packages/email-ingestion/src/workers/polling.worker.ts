import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES, type EmailJob } from '@gmail-agent/shared';
import { getConnectionOptions } from '../queues/index';
import { GmailClient } from '../gmail/client';
import { getAuthenticatedClient } from '../gmail/auth';

const PROCESSED_SET = 'gmail:processed_emails';
const POLL_INTERVAL_MS = parseInt(process.env.POLLING_INTERVAL_MIN ?? '5') * 60 * 1000;
const FETCH_LIMIT = 200;

export async function startPollingWorker(): Promise<void> {
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  redis.on('error', err => console.error('[redis] Error:', err.message));

  const emailQueue = new Queue<EmailJob>(QUEUE_NAMES.EMAIL_NEW, {
    connection: getConnectionOptions(),
  });

  const gmailClient = new GmailClient(getAuthenticatedClient());

  const poll = async () => {
    try {
      // Fetch the most recent N inbox messages; Redis SET provides deduplication
      const messageIds = await gmailClient.listMessageIds('in:inbox', FETCH_LIMIT);
      let queued = 0;

      for (const id of messageIds) {
        const alreadyProcessed = await redis.sismember(PROCESSED_SET, id);
        if (alreadyProcessed) continue;

        const email = await gmailClient.getMessage(id);
        if (!email) continue;

        await emailQueue.add('process', email, {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        });
        await redis.sadd(PROCESSED_SET, id);
        queued++;
      }

      if (queued > 0) console.log(`[polling] Queued ${queued} new email(s)`);
    } catch (err) {
      console.error('[polling] Poll cycle error:', (err as Error).message);
    }
  };

  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
  console.log(`[polling] Started — interval: ${process.env.POLLING_INTERVAL_MIN ?? 5} minutes`);
}
