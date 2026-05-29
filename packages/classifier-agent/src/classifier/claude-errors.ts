import Anthropic from '@anthropic-ai/sdk';

/** Errors where retrying won't help — bad key, no credits, plan limit. */
export function isFatalApiError(error: unknown): boolean {
  if (error instanceof Anthropic.AuthenticationError) return true;   // 401
  if (error instanceof Anthropic.PermissionDeniedError) return true; // 403
  if (error instanceof Anthropic.APIError) {
    if (error.status === 402) return true; // Payment required
    if (error.status === 400) {
      const msg = error.message.toLowerCase();
      if (msg.includes('credit') || msg.includes('billing') || msg.includes('quota')) return true;
    }
  }
  return false;
}

export function fatalErrorMessage(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'API key de Anthropic inválida — verifica ANTHROPIC_API_KEY en .env';
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return 'Sin acceso a la API de Anthropic — verifica permisos de la cuenta';
  }
  if (error instanceof Anthropic.APIError && (error.status === 402 || error.message.toLowerCase().includes('credit'))) {
    return 'Sin crédito en Anthropic — recarga el balance en console.anthropic.com';
  }
  return `Error fatal de Anthropic: ${(error as Error).message}`;
}
