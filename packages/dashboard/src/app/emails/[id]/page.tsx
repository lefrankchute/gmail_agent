import { db } from '@/lib/db';
import { formatDate, formatCOP } from '@/lib/utils';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function EmailDetailPage({ params }: { params: { id: string } }) {
  const email = await db.email.findUnique({
    where: { id: params.id },
    include: { transactions: true },
  });

  if (!email) notFound();

  const fields: [string, string][] = [
    ['Remitente', email.sender],
    ['Asunto', email.subject],
    ['Thread ID', email.threadId],
    ['Recibido', formatDate(email.receivedAt)],
    ['Procesado', formatDate(email.processedAt)],
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/emails" className="text-sm text-gray-500 hover:text-gray-700">
          ← Correos
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-700 truncate">{email.subject}</span>
      </div>

      {/* Email metadata */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="font-semibold text-gray-900">Metadatos del correo</h2>
        </div>
        <dl className="divide-y divide-gray-100">
          {fields.map(([label, value]) => (
            <div key={label} className="px-5 py-3 flex gap-4">
              <dt className="w-28 text-xs font-medium text-gray-500 shrink-0 pt-0.5">{label}</dt>
              <dd className="text-sm text-gray-800 break-all">{value}</dd>
            </div>
          ))}
          {email.labels.length > 0 && (
            <div className="px-5 py-3 flex gap-4">
              <dt className="w-28 text-xs font-medium text-gray-500 shrink-0 pt-0.5">Etiquetas</dt>
              <dd className="flex flex-wrap gap-1">
                {email.labels.map(l => (
                  <span key={l} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{l}</span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Classification */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="font-semibold text-gray-900">Clasificación</h2>
        </div>
        <div className="px-5 py-4 flex flex-wrap gap-4">
          <Stat label="Acción" value={email.action} badge={actionBadge(email.action)} />
          <Stat label="Categoría" value={email.category ?? '—'} />
          {email.subCategory && <Stat label="Subcategoría" value={email.subCategory} />}
          <Stat
            label="Confianza"
            value={`${(email.confidence * 100).toFixed(0)}%`}
            badge={confidenceBadge(email.confidence)}
          />
          {email.isHistorical && <Stat label="Origen" value="Histórico" />}
        </div>
      </div>

      {/* Reasoning */}
      {email.reasoning && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="font-semibold text-gray-900">Razonamiento de Claude</h2>
          </div>
          <p className="px-5 py-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {email.reasoning}
          </p>
        </div>
      )}

      {/* Transactions */}
      {email.transactions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="font-semibold text-gray-900">Transacciones extraídas</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {email.transactions.map(tx => (
              <div key={tx.id} className="px-5 py-3 flex flex-wrap gap-4 text-sm">
                <span className="font-semibold text-gray-900">{tx.bank}</span>
                <span className="text-gray-700">{formatCOP(Number(tx.amountCop))}</span>
                <span className="text-gray-500">{tx.transactionType}</span>
                {tx.merchant && <span className="text-gray-500">{tx.merchant}</span>}
                <span className="text-gray-400">{formatDate(tx.transactionDate)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="min-w-[100px]">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <span className={badge ? `px-2 py-0.5 rounded-full text-xs font-medium ${badge}` : 'text-sm font-medium text-gray-900'}>
        {value}
      </span>
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
