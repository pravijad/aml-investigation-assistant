import { describe, expect, it } from "vitest";
import { structuring } from "../src/rules/structuring";
import { rapidMovement } from "../src/rules/rapid-movement";
import { highRiskJurisdiction } from "../src/rules/high-risk-jurisdiction";
import { calculateRiskScore } from "../src/rules/score";
import type { RuleTx } from "../src/rules/types";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-01T00:00:00Z");
let nextId = 0;

// Builds a test transaction. Defaults to a cash deposit in New Zealand.
function tx(daysAgo: number, amount: number, overrides: Partial<RuleTx> = {}): RuleTx {
  nextId++;
  return {
    id: `tx-${nextId}`,
    occurredAt: new Date(now.getTime() - daysAgo * DAY),
    amount,
    direction: "in",
    channel: "cash",
    counterparty: null,
    counterpartyCountry: "NZ",
    ...overrides,
  };
}

const context = (transactions: RuleTx[]) => ({
  customerId: "customer-1",
  transactions: [...transactions].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()),
  now,
});

describe("structuring rule", () => {
  const params = { minAmount: 8000, maxAmount: 9999.99, minCount: 3, windowDays: 7 };

  it("flags three cash deposits just under the threshold within a week", () => {
    const matches = structuring.evaluate(context([tx(10, 9500), tx(9, 9200), tx(8, 8800)]), params);
    expect(matches).toHaveLength(1);
    expect(matches[0].transactionIds).toHaveLength(3);
    expect(matches[0].amountInvolved).toBe(27500);
  });

  it("ignores deposits spread over more than a week", () => {
    const matches = structuring.evaluate(context([tx(30, 9500), tx(20, 9200), tx(10, 8800)]), params);
    expect(matches).toHaveLength(0);
  });

  it("ignores deposits at or above the threshold", () => {
    const matches = structuring.evaluate(context([tx(10, 10000), tx(9, 10500), tx(8, 12000)]), params);
    expect(matches).toHaveLength(0);
  });

  it("ignores transfers, even in the suspicious range", () => {
    const transfers = [tx(10, 9500), tx(9, 9200), tx(8, 8800)].map((t) => ({ ...t, channel: "transfer" }));
    expect(structuring.evaluate(context(transfers), params)).toHaveLength(0);
  });

  it("gives the same pattern the same dedupe key every run", () => {
    const transactions = [tx(10, 9500), tx(9, 9200), tx(8, 8800)];
    const first = structuring.evaluate(context(transactions), params);
    const second = structuring.evaluate(context(transactions), params);
    expect(first[0].dedupeKey).toBe(second[0].dedupeKey);
  });

  it("rejects invalid settings", () => {
    expect(structuring.paramsSchema.safeParse({ minAmount: "8000" }).success).toBe(false);
    expect(structuring.paramsSchema.safeParse(params).success).toBe(true);
  });
});

describe("rapid movement rule", () => {
  const params = { minInAmount: 5000, outRatio: 0.8, windowHours: 48 };

  it("flags money that comes in and mostly leaves within 48 hours", () => {
    const transactions = [
      tx(5, 20000, { channel: "transfer" }),
      tx(4, 18000, { channel: "transfer", direction: "out" }),
    ];
    const matches = rapidMovement.evaluate(context(transactions), params);
    expect(matches).toHaveLength(1);
    expect(matches[0].transactionIds).toHaveLength(2);
  });

  it("ignores a normal salary followed by rent", () => {
    const transactions = [
      tx(5, 8000, { channel: "transfer" }),
      tx(4, 2400, { channel: "transfer", direction: "out" }),
    ];
    expect(rapidMovement.evaluate(context(transactions), params)).toHaveLength(0);
  });
});

describe("high-risk jurisdiction rule", () => {
  it("flags transfers to a listed country, ignoring letter case", () => {
    const transactions = [tx(3, 5000, { channel: "transfer", direction: "out", counterpartyCountry: "ir" })];
    expect(highRiskJurisdiction.evaluate(context(transactions), { countries: ["IR"] })).toHaveLength(1);
  });

  it("ignores countries that aren't on the list", () => {
    const transactions = [tx(3, 5000, { channel: "transfer", direction: "out", counterpartyCountry: "AU" })];
    expect(highRiskJurisdiction.evaluate(context(transactions), { countries: ["IR"] })).toHaveLength(0);
  });
});

describe("risk score", () => {
  it("adds points for the amount involved", () => {
    expect(calculateRiskScore({ baseScore: 40, riskRating: "low", amount: 27500, hasRecentAlert: false })).toBe(55);
  });

  it("adds points for high-risk customers and recent alerts", () => {
    expect(calculateRiskScore({ baseScore: 40, riskRating: "high", amount: 27500, hasRecentAlert: true })).toBe(80);
  });

  it("never goes above 100", () => {
    expect(calculateRiskScore({ baseScore: 95, riskRating: "high", amount: 60000, hasRecentAlert: true })).toBe(100);
  });
});
