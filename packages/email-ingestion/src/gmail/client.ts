import { google, gmail_v1, Auth } from 'googleapis';
import type { EmailJob } from '@gmail-agent/shared';

export class GmailClient {
  private gmail: gmail_v1.Gmail;

  constructor(auth: Auth.OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async listMessageIds(query: string, maxResults = 100): Promise<string[]> {
    const res = await this.gmail.users.messages.list({ userId: 'me', q: query, maxResults });
    return (res.data.messages ?? []).map(m => m.id!).filter(Boolean);
  }

  async getMessage(id: string): Promise<EmailJob | null> {
    const res = await this.gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    const msg = res.data;
    if (!msg?.id) return null;

    const headers = msg.payload?.headers ?? [];
    const subject = getHeader(headers, 'Subject') ?? '(sin asunto)';
    const from = getHeader(headers, 'From') ?? '';
    const sender = extractEmail(from);
    const senderDomain = extractDomain(sender);
    const receivedAt = new Date(parseInt(msg.internalDate ?? '0')).toISOString();
    const { plain, html } = extractBody(msg.payload);

    return {
      id: msg.id,
      threadId: msg.threadId ?? '',
      subject,
      sender,
      senderDomain,
      snippet: msg.snippet ?? '',
      labels: msg.labelIds ?? [],
      receivedAt,
      body: plain || stripHtml(html),
      bodyHtml: html || undefined,
    };
  }

  async markAsRead(id: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: 'me',
      id,
      requestBody: { removeLabelIds: ['UNREAD'] },
    });
  }

  async archive(id: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: 'me',
      id,
      requestBody: { removeLabelIds: ['INBOX'] },
    });
  }

  async getLabels(): Promise<Array<{ id: string; name: string }>> {
    const res = await this.gmail.users.labels.list({ userId: 'me' });
    return (res.data.labels ?? [])
      .filter(l => l.id && l.name)
      .map(l => ({ id: l.id!, name: l.name! }));
  }
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string | null {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/);
  return (match ? match[1] : from.trim()).toLowerCase();
}

function extractDomain(email: string): string {
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : '';
}

function extractBody(part?: gmail_v1.Schema$MessagePart | null): { plain: string; html: string } {
  if (!part) return { plain: '', html: '' };

  if (part.mimeType === 'text/plain' && part.body?.data) {
    return { plain: decodeBase64(part.body.data), html: '' };
  }
  if (part.mimeType === 'text/html' && part.body?.data) {
    return { plain: '', html: decodeBase64(part.body.data) };
  }
  if (part.parts?.length) {
    let plain = '';
    let html = '';
    for (const p of part.parts) {
      const { plain: p2, html: h2 } = extractBody(p);
      if (!plain && p2) plain = p2;
      if (!html && h2) html = h2;
    }
    return { plain, html };
  }

  return { plain: '', html: '' };
}

function decodeBase64(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
