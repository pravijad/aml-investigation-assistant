/*
  Warnings:

  - A unique constraint covering the columns `[dedupeKey]` on the table `Alert` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `amountInvolved` to the `Alert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dedupeKey` to the `Alert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `summary` to the `Alert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `windowEnd` to the `Alert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `windowStart` to the `Alert` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "amountInvolved" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "dedupeKey" TEXT NOT NULL,
ADD COLUMN     "summary" TEXT NOT NULL,
ADD COLUMN     "windowEnd" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "windowStart" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "params" JSONB NOT NULL,
    "baseScore" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertTransaction" (
    "alertId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,

    CONSTRAINT "AlertTransaction_pkey" PRIMARY KEY ("alertId","transactionId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rule_code_key" ON "Rule"("code");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_dedupeKey_key" ON "Alert"("dedupeKey");

-- CreateIndex
CREATE INDEX "Alert_status_riskScore_idx" ON "Alert"("status", "riskScore");

-- CreateIndex
CREATE INDEX "Alert_customerId_idx" ON "Alert"("customerId");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_ruleCode_fkey" FOREIGN KEY ("ruleCode") REFERENCES "Rule"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertTransaction" ADD CONSTRAINT "AlertTransaction_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertTransaction" ADD CONSTRAINT "AlertTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
