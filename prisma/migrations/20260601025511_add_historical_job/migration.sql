-- CreateTable
CREATE TABLE "historical_jobs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalQueued" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "lastPageToken" TEXT,

    CONSTRAINT "historical_jobs_pkey" PRIMARY KEY ("id")
);
