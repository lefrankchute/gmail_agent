import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

import { patchConsole, setupErrorHandlers } from '@gmail-agent/shared';
import { prisma } from './db/prisma';

patchConsole();
setupErrorHandlers('notifier-service', (error, stack) =>
  prisma.errorLog.create({ data: { service: 'notifier-service', error, stack } }).then(() => {})
);

import { TelegramProvider } from './providers/telegram.provider';
import { startNotificationWorkers } from './workers/notification.worker';

async function main() {
  console.log('[notifier-service] Starting...');

  const telegram = new TelegramProvider();
  const available = await telegram.isAvailable();
  if (!available) {
    console.warn('[notifier-service] ⚠ Telegram bot not reachable — check TELEGRAM_BOT_TOKEN');
  } else {
    console.log('[notifier-service] Telegram bot connected');
  }

  startNotificationWorkers();
  console.log('[notifier-service] Ready');
}

main().catch(err => {
  console.error('[notifier-service] Fatal:', err);
  process.exit(1);
});
