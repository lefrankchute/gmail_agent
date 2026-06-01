import { GmailClient } from '../gmail/client';
import { getAuthenticatedClient } from '../gmail/auth';
import { prisma } from '../db/prisma';

const SYNC_INTERVAL_MS = parseInt(process.env.LABEL_SYNC_INTERVAL_MIN ?? '60') * 60 * 1000;

export async function startLabelSyncWorker(): Promise<void> {
  const gmailClient = new GmailClient(getAuthenticatedClient());

  const sync = async () => {
    try {
      await syncLabels(gmailClient);
      await syncFilters(gmailClient);
      console.log('[label-sync] Sync completed');
    } catch (err) {
      console.error('[label-sync] Sync failed:', (err as Error).message);
    }
  };

  await sync();
  setInterval(sync, SYNC_INTERVAL_MS);
  console.log(`[label-sync] Started — interval: ${process.env.LABEL_SYNC_INTERVAL_MIN ?? 60} minutes`);
}

async function syncLabels(client: GmailClient): Promise<void> {
  const labels = await client.getAllLabels();

  await Promise.all(
    labels.map(label =>
      prisma.gmailLabel.upsert({
        where: { gmailId: label.gmailId },
        create: label,
        update: { name: label.name, type: label.type, isVisible: label.isVisible, syncedAt: new Date() },
      })
    )
  );
}

async function syncFilters(client: GmailClient): Promise<void> {
  const filters = await client.listFilters();

  await Promise.all(
    filters.map(f =>
      prisma.gmailFilter.upsert({
        where: { gmailFilterId: f.gmailFilterId },
        create: f,
        update: { criteria: f.criteria, actions: f.actions, syncedAt: new Date() },
      })
    )
  );
}
