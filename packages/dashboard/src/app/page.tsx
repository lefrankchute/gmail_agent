import { db } from '@/lib/db';
import { formatCOP, formatDate } from '@/lib/utils';
import Link from 'next/link';

async function getServiceStatus() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const services = [
    'email-ingestion',
    'classifier-agent',
    'notifier-service',
    'financial-service',
    'summary-agent',
  ];

  return Promise.all(
    services.map(async service => {
      const last = await db.processLog.findFirst({
        where: { service, createdAt: { gte: tenMinutesAgo } },
        orderBy: { createdAt: 'desc' },
      });
      return { service, online: !!last, lastSeen: last?.createdAt ?? null };
    })
  );
}

async function getQuickStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [total, todayCount, unclassified, monthlyTotal, recentEmails] = await Promise.all([
    db.email.count(),
    db.email.count({ where: { processedAt: { gte: today } } }),
    db.email.count({ where: { action: 'UNCLASSIFIED' } }),
    db.transaction.aggregate({
      where: { transactionDate: { gte: firstOfMonth } },
      _sum: { amountCop: true },
    }),
    db.email.findMany({
      orderBy: { processedAt: 'desc' },
      take: 8,
      select: {
        id: true,
        subject: true,
        sender: true,
        action: true,
        category: true,
        confidence: true,
        processedAt: true,
      },
    }),
  ]);

  return { total, todayCount, unclassified, monthlyTotal, recentEmails };
}

export default async function OverviewPage() {
  const [statuses, stats] = await Promise.all([getServiceStatus(), getQuickStats()]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Resumen</h1>

      {/* Service status */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Estado de servicios
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {statuses.map(({ service, online, lastSeen }) => (
            <div key={service} className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${online ? 'bg-green-500' : 'bg-red-400'}`} />
                <span className={`text-xs font-medium ${online ? 'text-green-700' : 'text-red-600'}`}>
                  {online ? 'Online' : 'Offline'}
                </span>
              </div>
              <p className="text-xs font-medium text-gray-800 truncate">{service}</p>
              {lastSeen && (
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(lastSeen)}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Quick stats */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Correos totales', value: stats.total.toLocaleString('es-CO') },
          { label: 'Hoy procesados', value: stats.todayCount.toLocaleString('es-CO') },
          { label: 'Sin clasificar', value: stats.unclassified.toLocaleString('es-CO') },
          {
            label: 'Gastos del mes',
            value: formatCOP(Number(stats.monthlyTotal._sum.amountCop ?? 0)),
          },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 px-5 py-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </section>

      {/* Recent emails */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Correos recientes
          </h2>
          <Link href="/emails" className="text-sm text-blue-600 hover:underline">
            Ver todos →
          </Link>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Remitente', 'Asunto', 'Acción', 'Categoría', 'Confianza', 'Fecha'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.recentEmails.map(email => (
                <tr key={email.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate">{email.sender}</td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <Link href={`/emails/${email.id}`} className="text-blue-600 hover:underline truncate block">
                      {email.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${actionBadge(email.action)}`}>
                      {email.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{email.category ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${confidenceBadge(email.confidence)}`}>
                      {(email.confidence * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{formatDate(email.processedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function actionBadge(action: string) {
  const m: Record<string, string> = {
    ARCHIVE: 'bg-blue-100 text-blue-700',
    PERSONAL: 'bg-purple-100 text-purple-700',
    SUMMARY: 'bg-teal-100 text-teal-700',
    UNCLASSIFIED: 'bg-gray-100 text-gray-600',
  };
  return m[action] ?? 'bg-gray-100 text-gray-600';
}

function confidenceBadge(c: number) {
  if (c >= 0.8) return 'text-green-700 bg-green-50';
  if (c >= 0.6) return 'text-amber-700 bg-amber-50';
  return 'text-red-700 bg-red-50';
}
