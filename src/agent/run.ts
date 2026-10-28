import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { investigateWithClaude } from "./claude";
import { investigateWithFake } from "./fake";
import type { AgentContext } from "./tools";

// "claude" when an API key is set, unless AGENT_MODE=fake forces fake mode.
export function agentMode(): "fake" | "claude" {
  if (process.env.AGENT_MODE === "fake") return "fake";
  return process.env.ANTHROPIC_API_KEY ? "claude" : "fake";
}

const toJson = (value: unknown) => JSON.parse(JSON.stringify(value ?? {}));

export async function runInvestigation(investigationId: string) {
  const investigation = await prisma.investigation.findUnique({
    where: { id: investigationId },
    include: { alert: { select: { id: true, customerId: true } } },
  });
  if (!investigation) return;

  await prisma.investigation.update({
    where: { id: investigationId },
    data: { status: "running", startedAt: new Date() },
  });

  let stepNumber = 0;
  const recordStep = async (toolName: string, toolInput: unknown, outputSummary: string, isError = false) => {
    stepNumber++;
    await prisma.investigationStep.create({
      data: { investigationId, stepNumber, toolName, toolInput: toJson(toolInput), outputSummary, isError },
    });
  };

  const context: AgentContext = {
    alertId: investigation.alert.id,
    customerId: investigation.alert.customerId,
    seenTransactionIds: new Set(),
  };

  try {
    const outcome =
      investigation.mode === "claude"
        ? await investigateWithClaude(context, recordStep)
        : await investigateWithFake(context, recordStep);

    await prisma.investigation.update({
      where: { id: investigationId },
      data: {
        status: "succeeded",
        result: toJson(outcome.result),
        model: outcome.model,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
        finishedAt: new Date(),
      },
    });
    await writeAudit({
      action: "investigation.succeeded",
      entityType: "investigation",
      entityId: investigationId,
      after: {
        alertId: context.alertId,
        mode: investigation.mode,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.investigation.update({
      where: { id: investigationId },
      data: { status: "failed", error: message.slice(0, 1000), finishedAt: new Date() },
    });
    await writeAudit({
      action: "investigation.failed",
      entityType: "investigation",
      entityId: investigationId,
      after: { alertId: context.alertId, error: message.slice(0, 300) },
    });
  }
}
