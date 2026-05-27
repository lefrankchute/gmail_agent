-- CreateEnum
CREATE TYPE "EmailAction" AS ENUM ('PERSONAL', 'SUMMARY', 'ARCHIVE', 'UNCLASSIFIED');

-- CreateTable
CREATE TABLE "emails" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "senderDomain" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "labels" TEXT[],
    "action" "EmailAction" NOT NULL,
    "category" TEXT,
    "subCategory" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isHistorical" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amountCop" DECIMAL(18,2) NOT NULL,
    "exchangeRate" DECIMAL(10,4) NOT NULL,
    "accountType" TEXT NOT NULL,
    "merchant" TEXT,
    "transactionType" TEXT NOT NULL,
    "category" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_summaries" (
    "id" TEXT NOT NULL,
    "summaryDate" DATE NOT NULL,
    "contentJson" JSONB NOT NULL,
    "telegramMessage" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "emailCount" INTEGER NOT NULL DEFAULT 0,
    "personalCount" INTEGER NOT NULL DEFAULT 0,
    "summaryCount" INTEGER NOT NULL DEFAULT 0,
    "unclassifiedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_reports" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "totalCop" DECIMAL(18,2) NOT NULL,
    "byBank" JSONB NOT NULL,
    "byAccountType" JSONB NOT NULL,
    "byCategory" JSONB NOT NULL,
    "transactionsCount" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classification_rules" (
    "id" TEXT NOT NULL,
    "senderDomain" TEXT,
    "senderEmail" TEXT,
    "gmailLabel" TEXT,
    "action" "EmailAction" NOT NULL,
    "category" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_logs" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "process_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_summaries_summaryDate_key" ON "daily_summaries"("summaryDate");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_reports_year_month_key" ON "monthly_reports"("year", "month");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "emails"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
