import { z } from "zod";

// The structured result the agent must return. Every risk factor needs evidence.
export const InvestigationResultSchema = z.object({
  summary: z.string().min(1).max(1500),
  riskFactors: z
    .array(
      z.object({
        description: z.string().min(1),
        evidenceTransactionIds: z.array(z.string()).min(1),
      }),
    )
    .max(8),
  mitigatingFactors: z
    .array(
      z.object({
        description: z.string().min(1),
        evidenceTransactionIds: z.array(z.string()),
      }),
    )
    .max(8),
  suggestedAction: z.enum(["close", "escalate", "request_info"]),
  confidence: z.enum(["low", "medium", "high"]),
  openQuestions: z.array(z.string()).max(6),
});

export type InvestigationResult = z.infer<typeof InvestigationResultSchema>;

export const SUGGESTED_ACTION_LABELS: Record<InvestigationResult["suggestedAction"], string> = {
  close: "Close as false positive",
  escalate: "Escalate to a supervisor",
  request_info: "Request more information",
};
