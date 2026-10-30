import { z } from "zod";
import type { RuleDefinition, RuleMatch } from "./types";
import { HOUR, nzd, sum } from "./utils";

const Params = z.object({
  minInAmount: z.number(),
  outRatio: z.number(),
  windowHours: z.number(),
});

// A large amount comes in and most of it leaves again quickly.
export const rapidMovement: RuleDefinition = {
  code: "RAPID_MOVEMENT",
  paramsSchema: Params,
  evaluate({ customerId, transactions }, rawParams) {
    const p = Params.parse(rawParams);
    const matches: RuleMatch[] = [];

    for (const incoming of transactions) {
      if (incoming.direction !== "in" || incoming.amount < p.minInAmount) continue;

      const start = incoming.occurredAt.getTime();
      const end = start + p.windowHours * HOUR;
      const outgoing = transactions.filter(
        (t) => t.direction === "out" && t.occurredAt.getTime() > start && t.occurredAt.getTime() <= end,
      );
      const outTotal = sum(outgoing);

      if (outgoing.length > 0 && outTotal >= p.outRatio * incoming.amount) {
        const percent = Math.round((outTotal / incoming.amount) * 100);
        matches.push({
          transactionIds: [incoming.id, ...outgoing.map((t) => t.id)],
          amountInvolved: incoming.amount,
          windowStart: incoming.occurredAt,
          windowEnd: outgoing[outgoing.length - 1].occurredAt,
          summary: `${nzd(incoming.amount)} received, then ${nzd(outTotal)} (${percent}%) sent out within ${p.windowHours} hours.`,
          dedupeKey: `RAPID_MOVEMENT:${customerId}:${incoming.id}`,
        });
      }
    }
    return matches;
  },
};
