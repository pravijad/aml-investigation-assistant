import { z } from "zod";
import type { RuleDefinition, RuleMatch } from "./types";
import { DAY, nzd, sum } from "./utils";

const Params = z.object({
  dormantDays: z.number(),
  minAmount: z.number(),
  windowDays: z.number(),
});

// A long quiet period, followed by a burst of activity.
export const dormantReactivated: RuleDefinition = {
  code: "DORMANT_REACTIVATED",
  paramsSchema: Params,
  evaluate({ customerId, transactions }, rawParams) {
    const p = Params.parse(rawParams);
    const matches: RuleMatch[] = [];

    for (let i = 1; i < transactions.length; i++) {
      const gap = transactions[i].occurredAt.getTime() - transactions[i - 1].occurredAt.getTime();
      if (gap < p.dormantDays * DAY) continue;

      const start = transactions[i].occurredAt.getTime();
      const burst = transactions.filter(
        (t) => t.occurredAt.getTime() >= start && t.occurredAt.getTime() <= start + p.windowDays * DAY,
      );
      const total = sum(burst);

      if (total >= p.minAmount) {
        matches.push({
          transactionIds: burst.map((t) => t.id),
          amountInvolved: total,
          windowStart: burst[0].occurredAt,
          windowEnd: burst[burst.length - 1].occurredAt,
          summary: `No activity for ${Math.floor(gap / DAY)} days, then ${burst.length} transactions totalling ${nzd(total)} within ${p.windowDays} days.`,
          dedupeKey: `DORMANT_REACTIVATED:${customerId}:${transactions[i].id}`,
        });
      }
    }
    return matches;
  },
};
