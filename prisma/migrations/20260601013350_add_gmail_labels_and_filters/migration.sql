-- CreateTable
CREATE TABLE "gmail_labels" (
    "gmailId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gmail_labels_pkey" PRIMARY KEY ("gmailId")
);

-- CreateTable
CREATE TABLE "gmail_filters" (
    "gmailFilterId" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gmail_filters_pkey" PRIMARY KEY ("gmailFilterId")
);
