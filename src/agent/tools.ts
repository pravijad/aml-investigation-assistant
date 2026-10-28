import { z } from "zod";
import { prisma } from "@/lib/db";

const DAY = 24 * 60 * 60 * 1000;

export type AgentContext = {
  alertId: string;
  customerId: string;
  seenTransactionIds: Set<string>; // every transaction ID the agent has been shown
};

type TxRow = {
  id: string;
  occurredAt: Date;
  amount: unknown;
  direction: string;
  channel: string;
  counterparty: string | null;
  counterpartyCountry: string | null;
  description: string | null;
};

function toTx(t: TxRow, context: AgentContext) {
  context.seenTransactionIds.add(t.id);
  return {
    id: t.id,
    date: t.occurredAt.toISOString(),
    amount: Number(t.amount),
    direction: t.direction,
    channel: t.channel,
    counterparty: t.counterparty,
    counterpartyCountry: t.counterpartyCountry,
    description: t.description,
  };
}

// ---------- Tool handlers: read-only, limited to the alert's customer ----------

export async function getAlertDetails(context: AgentContext) {
  const alert = await prisma.alert.findUniqueOrThrow({
    where: { id: context.alertId },
    include: { rule: true, transactions: { include: { transaction: true } } },
  });
  return {
    alertId: alert.id,
    rule: {
      code: alert.rule.code,
      name: alert.rule.name,
      description: alert.rule.description,
      settings: alert.rule.params,
    },
    summary: alert.summary,
    riskScore: alert.riskScore,
    amountInvolved: Number(alert.amountInvolved),
    windowStart: alert.windowStart.toISOString(),
    windowEnd: alert.windowEnd.toISOString(),
    triggeringTransactions: alert.transactions.map((link) => toTx(link.transaction, context)),
  };
}

export async function getCustomerProfile(context: AgentContext) {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: context.customerId },
    include: { accounts: true },
  });
  return {
    reference: customer.reference,
    occupation: customer.occupation,
    riskRating: customer.riskRating,
    expectedMonthlyVolume: Number(customer.expectedMonthlyVolume),
    customerSince: customer.onboardedAt.toISOString().slice(0, 10),
    accounts: customer.accounts.map((a) => ({
      account: `****${a.accountNumber.slice(-6)}`,
      type: a.type,
      openedAt: a.openedAt.toISOString().slice(0, 10),
    })),
  };
}

const TransactionsInput = z.object({
  from: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "from must be a date like 2026-01-31"),
  to: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "to must be a date like 2026-01-31"),
});

export async function getTransactions(context: AgentContext, rawInput: unknown) {
  const input = TransactionsInput.parse(rawInput);
  const from = new Date(input.from);
  const to = new Date(new Date(input.to).getTime() + DAY - 1);
  if (to < from) throw new Error("'to' must be after 'from'.");
  if (to.getTime() - from.getTime() > 400 * DAY) throw new Error("The date range can be at most 400 days.");

  const rows = await prisma.transaction.findMany({
    where: { account: { customerId: context.customerId }, occurredAt: { gte: from, lte: to } },
    orderBy: { occurredAt: "asc" },
    take: 201,
  });
  return {
    count: Math.min(rows.length, 200),
    truncated: rows.length > 200,
    transactions: rows.slice(0, 200).map((t) => toTx(t, context)),
  };
}

const BaselineInput = z.object({ months: z.number().int().min(1).max(12).default(6) });

export async function computeBaseline(context: AgentContext, rawInput: unknown) {
  const { months } = BaselineInput.parse(rawInput ?? {});
  const alert = await prisma.alert.findUniqueOrThrow({
    where: { id: context.alertId },
    select: { windowStart: true },
  });
  const end = alert.windowStart;
  const start = new Date(end.getTime() - months * 30 * DAY);

  const rows = await prisma.transaction.findMany({
    where: { account: { customerId: context.customerId }, occurredAt: { gte: start, lt: end } },
    select: { amount: true, direction: true, channel: true, counterpartyCountry: true },
  });

  let totalIn = 0;
  let totalOut = 0;
  const channels: Record<string, number> = {};
  const countries = new Set<string>();
  for (const t of rows) {
    if (t.direction === "in") totalIn += Number(t.amount);
    else totalOut += Number(t.amount);
    channels[t.channel] = (channels[t.channel] ?? 0) + 1;
    if (t.counterpartyCountry) countries.add(t.counterpartyCountry);
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    period: `${months} months before the alert window`,
    averageMonthlyIn: round(totalIn / months),
    averageMonthlyOut: round(totalOut / months),
    averageTransactionsPerMonth: round(rows.length / months),
    channelCounts: channels,
    counterpartyCountries: [...countries],
  };
}

export async function getPastAlerts(context: AgentContext) {
  const alerts = await prisma.alert.findMany({
    where: { customerId: context.customerId, NOT: { id: context.alertId } },
    include: { rule: { select: { name: true } } },
    orderBy: { triggeredAt: "desc" },
    take: 10,
  });
  return {
    count: alerts.length,
    alerts: alerts.map((a) => ({
      rule: a.rule.name,
      status: a.status,
      riskScore: a.riskScore,
      raised: a.triggeredAt.toISOString().slice(0, 10),
      summary: a.summary,
    })),
  };
}

export async function checkCounterparties(context: AgentContext) {
  const links = await prisma.alertTransaction.findMany({
    where: { alertId: context.alertId },
    select: { transaction: { select: { counterparty: true } } },
  });
  const names = [...new Set(links.map((l) => l.transaction.counterparty).filter((n): n is string => !!n))];

  const results = [];
  for (const name of names) {
    const others = await prisma.alertTransaction.findMany({
      where: { transaction: { counterparty: name }, alert: { customerId: { not: context.customerId } } },
      select: { alertId: true },
    });
    results.push({ counterparty: name, alertsForOtherCustomers: new Set(others.map((o) => o.alertId)).size });
  }
  return { checked: results.length, counterparties: results };
}

// ---------- Dispatch by name, with a short summary for the investigation trail ----------

export async function runTool(name: string, input: unknown, context: AgentContext) {
  switch (name) {
    case "get_alert_details": {
      const output = await getAlertDetails(context);
      return { output, summary: `Alert details with ${output.triggeringTransactions.length} triggering transactions` };
    }
    case "get_customer_profile": {
      const output = await getCustomerProfile(context);
      return { output, summary: `Profile for ${output.reference} (${output.riskRating} risk)` };
    }
    case "get_transactions": {
      const output = await getTransactions(context, input);
      return { output, summary: `${output.count} transactions${output.truncated ? " (truncated)" : ""}` };
    }
    case "compute_baseline": {
      const output = await computeBaseline(context, input);
      return { output, summary: `Baseline: ${output.averageMonthlyIn} in and ${output.averageMonthlyOut} out per month` };
    }
    case "get_past_alerts": {
      const output = await getPastAlerts(context);
      return { output, summary: `${output.count} previous alerts` };
    }
    case "check_counterparties": {
      const output = await checkCounterparties(context);
      return { output, summary: `Checked ${output.checked} counterparties` };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------- Tool descriptions sent to Claude ----------

const noInput = { type: "object" as const, properties: {} };

export const TOOL_DEFINITIONS = [
  {
    name: "get_alert_details",
    description: "The rule that fired, its settings, the alert summary and the transactions that triggered it.",
    input_schema: noInput,
  },
  {
    name: "get_customer_profile",
    description: "The customer's occupation, risk rating, expected monthly volume and accounts.",
    input_schema: noInput,
  },
  {
    name: "get_transactions",
    description: "The customer's transactions between two dates (YYYY-MM-DD), oldest first, at most 200.",
    input_schema: {
      type: "object" as const,
      properties: {
        from: { type: "string", description: "Start date, YYYY-MM-DD" },
        to: { type: "string", description: "End date, YYYY-MM-DD" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "compute_baseline",
    description: "Average monthly money in and out, transaction count and channels in the months before the alert.",
    input_schema: {
      type: "object" as const,
      properties: { months: { type: "integer", minimum: 1, maximum: 12, description: "Months to average over" } },
    },
  },
  {
    name: "get_past_alerts",
    description: "Previous alerts for this customer and how they ended.",
    input_schema: noInput,
  },
  {
    name: "check_counterparties",
    description: "Whether the counterparties in the triggering transactions appear in alerts for other customers.",
    input_schema: noInput,
  },
  {
    name: "submit_investigation",
    description: "Submit your findings. Call exactly once, when you have finished investigating.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: { type: "string", description: "A neutral summary of what happened, at most about 200 words" },
        riskFactors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              evidenceTransactionIds: { type: "array", items: { type: "string" }, minItems: 1 },
            },
            required: ["description", "evidenceTransactionIds"],
          },
        },
        mitigatingFactors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              evidenceTransactionIds: { type: "array", items: { type: "string" } },
            },
            required: ["description", "evidenceTransactionIds"],
          },
        },
        suggestedAction: { type: "string", enum: ["close", "escalate", "request_info"] },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        openQuestions: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "riskFactors", "mitigatingFactors", "suggestedAction", "confidence", "openQuestions"],
    },
  },
];
