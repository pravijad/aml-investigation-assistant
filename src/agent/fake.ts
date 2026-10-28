import type { InvestigationResult } from "./schema";
import { checkResult } from "./validate";
import { computeBaseline, getAlertDetails, getCustomerProfile, getPastAlerts, type AgentContext } from "./tools";
import type { AgentOutcome, RecordStep } from "./types";

const nzd = (n: number) =>
  n.toLocaleString("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 });

// A free, predictable stand-in for the AI. It calls the real tools, so the evidence
// trail and checks are genuine, but the wording is written by code, not a model.
export async function investigateWithFake(context: AgentContext, recordStep: RecordStep): Promise<AgentOutcome> {
  const details = await getAlertDetails(context);
  await recordStep("get_alert_details", {}, `Alert details with ${details.triggeringTransactions.length} triggering transactions`);

  const profile = await getCustomerProfile(context);
  await recordStep("get_customer_profile", {}, `Profile for ${profile.reference} (${profile.riskRating} risk)`);

  const baseline = await computeBaseline(context, { months: 6 });
  await recordStep("compute_baseline", { months: 6 }, `Baseline: ${baseline.averageMonthlyIn} in per month`);

  const past = await getPastAlerts(context);
  await recordStep("get_past_alerts", {}, `${past.count} previous alerts`);

  const mitigating: InvestigationResult["mitigatingFactors"] = [];
  if (profile.riskRating === "low" && past.count === 0) {
    mitigating.push({
      description: "The customer is rated low risk and has no previous alerts.",
      evidenceTransactionIds: [],
    });
  }

  const draft: InvestigationResult = {
    summary:
      `[Fake mode: written by code, not AI] ${details.summary} ` +
      `Over the previous 6 months the customer received an average of ${nzd(baseline.averageMonthlyIn)} a month, ` +
      `against an expected monthly volume of ${nzd(profile.expectedMonthlyVolume)}.`,
    riskFactors: [
      {
        description: `${details.rule.name}: ${details.summary}`,
        evidenceTransactionIds: details.triggeringTransactions.map((t) => t.id),
      },
    ],
    mitigatingFactors: mitigating,
    suggestedAction: details.riskScore >= 60 ? "escalate" : "request_info",
    confidence: "low",
    openQuestions: [
      "What is the source of the funds involved?",
      `Is this activity consistent with the customer's occupation (${profile.occupation})?`,
    ],
  };

  const check = checkResult(draft, context);
  if (!check.ok) throw new Error(`Fake result failed validation: ${check.problems.join("; ")}`);
  return { result: check.result, model: null, inputTokens: 0, outputTokens: 0 };
}
