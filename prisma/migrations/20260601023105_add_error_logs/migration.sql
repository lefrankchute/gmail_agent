-- CreateTable
CREATE TABLE "error_logs" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "stack" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);
