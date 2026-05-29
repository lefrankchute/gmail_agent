import express, { type Application, type Request, type Response } from 'express';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES, type EmailJob } from '@gmail-agent/shared';
import { getConnectionOptions } from './queues/index';
import { GmailClient } from './gmail/client';
import { getAuthenticatedClient } from './gmail/auth';

const PROCESSED_SET = 'gmail:processed_emails';

export function createServer(): Application {
  const app = express();
  app.use(express.json());

  const emailQueue = new Queue<EmailJob>(QUEUE_NAMES.EMAIL_NEW, {
    connection: getConnectionOptions(),
  });
  const gmailClient = new GmailClient(getAuthenticatedClient());
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  // Gmail Pub/Sub push notification (active after Phase 7 VPS deployment)
  app.post('/webhook/gmail', async (req: Request, res: Response) => {
    try {
      const body = req.body as { message?: { data?: string } };
      if (!body.message?.data) {
        res.status(400).json({ error: 'Invalid Pub/Sub message' });
        return;
      }

      const data = JSON.parse(
        Buffer.from(body.message.data, 'base64').toString()
      ) as { emailAddress?: string; historyId?: string };

      console.log(`[webhook] Notification: ${data.emailAddress}, historyId: ${data.historyId}`);

      const afterSecs = Math.floor((Date.now() - 2 * 60 * 1000) / 1000);
      const messageIds = await gmailClient.listMessageIds(`in:inbox after:${afterSecs}`);

      let queued = 0;
      for (const id of messageIds) {
        const alreadyProcessed = await redis.sismember(PROCESSED_SET, id);
        if (alreadyProcessed) continue;

        const email = await gmailClient.getMessage(id);
        if (!email) continue;

        await emailQueue.add('process', email, { removeOnComplete: 100, removeOnFail: 50 });
        await redis.sadd(PROCESSED_SET, id);
        queued++;
      }

      if (queued > 0) console.log(`[webhook] Queued ${queued} email(s)`);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[webhook] Error:', (err as Error).message);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'email-ingestion', timestamp: new Date().toISOString() });
  });

  return app;
}
