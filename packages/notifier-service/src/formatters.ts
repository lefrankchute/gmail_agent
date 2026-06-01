import type { UrgentNotificationData } from '@gmail-agent/shared';

export function formatUrgentNotification(data: UrgentNotificationData): string {
  if (data.type === 'airline_ticket' && data.flightData) {
    const f = data.flightData;
    const date = formatDate(f.departureDate);
    const flight = f.flightNumber ? `${f.airline} ${f.flightNumber}` : f.airline;
    const reservation = f.reservationCode ? ` | Reserva: #${f.reservationCode}` : '';
    return [
      `✈️ *TIQUETE CONFIRMADO*`,
      `Vuelo: ${flight} | Ruta: ${f.origin} → ${f.destination}`,
      `Fecha: ${date}${reservation}`,
    ].join('\n');
  }

  if (data.type === 'fraud') {
    return [
      `🚨 *ALERTA DE SEGURIDAD*`,
      `Asunto: ${data.subject}`,
      `De: ${data.sender}`,
      `Revisa tu cuenta de inmediato.`,
    ].join('\n');
  }

  return `⚠️ Notificación urgente\n${data.subject}`;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
