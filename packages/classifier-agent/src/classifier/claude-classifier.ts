import Anthropic from '@anthropic-ai/sdk';
import { EmailAction, type ClassificationResult, type EmailJob } from '@gmail-agent/shared';
import { CLASSIFICATION_SYSTEM_PROMPT } from './prompts';
import { isFatalApiError, fatalErrorMessage } from './claude-errors';
import { parseClaudeJson } from './parse-json';

const BODY_MAX_CHARS = 3000;

// Client created lazily so dotenv has already loaded before first call
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export async function classifyWithClaude(email: EmailJob): Promise<ClassificationResult> {
  const body = email.body.slice(0, BODY_MAX_CHARS);

  const userMessage = `Asunto: ${email.subject}
De: ${email.sender}
Etiquetas Gmail: ${email.labels.join(', ') || 'ninguna'}
Vista previa: ${email.snippet}
Cuerpo:
${body}`;

  try {
    const response = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: [
        {
          type: 'text',
          text: CLASSIFICATION_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content.find(c => c.type === 'text')?.text ?? '{}';

    try {
      const result = parseClaudeJson<{
        action?: string;
        category?: string;
        confidence?: number;
        reasoning?: string;
      }>(text);

      const validActions = Object.values(EmailAction) as string[];
      const action = validActions.includes(result.action ?? '')
        ? (result.action as EmailAction)
        : EmailAction.UNCLASSIFIED;

      const confidence = typeof result.confidence === 'number' ? result.confidence : 0.5;
      const finalAction = confidence < 0.7 ? EmailAction.UNCLASSIFIED : action;

      return {
        action: finalAction,
        category: result.category ?? 'otro',
        confidence,
        reasoning: result.reasoning ?? '',
      };
    } catch {
      console.warn(`[claude-classifier] JSON parse failed. Raw response: ${text.slice(0, 300)}`);
      return {
        action: EmailAction.UNCLASSIFIED,
        category: 'otro',
        confidence: 0,
        reasoning: 'Error al parsear respuesta de Claude',
      };
    }
  } catch (err) {
    if (isFatalApiError(err)) {
      console.error(`[claude-classifier] Fatal API error: ${fatalErrorMessage(err)}`);
      return { action: EmailAction.UNCLASSIFIED, category: 'otro', confidence: 0, reasoning: fatalErrorMessage(err) };
    }
    throw err;
  }
}
