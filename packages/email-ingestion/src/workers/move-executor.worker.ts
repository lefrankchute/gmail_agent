import { Worker } from 'bullmq';
import { EmailAction } from '@prisma/client';
import { QUEUE_NAMES, type MoveProposalJob } from '@gmail-agent/shared';
import { getConnectionOptions } from '../queues/index';
import { GmailClient } from '../gmail/client';
import { getAuthenticatedClient } from '../gmail/auth';
import { prisma } from '../db/prisma';

export function startMoveExecutorWorker(): void {
  const gmailClient = new GmailClient(getAuthenticatedClient());

  const worker = new Worker<MoveProposalJob>(
    QUEUE_NAMES.EMAIL_MOVE_PROPOSAL,
    async job => {
      const { emailId, targetLabelId, targetLabelName, reason } = job.data;

      // Skip if already processed (race condition guard)
      const existing = await prisma.email.findUnique({ where: { id: emailId } });
      if (existing) return;

      const email = await gmailClient.getMessage(emailId);
      if (!email) return;

      // Apply the move in Gmail
      await gmailClient.moveEmail(emailId, targetLabelId, true);

      // Record in DB with confidence 1.0 (rule-based, deterministic)
      await prisma.email.create({
        data: {
          id: email.id,
          threadId: email.threadId,
          subject: email.subject,
          sender: email.sender,
          senderDomain: email.senderDomain,
          receivedAt: new Date(email.receivedAt),
          labels: email.labels,
          action: EmailAction.ARCHIVE,
          category: targetLabelName,
          confidence: 1.0,
          reasoning: `Movido por regla: ${reason}`,
          isHistorical: false,
        },
      });

      console.log(`[move-executor] ${emailId} → ${targetLabelName} (${reason})`);
    },
    { connection: getConnectionOptions(), concurrency: 3 }
  );

  worker.on('failed', (job, err) => {
    console.error(`[move-executor] Job ${job?.id} failed: ${err.message}`);
  });

  console.log('[move-executor] Move executor worker started');
}
