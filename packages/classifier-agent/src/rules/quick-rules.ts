import { EmailAction, type ClassificationResult, type EmailJob } from '@gmail-agent/shared';
import { prisma } from '../db/prisma';

export async function applyQuickRules(email: EmailJob): Promise<ClassificationResult | null> {
  const rules = await prisma.classificationRule.findMany({
    where: { isActive: true },
    orderBy: { priority: 'desc' },
  });

  for (const rule of rules) {
    let matched = false;

    if (rule.senderEmail && email.sender.toLowerCase() === rule.senderEmail.toLowerCase()) {
      matched = true;
    } else if (
      rule.senderDomain &&
      email.senderDomain.toLowerCase() === rule.senderDomain.toLowerCase()
    ) {
      matched = true;
    } else if (rule.gmailLabel && email.labels.some(l => l === rule.gmailLabel)) {
      matched = true;
    }

    if (matched) {
      return {
        action: rule.action as EmailAction,
        category: rule.category,
        confidence: 1.0,
        reasoning: `Regla rápida: ${rule.senderEmail ?? rule.senderDomain ?? rule.gmailLabel}`,
      };
    }
  }

  return null;
}
