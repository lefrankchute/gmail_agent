import { Worker } from 'bullmq';
import { QUEUE_NAMES, EmailAction, type ClassifiedEmailJob } from '@gmail-agent/shared';
import { getConnectionOptions } from '../queues/index';
import { GmailClient } from '../gmail/client';
import { getAuthenticatedClient } from '../gmail/auth';

export function startActionWorker(): void {
  const gmailClient = new GmailClient(getAuthenticatedClient());

  const worker = new Worker<ClassifiedEmailJob>(
    QUEUE_NAMES.EMAIL_CLASSIFIED,
    async job => {
      const { emailId, action } = job.data;

      // Always mark as read — the agent has processed the email
      await gmailClient.markAsRead(emailId);

      if (action === EmailAction.ARCHIVE) {
        await gmailClient.archive(emailId);
      }

      console.log(`[action] ${emailId} → ${action}`);
    },
    { connection: getConnectionOptions(), concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    console.error(`[action] Job ${job?.id} failed: ${err.message}`);
  });

  console.log('[action] Action worker started');
}
