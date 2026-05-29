import Anthropic from '@anthropic-ai/sdk';
import { type EmailJob, type FlightData } from '@gmail-agent/shared';
import { AIRLINE_SYSTEM_PROMPT } from './prompts';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BODY_MAX_CHARS = 4000;

export async function detectAirlineTicket(email: EmailJob): Promise<FlightData | null> {
  const body = email.body.slice(0, BODY_MAX_CHARS);

  const response = await client.messages.create({
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
    const result = JSON.parse(text) as {
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
    };

    const confidence = typeof result.confidence === 'number' ? result.confidence : 0.5;

    if (!result.isTicket || confidence < 0.7 || !result.flightData) {
      return null;
    }

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
}
