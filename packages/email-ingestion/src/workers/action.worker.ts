import { Worker } from 'bullmq';
import { QUEUE_NAMES, EmailAction, type ClassifiedEmailJob } from '@gmail-agent/shared';
import { getConnectionOptions } from '../queues/index';
import { GmailClient } from '../gmail/client';
import { getAuthenticatedClient } from '../gmail/auth';

const AGENT_LABEL_NAMES = [
  'Agente/bancos',
  'Agente/aerolíneas',
  'Agente/compras',
  'Agente/trabajo',
  'Agente/redes_sociales',
  'Agente/personal',
  'Agente/suscripciones',
  'Agente/gobierno',
  'Agente/otro',
  'Agente/resúmenes',
  'Agente/pendiente',
];

async function ensureAgentLabels(
  gmailClient: GmailClient
): Promise<Map<string, string>> {
  const existing = await gmailClient.getLabels();
  const nameToId = new Map(existing.map(l => [l.name, l.id]));

  for (const labelName of AGENT_LABEL_NAMES) {
    if (!nameToId.has(labelName)) {
      const created = await gmailClient.createLabel(labelName);
      nameToId.set(created.name, created.id);
      console.log(`[action] Created label: ${labelName}`);
    }
  }

  return nameToId;
}

export async function startActionWorker(): Promise<void> {
  const gmailClient = new GmailClient(getAuthenticatedClient());
  const labelNameToId = await ensureAgentLabels(gmailClient);

  const worker = new Worker<ClassifiedEmailJob>(
    QUEUE_NAMES.EMAIL_CLASSIFIED,
    async job => {
      const { emailId, action, targetLabelName, source } = job.data;

      // Label-scanner emails are already in the correct user label — just mark as read
      if (source === 'label_scanner') {
        await gmailClient.markAsRead(emailId);
        console.log(`[action] ${emailId} → markAsRead (label_scanner)`);
        return;
      }

      // Look up the Gmail label ID for the suggested label
      const labelId = targetLabelName ? labelNameToId.get(targetLabelName) : undefined;

      if (action === EmailAction.UNCLASSIFIED) {
        // Only add the pending label — leave in inbox, leave unread
        if (labelId) await gmailClient.applyLabel(emailId, labelId);
        console.log(`[action] ${emailId} → UNCLASSIFIED (label: ${targetLabelName ?? 'none'})`);
        return;
      }

      // PERSONAL and SUMMARY: stay in inbox, apply label, mark as read
      if (action === EmailAction.PERSONAL || action === EmailAction.SUMMARY) {
        if (labelId) await gmailClient.applyLabel(emailId, labelId);
        await gmailClient.markAsRead(emailId);
        console.log(`[action] ${emailId} → ${action} (label: ${targetLabelName ?? 'none'})`);
        return;
      }

      // ARCHIVE: apply label, remove from inbox, mark as read
      if (action === EmailAction.ARCHIVE) {
        if (labelId) {
          await gmailClient.moveEmail(emailId, labelId, true);
        } else {
          await gmailClient.markAsRead(emailId);
          await gmailClient.archive(emailId);
        }
        console.log(`[action] ${emailId} → ARCHIVE (label: ${targetLabelName ?? 'none'})`);
      }
    },
    { connection: getConnectionOptions(), concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    console.error(`[action] Job ${job?.id} failed: ${err.message}`);
  });

  console.log('[action] Action worker started');
}
