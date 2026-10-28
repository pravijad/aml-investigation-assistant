import { InvestigationResultSchema, type InvestigationResult } from "./schema";
import type { AgentContext } from "./tools";

type CheckResult = { ok: true; result: InvestigationResult } | { ok: false; problems: string[] };

// Checks the format, then that every cited transaction was actually shown to the agent.
// This catches made-up transaction IDs.
export function checkResult(raw: unknown, context: AgentContext): CheckResult {
  const parsed = InvestigationResultSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => `${issue.path.join(".") || "result"}: ${issue.message}`),
    };
  }

  const problems: string[] = [];
  const allFactors = [...parsed.data.riskFactors, ...parsed.data.mitigatingFactors];
  for (const factor of allFactors) {
    for (const id of factor.evidenceTransactionIds) {
      if (!context.seenTransactionIds.has(id)) {
        problems.push(`Transaction ${id} was not returned by any tool, so it can't be cited as evidence.`);
      }
    }
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, result: parsed.data };
}
