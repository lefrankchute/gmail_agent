import { Queue } from 'bullmq';
import { QUEUE_NAMES, type MoveProposalJob } from '@gmail-agent/shared';
import { getConnectionOptions } from '../queues/index';
import { GmailClient } from '../gmail/client';
import { getAuthenticatedClient } from '../gmail/auth';
import { prisma } from '../db/prisma';

const ADVISOR_INTERVAL_MS = parseInt(process.env.INBOX_ADVISOR_INTERVAL_MIN ?? '10') * 60 * 1000;
const INBOX_FETCH_LIMIT = 100;

export async function startInboxAdvisorWorker(): Promise<void> {
  const gmailClient = new GmailClient(getAuthenticatedClient());
  const moveQueue = new Queue<MoveProposalJob>(QUEUE_NAMES.EMAIL_MOVE_PROPOSAL, {
    connection: getConnectionOptions(),
  });

  const advise = async () => {
    try {
      const messageIds = await gmailClient.listMessageIds('in:inbox', INBOX_FETCH_LIMIT);
      let proposals = 0;

      for (const id of messageIds) {
        // Skip if already processed
        const existing = await prisma.email.findUnique({ where: { id } });
        if (existing) continue;

        const email = await gmailClient.getMessage(id);
        if (!email) continue;

        const match = await findRule(email.sender, email.senderDomain, email.subject);
        if (!match) continue;

        await moveQueue.add('move', {
          emailId: id,
          targetLabelId: match.labelId,
          targetLabelName: match.labelName,
          reason: match.reason,
        });
        proposals++;
      }

      if (proposals > 0) console.log(`[inbox-advisor] Proposed ${proposals} move(s)`);
    } catch (err) {
      console.error('[inbox-advisor] Error:', (err as Error).message);
    }
  };

  await advise();
  setInterval(advise, ADVISOR_INTERVAL_MS);
  console.log(`[inbox-advisor] Started — interval: ${process.env.INBOX_ADVISOR_INTERVAL_MIN ?? 10} minutes`);
}

async function findRule(
  sender: string,
  senderDomain: string,
  subject: string
): Promise<{ labelId: string; labelName: string; reason: string } | null> {
  // 1. Check Gmail filters
  const filters = await prisma.gmailFilter.findMany();
  for (const filter of filters) {
    const criteria = filter.criteria as { from?: string; to?: string; subject?: string; query?: string };
    const actions = filter.actions as { addLabelIds?: string[]; removeLabelIds?: string[] };

    if (!actions.addLabelIds?.length) continue;

    const fromMatch = criteria.from && sender.toLowerCase().includes(criteria.from.toLowerCase());
    const subjectMatch = criteria.subject && subject.toLowerCase().includes(criteria.subject.toLowerCase());

    if (fromMatch || subjectMatch) {
      const targetLabelId = actions.addLabelIds[0];
      const labelRecord = await prisma.gmailLabel.findUnique({ where: { gmailId: targetLabelId } });
      if (labelRecord) {
        return { labelId: targetLabelId, labelName: labelRecord.name, reason: 'gmail_filter' };
      }
    }
  }

  // 2. Check learned classification rules
  const rules = await prisma.classificationRule.findMany({
    where: { isActive: true },
    orderBy: { priority: 'desc' },
  });

  for (const rule of rules) {
    const domainMatch = rule.senderDomain && senderDomain.toLowerCase() === rule.senderDomain.toLowerCase();
    const emailMatch = rule.senderEmail && sender.toLowerCase() === rule.senderEmail.toLowerCase();

    if (domainMatch || emailMatch) {
      if (!rule.gmailLabel) continue;
      const labelRecord = await prisma.gmailLabel.findFirst({
        where: { name: rule.gmailLabel },
      });
      if (labelRecord) {
        return { labelId: labelRecord.gmailId, labelName: rule.gmailLabel, reason: 'classification_rule' };
      }
    }
  }

  return null;
}
