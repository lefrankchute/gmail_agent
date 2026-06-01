function timestamp(): string {
  // ISO-like format in configured timezone: "2026-06-01 14:35:22"
  return new Date().toLocaleString('sv-SE', {
    timeZone: process.env.TIMEZONE ?? 'America/Bogota',
  });
}

/** Patches global console.log/warn/error/info to prepend a timestamp. Call once at service startup. */
export function patchConsole(): void {
  const _log   = console.log.bind(console);
  const _warn  = console.warn.bind(console);
  const _error = console.error.bind(console);
  const _info  = console.info.bind(console);

  console.log   = (...args: unknown[]) => _log(`[${timestamp()}]`, ...args);
  console.warn  = (...args: unknown[]) => _warn(`[${timestamp()}]`, ...args);
  console.error = (...args: unknown[]) => _error(`[${timestamp()}]`, ...args);
  console.info  = (...args: unknown[]) => _info(`[${timestamp()}]`, ...args);
}

/** Callback type used to persist an error to the DB from within each service. */
export type ErrorLogFn = (error: string, stack?: string, context?: Record<string, unknown>) => Promise<void>;

/**
 * Installs process-level handlers for uncaught exceptions and unhandled promise rejections.
 * @param service  Service name written to the log line.
 * @param logError Optional async callback that persists the error to the DB.
 */
export function setupErrorHandlers(service: string, logError?: ErrorLogFn): void {
  process.on('uncaughtException', (err: Error) => {
    console.error(`[${service}] Uncaught exception: ${err.message}`);
    logError?.(err.message, err.stack).catch(() => {});
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    console.error(`[${service}] Unhandled rejection: ${err.message}`);
    logError?.(err.message, err.stack).catch(() => {});
  });
}
