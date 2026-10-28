import { prisma } from "@/lib/db";
import { RULES } from "./index";
import { calculateRiskScore } from "./score";
import { DAY } from "./utils";

export type RunSummary = {
  customersChecked: number;
  alertsCreated: number;
  byRule: Record<string, number>;
};

// Checks every customer's last 13 months of transactions against each enabled rule.
export async function runRules(): Promise<RunSummary> {
  const now = new Date();
  const since = new Date(now.getTime() - 400 * DAY);
  const recentAlertCutoff = new Date(now.getTime() - 90 * DAY);

  const enabledRules = await prisma.rule.findMany({ where: { enabled: true } });
  const customers = await prisma.customer.findMany({
    select: { id: true, riskRating: true },
  });

  const summary: RunSummary = { customersChecked: 0, alertsCreated: 0, byRule: {} };

  for (const customer of customers) {
    summary.customersChecked++;

    const rows = await prisma.transaction.findMany({
      where: { account: { customerId: customer.id }, occurredAt: { gte: since } },
      orderBy: { occurredAt: "asc" },
      select: {
        id: true,
        occurredAt: true,
        amount: true,
        direction: true,
        channel: true,
        counterparty: true,
        counterpartyCountry: true,
      },
    });
    const transactions = rows.map((row) => ({ ...row, amount: Number(row.amount) }));

    const recentAlert = await prisma.alert.findFirst({
      where: { customerId: customer.id, triggeredAt: { gte: recentAlertCutoff } },
      select: { id: true },
    });

    for (const rule of enabledRules) {
      const definition = RULES.find((r) => r.code === rule.code);
      if (!definition) continue;

      const matches = definition.evaluate({ customerId: customer.id, transactions, now }, rule.params);

      for (const match of matches) {
        const existing = await prisma.alert.findUnique({
          where: { dedupeKey: match.dedupeKey },
          select: { id: true },
        });
        if (existing) continue;

        await prisma.alert.create({
          data: {
            customerId: customer.id,
            ruleCode: rule.code,
            riskScore: calculateRiskScore({
              baseScore: rule.baseScore,
              riskRating: customer.riskRating,
              amount: match.amountInvolved,
              hasRecentAlert: !!recentAlert,
            }),
            summary: match.summary,
            amountInvolved: match.amountInvolved,
            windowStart: match.windowStart,
            windowEnd: match.windowEnd,
            dedupeKey: match.dedupeKey,
            transactions: {
              create: match.transactionIds.map((transactionId) => ({ transactionId })),
            },
          },
        });

        summary.alertsCreated++;
        summary.byRule[rule.code] = (summary.byRule[rule.code] ?? 0) + 1;
      }
    }
  }

  return summary;
}
