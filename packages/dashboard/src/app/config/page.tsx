import { db } from '@/lib/db';

async function getConfigStats() {
  const [totalEmails, unclassified, rules, historicalJobs] = await Promise.all([
    db.email.count(),
    db.email.count({ where: { action: 'UNCLASSIFIED' } }),
    db.classificationRule.count({ where: { isActive: true } }),
    db.historicalJob.findMany({ orderBy: { startedAt: 'desc' }, take: 5 }),
  ]);
  return { totalEmails, unclassified, rules, historicalJobs };
}

function envStatus(key: string): boolean {
  return !!process.env[key];
}

export default async function ConfigPage() {
  const stats = await getConfigStats();

  const envItems = [
    { key: 'GMAIL_CLIENT_ID', label: 'Gmail Client ID' },
    { key: 'GMAIL_CLIENT_SECRET', label: 'Gmail Client Secret' },
    { key: 'GMAIL_REFRESH_TOKEN', label: 'Gmail Refresh Token' },
    { key: 'TELEGRAM_BOT_TOKEN', label: 'Telegram Bot Token' },
    { key: 'TELEGRAM_CHAT_ID', label: 'Telegram Chat ID' },
    { key: 'DATABASE_URL', label: 'Database URL' },
    { key: 'REDIS_URL', label: 'Redis URL' },
    { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key' },
  ];

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>

      {/* Environment variables */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Variables de entorno
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {envItems.map(({ key, label }) => {
            const ok = envStatus(key);
            return (
              <div key={key} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-400 font-mono">{key}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {ok ? '✓ Configurado' : '✗ Faltante'}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Stats */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Estadísticas del sistema
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Correos totales', value: stats.totalEmails.toLocaleString('es-CO') },
            { label: 'Sin clasificar', value: stats.unclassified.toLocaleString('es-CO') },
            { label: 'Reglas activas', value: stats.rules.toLocaleString('es-CO') },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Historical jobs */}
      {stats.historicalJobs.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Procesador histórico
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {stats.historicalJobs.map(job => (
              <div key={job.id} className="px-5 py-3 flex flex-wrap items-center gap-4">
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusBadge(job.status)}`}>
                  {job.status}
                </span>
                <span className="text-sm text-gray-600">
                  Encolados: <strong>{job.totalQueued}</strong>
                </span>
                {job.errors > 0 && (
                  <span className="text-sm text-red-600">
                    Errores: <strong>{job.errors}</strong>
                  </span>
                )}
                <span className="text-xs text-gray-400 ml-auto">
                  {new Intl.DateTimeFormat('es-CO', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'America/Bogota',
                  }).format(new Date(job.startedAt))}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function statusBadge(status: string) {
  const m: Record<string, string> = {
    running: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-600',
    paused: 'bg-amber-100 text-amber-700',
  };
  return m[status] ?? 'bg-gray-100 text-gray-600';
}
