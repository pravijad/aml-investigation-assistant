"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { RULES } from "@/rules";
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

export async function updateRule(formData: FormData) {
  const user = await requireRole(["admin"]);
  const fail: (message: string) => never = (message) => redirect(`/admin?error=${encodeURIComponent(message)}`);

  const ruleId = String(formData.get("ruleId") ?? "");
  const enabled = formData.get("enabled") === "on";
  const baseScore = Number(formData.get("baseScore"));
  const paramsText = String(formData.get("params") ?? "");

  const rule = await prisma.rule.findUnique({ where: { id: ruleId } });
  if (!rule) fail("Rule not found.");
  if (!Number.isInteger(baseScore) || baseScore < 0 || baseScore > 100) {
    fail(`${rule.name}: the base score must be a whole number from 0 to 100.`);
  }

  let params: unknown;
  try {
    params = JSON.parse(paramsText);
  } catch {
    fail(`${rule.name}: the settings must be valid JSON.`);
  }

  const definition = RULES.find((r) => r.code === rule.code);
  if (!definition) fail(`${rule.name}: no code exists for this rule.`);
  const check = definition.paramsSchema.safeParse(params);
  if (!check.success) {
    fail(`${rule.name}: the settings don't match what the rule expects (${check.error.issues[0]?.message ?? "invalid"}).`);
  }
  const cleanParams = JSON.parse(JSON.stringify(check.data));

  await prisma.rule.update({ where: { id: ruleId }, data: { enabled, baseScore, params: cleanParams } });
  await writeAudit({
    actorId: user.userId,
    action: "rule.updated",
    entityType: "rule",
    entityId: ruleId,
    before: { enabled: rule.enabled, baseScore: rule.baseScore, params: JSON.stringify(rule.params) },
    after: { enabled, baseScore, params: JSON.stringify(cleanParams) },
  });

  revalidatePath("/admin");
  redirect(`/admin?saved=${encodeURIComponent(rule.name)}`);
}
