import { EmailAction } from '@prisma/client';
import { prisma } from '../db/prisma';

const RUN_INTERVAL_MS = parseInt(process.env.DOMAIN_POLICY_INTERVAL_HOURS ?? '24') * 60 * 60 * 1000;
const MIN_EMAILS_FOR_RULE = 5;
const MIN_CONSISTENCY_RATIO = 0.8;

export async function startDomainPolicyWorker(): Promise<void> {
  const run = async () => {
    try {
      const stats = await buildDomainStats();
      const { created, updated } = await applyRules(stats);

      await prisma.processLog.create({
        data: {
          service: 'classifier-agent',
          level: 'info',
          message: 'Domain policy run completed',
          metadata: { created, updated, domainsAnalyzed: stats.size },
        },
      });

      console.log(`[domain-policy] Done — created: ${created}, updated: ${updated}`);
    } catch (err) {
      console.error('[domain-policy] Error:', (err as Error).message);
    }
  };

  await run();
  setInterval(run, RUN_INTERVAL_MS);
  console.log(`[domain-policy] Started — interval: ${process.env.DOMAIN_POLICY_INTERVAL_HOURS ?? 24} hours`);
}

interface DomainStat {
  domain: string;
  action: EmailAction;
  category: string;
  count: number;
  total: number;
}

async function buildDomainStats(): Promise<Map<string, DomainStat>> {
  const rows = await prisma.$queryRaw<
    Array<{ senderDomain: string; action: EmailAction; category: string; count: bigint }>
  >`
    SELECT "senderDomain", action, category, COUNT(*)::bigint as count
    FROM emails
    WHERE "senderDomain" != ''
      AND action != 'UNCLASSIFIED'
      AND category IS NOT NULL
    GROUP BY "senderDomain", action, category
    ORDER BY "senderDomain", count DESC
  `;

  // Group by domain, pick the dominant action+category
  const domainTotals = new Map<string, number>();
  const domainBest = new Map<string, DomainStat>();

  for (const row of rows) {
    const cnt = Number(row.count);
    const prev = domainTotals.get(row.senderDomain) ?? 0;
    domainTotals.set(row.senderDomain, prev + cnt);

    // First row per domain (highest count due to ORDER BY) is the dominant one
    if (!domainBest.has(row.senderDomain)) {
      domainBest.set(row.senderDomain, {
        domain: row.senderDomain,
        action: row.action,
        category: row.category,
        count: cnt,
        total: 0, // filled below
      });
    }
  }

  // Fill in totals and filter out domains below threshold
  const result = new Map<string, DomainStat>();
  for (const [domain, stat] of domainBest) {
    const total = domainTotals.get(domain) ?? 0;
    if (total < MIN_EMAILS_FOR_RULE) continue;
    if (stat.count / total < MIN_CONSISTENCY_RATIO) continue;
    result.set(domain, { ...stat, total });
  }

  return result;
}

async function applyRules(stats: Map<string, DomainStat>): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const stat of stats.values()) {
    const existing = await prisma.classificationRule.findFirst({
      where: { senderDomain: stat.domain },
    });

    if (!existing) {
      await prisma.classificationRule.create({
        data: {
          senderDomain: stat.domain,
          action: stat.action,
          category: stat.category,
          priority: 0,
          isActive: true,
        },
      });
      created++;
      console.log(`[domain-policy] Created rule: ${stat.domain} → ${stat.action}/${stat.category}`);
    } else if (existing.action !== stat.action || existing.category !== stat.category) {
      await prisma.classificationRule.update({
        where: { id: existing.id },
        data: { action: stat.action, category: stat.category },
      });
      updated++;
      console.log(`[domain-policy] Updated rule: ${stat.domain} → ${stat.action}/${stat.category}`);
    }
  }

  return { created, updated };
}
