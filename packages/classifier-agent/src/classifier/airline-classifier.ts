import Anthropic from '@anthropic-ai/sdk';
import { type EmailJob, type FlightData } from '@gmail-agent/shared';
import { AIRLINE_SYSTEM_PROMPT } from './prompts';
import { isFatalApiError, fatalErrorMessage } from './claude-errors';
import { parseClaudeJson } from './parse-json';

const BODY_MAX_CHARS = 4000;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export async function detectAirlineTicket(email: EmailJob): Promise<FlightData | null> {
  const body = email.body.slice(0, BODY_MAX_CHARS);

  try {
    const response = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: AIRLINE_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: `Asunto: ${email.subject}\nDe: ${email.sender}\n\n${body}` },
      ],
    });

    const text = response.content.find(c => c.type === 'text')?.text ?? '{}';

    try {
      const result = parseClaudeJson<{
        isTicket?: boolean;
        confidence?: number;
        flightData?: {
          airline?: string;
          origin?: string;
          destination?: string;
          departureDate?: string;
          reservationCode?: string | null;
          flightNumber?: string | null;
        };
      }>(text);

      const confidence = typeof result.confidence === 'number' ? result.confidence : 0.5;
      if (!result.isTicket || confidence < 0.7 || !result.flightData) return null;

      const fd = result.flightData;
      return {
        airline: fd.airline ?? '',
        origin: fd.origin ?? '',
        destination: fd.destination ?? '',
        departureDate: fd.departureDate ?? email.receivedAt,
        reservationCode: fd.reservationCode ?? undefined,
        flightNumber: fd.flightNumber ?? undefined,
      };
    } catch {
      return null;
    }
  } catch (err) {
    if (isFatalApiError(err)) {
      console.error(`[airline-classifier] Fatal API error: ${fatalErrorMessage(err)}`);
      return null;
    }
    throw err;
  }
}
