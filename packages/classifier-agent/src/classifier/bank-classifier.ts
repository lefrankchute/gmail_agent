import Anthropic from '@anthropic-ai/sdk';
import {
  BankSubCategory,
  EmailAction,
  type ClassificationResult,
  type EmailJob,
  type TransactionJobData,
} from '@gmail-agent/shared';
import { BANK_SYSTEM_PROMPT } from './prompts';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BODY_MAX_CHARS = 4000;

const ACTION_MAP: Record<BankSubCategory, EmailAction> = {
  [BankSubCategory.MARKETING]: EmailAction.ARCHIVE,
  [BankSubCategory.MONTHLY_STATEMENT]: EmailAction.SUMMARY,
  [BankSubCategory.TRANSACTION]: EmailAction.PERSONAL,
  [BankSubCategory.FRAUD]: EmailAction.PERSONAL,
  [BankSubCategory.OTHER]: EmailAction.SUMMARY,
};

export interface BankAnalysisResult {
  classification: ClassificationResult;
  transactionData?: TransactionJobData;
  isUrgent: boolean;
}

export async function analyzeBankEmail(email: EmailJob): Promise<BankAnalysisResult> {
  const body = email.body.slice(0, BODY_MAX_CHARS);

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: [
      {
        type: 'text',
        text: BANK_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      { role: 'user', content: `Asunto: ${email.subject}\nDe: ${email.sender}\n\n${body}` },
    ],
  });

  const text = response.content.find(c => c.type === 'text')?.text ?? '{}';

  try {
    const result = JSON.parse(text) as {
      subCategory?: string;
      confidence?: number;
      reasoning?: string;
      transactionData?: {
        amount?: number;
        currency?: string;
        merchant?: string;
        bank?: string;
        accountType?: string;
        transactionType?: string;
        transactionDate?: string;
      };
    };

    const subCategory = Object.values(BankSubCategory).includes(result.subCategory as BankSubCategory)
      ? (result.subCategory as BankSubCategory)
      : BankSubCategory.OTHER;

    const confidence = typeof result.confidence === 'number' ? result.confidence : 0.5;
    const action = ACTION_MAP[subCategory];
    const isUrgent = subCategory === BankSubCategory.FRAUD;

    let transactionData: TransactionJobData | undefined;
    if (subCategory === BankSubCategory.TRANSACTION && result.transactionData) {
      const td = result.transactionData;
      transactionData = {
        emailId: email.id,
        bank: td.bank ?? email.senderDomain,
        amount: td.amount ?? 0,
        currency: td.currency ?? 'COP',
        merchant: td.merchant,
        accountType: td.accountType ?? 'cuenta_ahorros',
        transactionType: td.transactionType ?? 'compra',
        transactionDate: td.transactionDate ?? email.receivedAt,
      };
    }

    return {
      classification: {
        action,
        category: 'banco',
        confidence,
        reasoning: result.reasoning ?? '',
        subCategory,
      },
      transactionData,
      isUrgent,
    };
  } catch {
    return {
      classification: {
        action: EmailAction.SUMMARY,
        category: 'banco',
        confidence: 0,
        reasoning: 'Error al analizar email bancario',
        subCategory: BankSubCategory.OTHER,
      },
      isUrgent: false,
    };
  }
}
