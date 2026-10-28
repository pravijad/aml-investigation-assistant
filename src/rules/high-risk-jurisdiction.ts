import { z } from "zod";
import type { RuleDefinition, RuleMatch } from "./types";
import { nzd } from "./utils";

const Params = z.object({
  countries: z.array(z.string()),
});

// Money sent to or received from a country on the admin's high-risk list.
export const highRiskJurisdiction: RuleDefinition = {
  code: "HIGH_RISK_JURISDICTION",
  evaluate({ customerId, transactions }, rawParams) {
    const p = Params.parse(rawParams);
    const list = new Set(p.countries.map((c) => c.toUpperCase()));
    const matches: RuleMatch[] = [];

    for (const t of transactions) {
      const country = t.counterpartyCountry?.toUpperCase();
      if (!country || !list.has(country)) continue;

      const direction = t.direction === "out" ? "sent to" : "received from";
      matches.push({
        transactionIds: [t.id],
        amountInvolved: t.amount,
        windowStart: t.occurredAt,
        windowEnd: t.occurredAt,
        summary: `${nzd(t.amount)} ${direction} ${country}, which is on the high-risk jurisdiction list.`,
        dedupeKey: `HIGH_RISK_JURISDICTION:${customerId}:${t.id}`,
      });
    }
    return matches;
  },
};
