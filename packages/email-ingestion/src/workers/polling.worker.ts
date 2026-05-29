import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES, type EmailJob } from '@gmail-agent/shared';
import { getConnectionOptions } from '../queues/index';
import { GmailClient } from '../gmail/client';
import { getAuthenticatedClient } from '../gmail/auth';

const LAST_CHECK_KEY = 'gmail:last_check';
const PROCESSED_SET = 'gmail:processed_emails';
const POLL_INTERVAL_MS = 5 * 60 * 1000;

export async function startPollingWorker(): Promise<void> {
  // IORedis used only for direct Redis commands (get/set/sadd/sismember)
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  redis.on('error', err => console.error('[redis] Error:', err.message));

  // BullMQ Queue uses plain connection options (avoids ioredis version conflict)
  const emailQueue = new Queue<EmailJob>(QUEUE_NAMES.EMAIL_NEW, {
    connection: getConnectionOptions(),
  });

  const gmailClient = new GmailClient(getAuthenticatedClient());

  const poll = async () => {
    try {
      const lastCheck = await redis.get(LAST_CHECK_KEY);
      // Default: 1 hour ago on first run to avoid re-processing old emails
      const lastCheckTs = lastCheck ? parseInt(lastCheck) : Date.now() - 60 * 60 * 1000;
      const afterSecs = Math.floor(lastCheckTs / 1000);
      const now = Date.now();

      const messageIds = await gmailClient.listMessageIds(`in:inbox after:${afterSecs}`);
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

      await redis.set(LAST_CHECK_KEY, now.toString());
      if (queued > 0) console.log(`[polling] Queued ${queued} new email(s)`);
    } catch (err) {
      console.error('[polling] Poll cycle error:', (err as Error).message);
    }
  };

  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
  console.log('[polling] Started — interval: 5 minutes');
}
