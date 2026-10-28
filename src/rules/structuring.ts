import { z } from "zod";
import type { RuleDefinition, RuleMatch } from "./types";
import { DAY, nzd, sum } from "./utils";

const Params = z.object({
  minAmount: z.number(),
  maxAmount: z.number(),
  minCount: z.number().int(),
  windowDays: z.number(),
});

// Several cash deposits just under the reporting threshold, close together.
export const structuring: RuleDefinition = {
  code: "STRUCTURING",
  evaluate({ customerId, transactions }, rawParams) {
    const p = Params.parse(rawParams);
    const deposits = transactions.filter(
      (t) => t.direction === "in" && t.channel === "cash" && t.amount >= p.minAmount && t.amount <= p.maxAmount,
    );

    const matches: RuleMatch[] = [];
    let i = 0;
    while (i < deposits.length) {
      const start = deposits[i].occurredAt.getTime();
      let j = i;
      while (j + 1 < deposits.length && deposits[j + 1].occurredAt.getTime() - start <= p.windowDays * DAY) j++;

      const group = deposits.slice(i, j + 1);
      if (group.length >= p.minCount) {
        const total = sum(group);
        matches.push({
          transactionIds: group.map((t) => t.id),
          amountInvolved: total,
          windowStart: group[0].occurredAt,
          windowEnd: group[group.length - 1].occurredAt,
          summary: `${group.length} cash deposits between ${nzd(p.minAmount)} and ${nzd(p.maxAmount)} within ${p.windowDays} days, totalling ${nzd(total)}.`,
          dedupeKey: `STRUCTURING:${customerId}:${group[0].id}`,
        });
        i = j + 1;
      } else {
        i++;
      }
    }
    return matches;
  },
};
