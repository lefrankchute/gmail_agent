import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const year  = parseInt(searchParams.get('year')  ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1));

  const from = new Date(year, month - 1, 1);
  const to   = new Date(year, month, 1);

  const transactions = await db.transaction.findMany({
    where: { transactionDate: { gte: from, lt: to } },
    orderBy: { transactionDate: 'desc' },
    include: { email: { select: { subject: true, sender: true } } },
  });

  const rows = [
    ['Fecha', 'Banco', 'Comercio', 'Tipo', 'Monto', 'Moneda', 'Monto COP', 'Tasa', 'Cuenta', 'Asunto', 'Remitente'],
    ...transactions.map(tx => [
      tx.transactionDate.toISOString(),
      tx.bank,
      tx.merchant ?? '',
      tx.transactionType,
      String(tx.amount),
      tx.currency,
      String(tx.amountCop),
      String(tx.exchangeRate),
      tx.accountType,
      `"${tx.email.subject.replace(/"/g, '""')}"`,
      tx.email.sender,
    ]),
  ];

  const csv = rows.map(row => row.join(',')).join('\n');
  const filename = `transacciones-${year}-${String(month).padStart(2, '0')}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
