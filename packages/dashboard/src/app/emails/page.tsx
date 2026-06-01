import { db } from '@/lib/db';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

const PAGE_SIZE = 25;

interface SearchParams {
  page?: string;
  action?: string;
  category?: string;
  from?: string;
  to?: string;
  sender?: string;
}

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const page = Math.max(1, parseInt(searchParams.page ?? '1'));
  const action = searchParams.action || undefined;
  const category = searchParams.category || undefined;
  const from = searchParams.from || undefined;
  const to = searchParams.to || undefined;
  const sender = searchParams.sender || undefined;

  const where = {
    ...(action ? { action: action as 'ARCHIVE' | 'PERSONAL' | 'SUMMARY' | 'UNCLASSIFIED' } : {}),
    ...(category ? { category: { contains: category, mode: 'insensitive' as const } } : {}),
    ...(sender ? { sender: { contains: sender, mode: 'insensitive' as const } } : {}),
    ...(from || to
      ? { receivedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {}),
  };

  const [emails, total] = await Promise.all([
    db.email.findMany({
      where,
      orderBy: { processedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        subject: true,
        sender: true,
        action: true,
        category: true,
        confidence: true,
        isHistorical: true,
        processedAt: true,
        receivedAt: true,
      },
    }),
    db.email.count({ where }),
  ]);

  const pages = Math.ceil(total / PAGE_SIZE);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (p > 1) params.set('page', String(p));
    if (action) params.set('action', action);
    if (category) params.set('category', category);
    if (sender) params.set('sender', sender);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return `/emails?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Correos</h1>

      {/* Filters */}
      <form method="GET" className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Acción</label>
            <select
              name="action"
              defaultValue={action ?? ''}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">Todas</option>
              <option value="ARCHIVE">ARCHIVE</option>
              <option value="PERSONAL">PERSONAL</option>
              <option value="SUMMARY">SUMMARY</option>
              <option value="UNCLASSIFIED">UNCLASSIFIED</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Categoría</label>
            <input
              name="category"
              defaultValue={category ?? ''}
              placeholder="banco, trabajo…"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Remitente</label>
            <input
              name="sender"
              defaultValue={sender ?? ''}
              placeholder="@gmail.com"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              name="from"
              defaultValue={from ?? ''}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              name="to"
              defaultValue={to ?? ''}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button
            type="submit"
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Filtrar
          </button>
          <Link
            href="/emails"
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
          >
            Limpiar
          </Link>
          <span className="ml-auto text-sm text-gray-400">{total.toLocaleString('es-CO')} correos</span>
        </div>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Remitente', 'Asunto', 'Acción', 'Categoría', 'Confianza', 'Recibido'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {emails.map(email => (
              <tr key={email.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate text-xs">{email.sender}</td>
                <td className="px-4 py-3 max-w-[280px]">
                  <Link href={`/emails/${email.id}`} className="text-blue-600 hover:underline truncate block">
                    {email.subject}
                  </Link>
                  {email.isHistorical && (
                    <span className="text-xs text-gray-400">histórico</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${actionBadge(email.action)}`}>
                    {email.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{email.category ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${confidenceBadge(email.confidence)}`}>
                    {(email.confidence * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                  {formatDate(email.receivedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {emails.length === 0 && (
          <div className="text-center py-12 text-gray-400">No hay correos con estos filtros.</div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <span className="text-sm text-gray-500">
              Página {page} de {pages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={pageUrl(page - 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  ← Anterior
                </Link>
              )}
              {page < pages && (
                <Link
                  href={pageUrl(page + 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Siguiente →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
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
