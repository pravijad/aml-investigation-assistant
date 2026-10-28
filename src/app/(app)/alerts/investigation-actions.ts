"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { OPEN_STATUSES } from "@/lib/format";
import { PROMPT_VERSION } from "@/agent/prompt";
import { claudeModel } from "@/agent/claude";
import { agentMode, runInvestigation } from "@/agent/run";

export async function startInvestigation(formData: FormData) {
  const user = await requireRole(["analyst", "supervisor"]);
  const alertId = String(formData.get("alertId") ?? "");

  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    select: { status: true, assignedToId: true },
  });
  if (!alert) redirect("/alerts");

  const canWork =
    alert.status !== "new" &&
    OPEN_STATUSES.includes(alert.status) &&
    (alert.assignedToId === user.userId || user.role === "supervisor");
  if (!canWork) redirect(`/alerts/${alertId}?cannot=1`);

  const alreadyRunning = await prisma.investigation.findFirst({
    where: { alertId, status: { in: ["queued", "running"] } },
    select: { id: true },
  });
  if (alreadyRunning) redirect(`/alerts/${alertId}`);

  const mode = agentMode();
  const investigation = await prisma.investigation.create({
    data: {
      alertId,
      mode,
      model: mode === "claude" ? claudeModel() : null,
      promptVersion: PROMPT_VERSION,
      startedById: user.userId,
    },
  });

  await writeAudit({
    actorId: user.userId,
    action: "investigation.started",
    entityType: "investigation",
    entityId: investigation.id,
    after: { alertId, mode },
  });

  // Runs after the response is sent, so the page doesn't wait for the agent.
  after(async () => {
    await runInvestigation(investigation.id);
  });

  revalidatePath(`/alerts/${alertId}`);
  redirect(`/alerts/${alertId}`);
}
