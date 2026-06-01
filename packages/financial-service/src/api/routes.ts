import { Router, type IRouter } from 'express';
import { prisma } from '../db/prisma';

export const router: IRouter = Router();

// GET /financial/transactions?page=1&limit=20&bank=&type=&from=&to=
router.get('/transactions', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const bank  = req.query.bank as string | undefined;
    const type  = req.query.type as string | undefined;
    const from  = req.query.from as string | undefined;
    const to    = req.query.to   as string | undefined;

    const where = {
      ...(bank ? { bank: { contains: bank, mode: 'insensitive' as const } } : {}),
      ...(type ? { transactionType: type } : {}),
      ...(from || to ? {
        transactionDate: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to   ? { lte: new Date(to)   } : {}),
        },
      } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { email: { select: { subject: true, sender: true } } },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ data: items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /financial/balance/:year/:month
router.get('/balance/:year/:month', async (req, res) => {
  try {
    const year  = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    const from = new Date(year, month - 1, 1);
    const to   = new Date(year, month, 1);

    const transactions = await prisma.transaction.findMany({
      where: { transactionDate: { gte: from, lt: to } },
    });

    const totalCop = transactions.reduce((s, t) => s + Number(t.amountCop), 0);

    const byBank = groupSum(transactions, t => t.bank, t => Number(t.amountCop));
    const byType = groupSum(transactions, t => t.transactionType, t => Number(t.amountCop));

    // Check if stored monthly report exists
    const report = await prisma.monthlyReport.findUnique({ where: { year_month: { year, month } } });

    res.json({ year, month, totalCop, transactionsCount: transactions.length, byBank, byType, report });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /financial/summary/by-bank
router.get('/summary/by-bank', async (req, res) => {
  try {
    const rows = await prisma.$queryRaw<Array<{ bank: string; total: string; count: bigint }>>`
      SELECT bank, SUM("amountCop")::text as total, COUNT(*)::bigint as count
      FROM transactions
      GROUP BY bank
      ORDER BY SUM("amountCop") DESC
    `;
    res.json(rows.map(r => ({ bank: r.bank, totalCop: parseFloat(r.total), count: Number(r.count) })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /financial/summary/by-type
router.get('/summary/by-type', async (req, res) => {
  try {
    const rows = await prisma.$queryRaw<Array<{ transactionType: string; total: string; count: bigint }>>`
      SELECT "transactionType", SUM("amountCop")::text as total, COUNT(*)::bigint as count
      FROM transactions
      GROUP BY "transactionType"
      ORDER BY SUM("amountCop") DESC
    `;
    res.json(rows.map(r => ({ type: r.transactionType, totalCop: parseFloat(r.total), count: Number(r.count) })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

function groupSum<T>(
  items: T[],
  key: (item: T) => string,
  value: (item: T) => number
): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + value(item);
    return acc;
  }, {});
}
