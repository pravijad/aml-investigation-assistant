-- CreateTable
CREATE TABLE "CaseDecision" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "decidedById" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "fromStatus" "AlertStatus" NOT NULL,
    "toStatus" "AlertStatus" NOT NULL,
    "finalNotes" TEXT,
    "investigationId" TEXT,
    "agentDraft" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseDecision_alertId_createdAt_idx" ON "CaseDecision"("alertId", "createdAt");

-- AddForeignKey
ALTER TABLE "CaseDecision" ADD CONSTRAINT "CaseDecision_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseDecision" ADD CONSTRAINT "CaseDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
