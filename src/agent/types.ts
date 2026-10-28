import type { InvestigationResult } from "./schema";

export type RecordStep = (toolName: string, toolInput: unknown, outputSummary: string, isError?: boolean) => Promise<void>;

export type AgentOutcome = {
  result: InvestigationResult;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
};
