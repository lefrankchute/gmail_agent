import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES, type EmailJob } from '@gmail-agent/shared';
import { getConnectionOptions } from '../queues/index';
import { GmailClient } from '../gmail/client';
import { getAuthenticatedClient } from '../gmail/auth';
import { prisma } from '../db/prisma';

const PROCESSED_SET = 'gmail:processed_emails';
const SCAN_INTERVAL_MS = parseInt(process.env.LABEL_SCANNER_INTERVAL_MIN ?? '15') * 60 * 1000;
const UNREAD_LIMIT_PER_LABEL = 100;

const SYSTEM_LABEL_IDS = new Set([
  'INBOX', 'SENT', 'DRAFTS', 'DRAFT', 'SPAM', 'TRASH',
  'UNREAD', 'STARRED', 'IMPORTANT', 'CATEGORY_PERSONAL',
  'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS',
]);

export async function startLabelScannerWorker(): Promise<void> {
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  redis.on('error', err => console.error('[label-scanner] Redis error:', err.message));

  const emailQueue = new Queue<EmailJob>(QUEUE_NAMES.EMAIL_NEW, {
    connection: getConnectionOptions(),
  });

  const gmailClient = new GmailClient(getAuthenticatedClient());

  const scan = async () => {
    try {
      const userLabels = await prisma.gmailLabel.findMany({
        where: { type: 'user', isVisible: true },
      });

      let queued = 0;

      for (const label of userLabels) {
        if (SYSTEM_LABEL_IDS.has(label.gmailId)) continue;

        const messageIds = await gmailClient.listUnreadInLabel(label.gmailId, UNREAD_LIMIT_PER_LABEL);

        for (const id of messageIds) {
          const alreadyProcessed = await redis.sismember(PROCESSED_SET, id);
          if (alreadyProcessed) continue;

          const email = await gmailClient.getMessage(id);
          if (!email) continue;

          await emailQueue.add(
            'process',
            { ...email, source: 'label_scanner' as const },
            {
              removeOnComplete: 100,
              removeOnFail: 50,
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
            }
          );
          await redis.sadd(PROCESSED_SET, id);
          queued++;
        }
      }

      if (queued > 0) console.log(`[label-scanner] Queued ${queued} unread email(s) from labels`);
    } catch (err) {
      console.error('[label-scanner] Scan error:', (err as Error).message);
    }
  };

  await scan();
  setInterval(scan, SCAN_INTERVAL_MS);
  console.log(`[label-scanner] Started — interval: ${process.env.LABEL_SCANNER_INTERVAL_MIN ?? 15} minutes`);
}
