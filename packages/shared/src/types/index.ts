export enum EmailAction {
  PERSONAL = 'PERSONAL',
  SUMMARY = 'SUMMARY',
  ARCHIVE = 'ARCHIVE',
  UNCLASSIFIED = 'UNCLASSIFIED',
}

export enum AccountType {
  SAVINGS = 'cuenta_ahorros',
  CREDIT_CARD = 'tarjeta_credito',
  PSE = 'pse',
  TRANSFER = 'transferencia',
  DIGITAL_WALLET = 'billetera_digital',
}

export enum TransactionType {
  PURCHASE = 'compra',
  PAYMENT = 'pago',
  TRANSFER = 'transferencia',
  WITHDRAWAL = 'retiro',
  RECHARGE = 'recarga',
}

export enum BankSubCategory {
  MARKETING = 'marketing',
  MONTHLY_STATEMENT = 'extracto_mensual',
  TRANSACTION = 'transaccion',
  FRAUD = 'fraude',
  OTHER = 'otro',
}

export interface ClassificationResult {
  action: EmailAction;
  category: string;
  confidence: number;
  reasoning: string;
  subCategory?: string;
}

export interface Transaction {
  emailId: string;
  bank: string;
  amount: number;
  currency: string;
  amountCop: number;
  exchangeRate: number;
  accountType: AccountType;
  merchant: string;
  transactionType: TransactionType;
  category: string;
  transactionDate: Date;
}

export interface EmailMetadata {
  id: string;
  threadId: string;
  subject: string;
  sender: string;
  senderDomain: string;
  snippet: string;
  labels: string[];
  receivedAt: Date;
  body?: string;
}
