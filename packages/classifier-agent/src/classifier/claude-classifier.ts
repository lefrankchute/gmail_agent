import Anthropic from '@anthropic-ai/sdk';
import { EmailAction, type ClassificationResult, type EmailJob } from '@gmail-agent/shared';
import { CLASSIFICATION_SYSTEM_PROMPT } from './prompts';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BODY_MAX_CHARS = 3000;

export async function classifyWithClaude(email: EmailJob): Promise<ClassificationResult> {
  const body = email.body.slice(0, BODY_MAX_CHARS);

  const userMessage = `Asunto: ${email.subject}
De: ${email.sender}
Etiquetas Gmail: ${email.labels.join(', ') || 'ninguna'}
Vista previa: ${email.snippet}
Cuerpo:
${body}`;

  const response = await client.messages.create({
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
    const result = JSON.parse(text) as {
      action?: string;
      category?: string;
      confidence?: number;
      reasoning?: string;
    };

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
    return {
      action: EmailAction.UNCLASSIFIED,
      category: 'otro',
      confidence: 0,
      reasoning: 'Error al parsear respuesta de Claude',
    };
  }
}
