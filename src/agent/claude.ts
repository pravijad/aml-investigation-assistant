import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompt";
import { TOOL_DEFINITIONS, runTool, type AgentContext } from "./tools";
import { checkResult } from "./validate";
import type { AgentOutcome, RecordStep } from "./types";

const MAX_TOOL_CALLS = 8;
const MAX_TURNS = 12;
const TOKEN_BUDGET = 80_000; // input + output tokens per investigation

export function claudeModel() {
  return process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
}

// The agent loop: Claude asks for tools, we run them and send back the results,
// until Claude submits its findings or a limit is reached.
export async function investigateWithClaude(context: AgentContext, recordStep: RecordStep): Promise<AgentOutcome> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  const model = claudeModel();

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Investigate alert ${context.alertId}. Start by calling get_alert_details.` },
  ];

  let toolCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let fixAttemptsLeft = 1;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
    if (inputTokens + outputTokens > TOKEN_BUDGET) {
      throw new Error(`Token budget of ${TOKEN_BUDGET} exceeded.`);
    }

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (toolUses.length === 0) {
      messages.push({ role: "user", content: "Please submit your findings by calling submit_investigation." });
      continue;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const use of toolUses) {
      if (use.name === "submit_investigation") {
        const check = checkResult(use.input, context);
        if (check.ok) {
          await recordStep("submit_investigation", {}, "Findings submitted and passed all checks");
          return { result: check.result, model, inputTokens, outputTokens };
        }

        await recordStep("submit_investigation", {}, `Rejected: ${check.problems.join("; ")}`, true);
        if (fixAttemptsLeft <= 0) {
          throw new Error(`The agent's findings failed validation: ${check.problems.join("; ")}`);
        }
        fixAttemptsLeft--;
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          is_error: true,
          content: `Your findings were rejected. Fix these problems and call submit_investigation again: ${check.problems.join("; ")}`,
        });
        continue;
      }

      toolCalls++;
      if (toolCalls > MAX_TOOL_CALLS) {
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          is_error: true,
          content: "Tool call limit reached. Submit your findings now with submit_investigation.",
        });
        continue;
      }

      try {
        const { output, summary } = await runTool(use.name, use.input, context);
        await recordStep(use.name, use.input, summary);
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(output) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The tool failed.";
        await recordStep(use.name, use.input, message, true);
        results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: message });
      }
    }

    messages.push({ role: "user", content: results });
  }

  throw new Error("The agent didn't finish within the turn limit.");
}
