import { z } from "zod";
import type { RuleDefinition, RuleMatch, RuleTx } from "./types";
import { DAY, nzd, sum } from "./utils";

const Params = z.object({
  multiplier: z.number(),
  minTotal: z.number(),
  baselineMonths: z.number().int(),
  recentMonths: z.number().int().default(2),
});

const PERIOD = 30 * DAY;

// Money received in a recent 30-day period is far above the customer's usual level.
export const unusualVolume: RuleDefinition = {
  code: "UNUSUAL_VOLUME",
  paramsSchema: Params,
  evaluate({ customerId, transactions, now }, rawParams) {
    const p = Params.parse(rawParams);

    // Group money received into 30-day periods: 0 is the latest, 1 the one before, and so on.
    const periods = new Map<number, RuleTx[]>();
    for (const t of transactions) {
      if (t.direction !== "in") continue;
      const index = Math.floor((now.getTime() - t.occurredAt.getTime()) / PERIOD);
      periods.set(index, [...(periods.get(index) ?? []), t]);
    }

    const matches: RuleMatch[] = [];
    for (let k = 0; k < p.recentMonths; k++) {
      const recent = periods.get(k) ?? [];
      if (recent.length === 0) continue;

      let baselineTotal = 0;
      for (let b = k + 1; b <= k + p.baselineMonths; b++) baselineTotal += sum(periods.get(b) ?? []);
      const baseline = baselineTotal / p.baselineMonths;

      const total = sum(recent);
      if (baseline > 0 && total >= p.minTotal && total > p.multiplier * baseline) {
        const periodEnd = new Date(now.getTime() - k * PERIOD);
        matches.push({
          transactionIds: recent.map((t) => t.id),
          amountInvolved: total,
          windowStart: new Date(now.getTime() - (k + 1) * PERIOD),
          windowEnd: periodEnd,
          summary: `${nzd(total)} received in 30 days, ${(total / baseline).toFixed(1)} times the ${p.baselineMonths}-month average of ${nzd(baseline)}.`,
          dedupeKey: `UNUSUAL_VOLUME:${customerId}:${recent[0].id}`,
        });
      }
    }
    return matches;
  },
};
