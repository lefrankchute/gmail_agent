import type { NotificationProvider, RichMessage } from '@gmail-agent/shared';

export class TelegramProvider implements NotificationProvider {
  private readonly baseUrl: string;

  constructor(
    token = process.env.TELEGRAM_BOT_TOKEN!,
  ) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async sendText(to: string, text: string): Promise<void> {
    await this.call('sendMessage', { chat_id: to, text });
  }

  async sendRich(to: string, message: RichMessage): Promise<void> {
    const text = buildMarkdown(message);
    await this.call('sendMessage', { chat_id: to, text, parse_mode: 'Markdown' });
  }

  async sendMarkdown(to: string, text: string): Promise<void> {
    await this.call('sendMessage', { chat_id: to, text, parse_mode: 'Markdown' });
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/getMe`);
      return res.ok;
    } catch {
      return false;
    }
  }

  private async call(method: string, body: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Telegram ${method} failed: ${res.status} — ${error}`);
    }
  }
}

function buildMarkdown(msg: RichMessage): string {
  const lines: string[] = [];
  if (msg.title) lines.push(`*${msg.title}*`);
  if (msg.body) lines.push(msg.body);
  for (const section of msg.sections ?? []) {
    if (section.header) lines.push(`\n*${section.header}*`);
    for (const item of section.items) lines.push(`• ${item}`);
  }
  return lines.join('\n');
}
