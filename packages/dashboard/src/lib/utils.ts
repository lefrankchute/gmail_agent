export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: process.env.TIMEZONE ?? 'America/Bogota',
  }).format(new Date(date));
}

export function formatShortDate(date: Date | string): string {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: process.env.TIMEZONE ?? 'America/Bogota',
  }).format(new Date(date));
}

export function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-600 bg-green-50';
  if (confidence >= 0.6) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
}

export function actionColor(action: string): string {
  const map: Record<string, string> = {
    ARCHIVE: 'bg-blue-100 text-blue-700',
    PERSONAL: 'bg-purple-100 text-purple-700',
    SUMMARY: 'bg-teal-100 text-teal-700',
    UNCLASSIFIED: 'bg-gray-100 text-gray-600',
  };
  return map[action] ?? 'bg-gray-100 text-gray-600';
}

export function monthName(month: number): string {
  return new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(
    new Date(2026, month - 1, 1)
  );
}
