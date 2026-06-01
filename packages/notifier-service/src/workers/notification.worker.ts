import { Worker } from 'bullmq';
import {
  QUEUE_NAMES,
  type UrgentNotificationData,
  type SendNotificationJob,
} from '@gmail-agent/shared';
import { TelegramProvider } from '../providers/telegram.provider';
import { formatUrgentNotification } from '../formatters';

function getConnectionOptions(): { host: string; port: number } {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return { host: url.hostname, port: parseInt(url.port || '6379') };
}

export function startNotificationWorkers(): void {
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const telegram = new TelegramProvider();
  const conn = getConnectionOptions();

  // Urgent queue — flight tickets, fraud alerts (concurrency: 1, high priority)
  const urgentWorker = new Worker<UrgentNotificationData>(
    QUEUE_NAMES.NOTIFICATION_URGENT,
    async job => {
      const text = formatUrgentNotification(job.data);
      await telegram.sendMarkdown(chatId, text);
      console.log(`[notifier] Urgent sent: ${job.data.type} | ${job.data.emailId}`);
    },
    { connection: conn, concurrency: 1 }
  );

  // Standard queue — daily summaries and other notifications
  const sendWorker = new Worker<SendNotificationJob>(
    QUEUE_NAMES.NOTIFICATION_SEND,
    async job => {
      const { text, parseMode } = job.data;
      if (parseMode) {
        await telegram.sendMarkdown(chatId, text);
      } else {
        await telegram.sendText(chatId, text);
      }
      console.log(`[notifier] Sent: ${text.slice(0, 60).replace(/\n/g, ' ')}…`);
    },
    { connection: conn, concurrency: 1 }
  );

  urgentWorker.on('failed', (job, err) =>
    console.error(`[notifier] Urgent job ${job?.id} failed: ${err.message}`)
  );
  sendWorker.on('failed', (job, err) =>
    console.error(`[notifier] Send job ${job?.id} failed: ${err.message}`)
  );

  console.log('[notifier] Workers started (urgent + send)');
}
