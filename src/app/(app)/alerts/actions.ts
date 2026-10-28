"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export async function assignToMe(formData: FormData) {
  const user = await requireRole(["analyst", "supervisor"]);
  const alertId = String(formData.get("alertId") ?? "");

  // Only succeeds if nobody else has taken the alert first.
  const result = await prisma.alert.updateMany({
    where: { id: alertId, assignedToId: null, status: "new" },
    data: { assignedToId: user.userId, status: "in_review" },
  });

  if (result.count === 1) {
    await writeAudit({
      actorId: user.userId,
      action: "alert.assigned",
      entityType: "alert",
      entityId: alertId,
      before: { status: "new", assignedToId: null },
      after: { status: "in_review", assignedToId: user.userId },
    });
  }

  revalidatePath("/alerts");
  revalidatePath(`/alerts/${alertId}`);
  redirect(result.count === 1 ? `/alerts/${alertId}` : `/alerts/${alertId}?taken=1`);
}
