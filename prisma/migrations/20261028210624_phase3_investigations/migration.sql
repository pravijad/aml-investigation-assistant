-- CreateEnum
CREATE TYPE "InvestigationStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "Investigation" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "status" "InvestigationStatus" NOT NULL DEFAULT 'queued',
    "mode" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "startedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Investigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestigationStep" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolInput" JSONB NOT NULL,
    "outputSummary" TEXT NOT NULL,
    "isError" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestigationStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Investigation_alertId_createdAt_idx" ON "Investigation"("alertId", "createdAt");

-- AddForeignKey
ALTER TABLE "Investigation" ADD CONSTRAINT "Investigation_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investigation" ADD CONSTRAINT "Investigation_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestigationStep" ADD CONSTRAINT "InvestigationStep_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
