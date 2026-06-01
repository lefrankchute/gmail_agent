import { db } from '@/lib/db';
import { formatCOP, formatDate } from '@/lib/utils';
import Link from 'next/link';

const PAGE_SIZE = 30;

interface SearchParams {
  year?: string;
  month?: string;
  page?: string;
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const now = new Date();
  const year = parseInt(searchParams.year ?? String(now.getFullYear()));
  const month = parseInt(searchParams.month ?? String(now.getMonth() + 1));
  const page = Math.max(1, parseInt(searchParams.page ?? '1'));

  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 1);

  const [transactions, total, storedReport] = await Promise.all([
    db.transaction.findMany({
      where: { transactionDate: { gte: from, lt: to } },
      orderBy: { transactionDate: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { email: { select: { subject: true } } },
    }),
    db.transaction.count({ where: { transactionDate: { gte: from, lt: to } } }),
    db.monthlyReport.findUnique({ where: { year_month: { year, month } } }),
  ]);

  const pages = Math.ceil(total / PAGE_SIZE);
  const monthTotalAgg = await db.transaction.aggregate({
    where: { transactionDate: { gte: from, lt: to } },
    _sum: { amountCop: true },
  });
  const monthTotal = Number(monthTotalAgg._sum.amountCop ?? 0);

  // Build year/month selectors
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);
  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(new Date(2026, i, 1)),
  }));

  const exportUrl = `/api/finance/export?year=${year}&month=${month}`;

  function pageUrl(p: number) {
    return `/finance/reports?year=${year}&month=${month}&page=${p}`;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Informes</h1>

      {/* Period selector */}
      <form method="GET" className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Año</label>
          <select
            name="year"
            defaultValue={year}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Mes</label>
          <select
            name="month"
            defaultValue={month}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none capitalize"
          >
            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <button
          type="submit"
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Ver
        </button>
        <a
          href={exportUrl}
          className="ml-auto bg-white border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          ↓ Exportar CSV
        </a>
      </form>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Total del período</p>
          <p className="text-xl font-bold text-gray-900">{formatCOP(monthTotal)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Transacciones</p>
          <p className="text-xl font-bold text-gray-900">{total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Informe generado</p>
          <p className="text-sm font-medium text-gray-700">
            {storedReport ? formatDate(storedReport.generatedAt) : '—'}
          </p>
        </div>
      </div>

      {/* Transactions table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Fecha', 'Banco', 'Comercio', 'Tipo', 'Monto', 'COP', 'Correo'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.map(tx => (
              <tr key={tx.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {formatDate(tx.transactionDate)}
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">{tx.bank}</td>
                <td className="px-4 py-3 text-gray-600">{tx.merchant ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600 capitalize">{tx.transactionType}</td>
                <td className="px-4 py-3 text-gray-700">
                  {Number(tx.amount).toLocaleString('es-CO')} {tx.currency}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{formatCOP(Number(tx.amountCop))}</td>
                <td className="px-4 py-3 text-xs text-gray-400 max-w-[160px] truncate">
                  {tx.email.subject}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {transactions.length === 0 && (
          <div className="text-center py-12 text-gray-400">Sin transacciones en este período.</div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <span className="text-sm text-gray-500">Página {page} de {pages}</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={pageUrl(page - 1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                  ← Anterior
                </Link>
              )}
              {page < pages && (
                <Link href={pageUrl(page + 1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
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
