export type RuleTx = {
  id: string;
  occurredAt: Date;
  amount: number;
  direction: string;
  channel: string;
  counterparty: string | null;
  counterpartyCountry: string | null;
};

export type RuleContext = {
  customerId: string;
  transactions: RuleTx[]; // sorted oldest first
  now: Date;
};

export type RuleMatch = {
  transactionIds: string[];
  amountInvolved: number;
  windowStart: Date;
  windowEnd: Date;
  summary: string;
  dedupeKey: string; // stops the same pattern creating a second alert
};

export type RuleDefinition = {
  code: string;
  evaluate: (context: RuleContext, params: unknown) => RuleMatch[];
};
