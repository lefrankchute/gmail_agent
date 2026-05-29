/** Parse REDIS_URL into BullMQ-compatible connection options (avoids ioredis version conflicts). */
export function getConnectionOptions(): { host: string; port: number } {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return { host: url.hostname, port: parseInt(url.port || '6379') };
}
