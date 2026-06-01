import { db } from '@/lib/db';
import { formatCOP, monthName } from '@/lib/utils';
import dynamic from 'next/dynamic';

const MonthlyChart = dynamic(() => import('@/components/charts/MonthlyChart'), { ssr: false });
const BankChart = dynamic(() => import('@/components/charts/BankChart'), { ssr: false });

async function getFinanceData() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Monthly totals for last 6 months
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const allTx = await db.transaction.findMany({
    where: { transactionDate: { gte: sixMonthsAgo } },
    select: { transactionDate: true, amountCop: true, bank: true, transactionType: true },
  });

  // Group by month
  const byMonth: Record<string, number> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth[key] = 0;
  }
  for (const tx of allTx) {
    const d = new Date(tx.transactionDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key in byMonth) byMonth[key] += Number(tx.amountCop);
  }
  const monthlyData = Object.entries(byMonth).map(([key, totalCop]) => {
    const [, m] = key.split('-');
    return { month: monthName(parseInt(m)), totalCop };
  });

  // By bank (all time)
  const byBankMap: Record<string, number> = {};
  for (const tx of allTx) {
    byBankMap[tx.bank] = (byBankMap[tx.bank] ?? 0) + Number(tx.amountCop);
  }
  const bankData = Object.entries(byBankMap)
    .map(([bank, totalCop]) => ({ bank, totalCop }))
    .sort((a, b) => b.totalCop - a.totalCop);

  // Current month summary
  const currentMonthTx = allTx.filter(tx => new Date(tx.transactionDate) >= firstOfMonth);
  const currentMonthTotal = currentMonthTx.reduce((s, t) => s + Number(t.amountCop), 0);

  // By type (all time)
  const byTypeMap: Record<string, number> = {};
  for (const tx of allTx) {
    byTypeMap[tx.transactionType] = (byTypeMap[tx.transactionType] ?? 0) + Number(tx.amountCop);
  }
  const typeData = Object.entries(byTypeMap)
    .map(([type, totalCop]) => ({ type, totalCop }))
    .sort((a, b) => b.totalCop - a.totalCop);

  return {
    monthlyData,
    bankData,
    typeData,
    currentMonthTotal,
    currentMonthCount: currentMonthTx.length,
    topBank: bankData[0]?.bank ?? '—',
  };
}

export default async function FinancePage() {
  const data = await getFinanceData();
  const now = new Date();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Finanzas</h1>

      {/* Current month stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label={`Total ${now.toLocaleString('es-CO', { month: 'long' })}`}
          value={formatCOP(data.currentMonthTotal)}
          accent
        />
        <StatCard label="Transacciones del mes" value={String(data.currentMonthCount)} />
        <StatCard label="Banco más activo" value={data.topBank} />
      </div>

      {/* Monthly bar chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Gastos por mes (últimos 6 meses)</h2>
        <MonthlyChart data={data.monthlyData} />
      </div>

      {/* Bank + type charts side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Desglose por banco</h2>
          <BankChart data={data.bankData} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Desglose por tipo</h2>
          <div className="space-y-2 pt-2">
            {data.typeData.map(({ type, totalCop }) => (
              <div key={type} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 w-28 shrink-0 capitalize">{type}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{
                      width: `${((totalCop / (data.typeData[0]?.totalCop || 1)) * 100).toFixed(1)}%`,
                    }}
                  />
                </div>
                <span className="text-sm text-gray-600 w-28 text-right shrink-0">
                  {formatCOP(totalCop)}
                </span>
              </div>
            ))}
            {data.typeData.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">Sin transacciones aún.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border shadow-sm px-5 py-4 ${accent ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'}`}>
      <p className={`text-xs mb-1 ${accent ? 'text-blue-100' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-xl font-bold ${accent ? 'text-white' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
