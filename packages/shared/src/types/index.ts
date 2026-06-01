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

// Queue message types (receivedAt as ISO string for JSON serialization)
export interface EmailJob {
  id: string;
  threadId: string;
  subject: string;
  sender: string;
  senderDomain: string;
  snippet: string;
  labels: string[];
  receivedAt: string;
  body: string;
  bodyHtml?: string;
  source?: 'polling' | 'label_scanner';
}

export interface ClassifiedEmailJob {
  emailId: string;
  action: EmailAction;
  targetLabelName?: string;
  source?: 'polling' | 'label_scanner';
}

export interface MoveProposalJob {
  emailId: string;
  targetLabelId: string;
  targetLabelName: string;
  reason: string;
}

export interface SendNotificationJob {
  text: string;
  parseMode?: 'Markdown' | 'HTML';
}

export interface TransactionJobData {
  emailId: string;
  bank: string;
  amount: number;
  currency: string;
  merchant?: string;
  accountType: string;
  transactionType: string;
  transactionDate: string;
}

export interface FlightData {
  airline: string;
  origin: string;
  destination: string;
  departureDate: string;
  reservationCode?: string;
  flightNumber?: string;
}

export interface UrgentNotificationData {
  emailId: string;
  type: 'fraud' | 'airline_ticket';
  subject: string;
  sender: string;
  flightData?: FlightData;
}

export const QUEUE_NAMES = {
  EMAIL_NEW: 'email.new',
  EMAIL_CLASSIFIED: 'email.classified',
  EMAIL_MOVE_PROPOSAL: 'email.move-proposal',
  TRANSACTION_NEW: 'transaction.new',
  NOTIFICATION_URGENT: 'notification.urgent',
  NOTIFICATION_SEND: 'notification.send',
} as const;
