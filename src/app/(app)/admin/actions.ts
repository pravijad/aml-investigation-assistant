"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { runRules } from "@/rules/runner";

export async function runRulesAction() {
  const user = await requireRole(["admin"]);
  const summary = await runRules();

  await writeAudit({
    actorId: user.userId,
    action: "rules.run",
    entityType: "rules",
    after: { customersChecked: summary.customersChecked, alertsCreated: summary.alertsCreated },
  });

  revalidatePath("/alerts");
  redirect(`/admin?created=${summary.alertsCreated}`);
}
