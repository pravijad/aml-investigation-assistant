"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { DECISIONS, DECISION_CODES, allowedDecisions } from "@/lib/decisions";

const DecisionInput = z.object({
  alertId: z.string().min(1),
  decision: z.enum(DECISION_CODES),
  reason: z.string().trim().min(20, "Please give a reason of at least 20 characters.").max(2000),
  notes: z.string().trim().max(5000).optional(),
});

export async function recordDecision(formData: FormData) {
  const user = await requireUser();
  const alertId = String(formData.get("alertId") ?? "");
  const back: (error: string) => never = (error) => redirect(`/alerts/${alertId}?decisionError=${encodeURIComponent(error)}`);

  const parsed = DecisionInput.safeParse({
    alertId,
    decision: formData.get("decision"),
    reason: formData.get("reason") ?? "",
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) back(parsed.error.issues[0]?.message ?? "Please check the form.");
  const { decision, reason, notes } = parsed.data;

  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    select: { status: true, assignedToId: true },
  });
  if (!alert) redirect("/alerts");
  if (!allowedDecisions(alert, user).includes(decision)) back("You can't make that decision on this alert.");

  const rule = DECISIONS[decision];
  const latestInvestigation = await prisma.investigation.findFirst({
    where: { alertId, status: "succeeded" },
    orderBy: { createdAt: "desc" },
    select: { id: true, result: true },
  });

  const saved = await prisma.$transaction(async (tx) => {
    // Only succeeds if nobody changed the alert's status since this page loaded.
    const update = await tx.alert.updateMany({
      where: { id: alertId, status: alert.status },
      data: { status: rule.to, decidedAt: rule.closes ? new Date() : null },
    });
    if (update.count !== 1) return false;

    await tx.caseDecision.create({
      data: {
        alertId,
        decidedById: user.userId,
        decision,
        reason,
        fromStatus: alert.status,
        toStatus: rule.to,
        finalNotes: notes || null,
        investigationId: latestInvestigation?.id ?? null,
        agentDraft: latestInvestigation?.result ? JSON.parse(JSON.stringify(latestInvestigation.result)) : undefined,
      },
    });
    return true;
  });

  if (!saved) back("This alert was changed by someone else. Please review it again.");

  await writeAudit({
    actorId: user.userId,
    action: "alert.decision",
    entityType: "alert",
    entityId: alertId,
    before: { status: alert.status },
    after: { status: rule.to, decision },
  });

  revalidatePath("/alerts");
  revalidatePath(`/alerts/${alertId}`);
  redirect(`/alerts/${alertId}?decided=1`);
}
