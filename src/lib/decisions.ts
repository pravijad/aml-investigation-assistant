import type { Role } from "@/lib/session";
import type { AlertStatusValue } from "@/lib/format";

type DecisionRule = {
  label: string;
  from: readonly AlertStatusValue[];
  to: AlertStatusValue;
  roles: readonly Role[];
  closes: boolean;
};

// Every allowed status change. Anything not listed here is refused.
export const DECISIONS = {
  close_false_positive: {
    label: "Close as false positive",
    from: ["in_review"],
    to: "closed_false_positive",
    roles: ["analyst", "supervisor"],
    closes: true,
  },
  escalate: {
    label: "Escalate to a supervisor",
    from: ["in_review"],
    to: "escalated",
    roles: ["analyst", "supervisor"],
    closes: false,
  },
  request_info: {
    label: "Request more information",
    from: ["in_review"],
    to: "info_requested",
    roles: ["analyst", "supervisor"],
    closes: false,
  },
  resume_review: {
    label: "Information received: resume review",
    from: ["info_requested"],
    to: "in_review",
    roles: ["analyst", "supervisor"],
    closes: false,
  },
  close_after_review: {
    label: "Close after supervisor review",
    from: ["escalated"],
    to: "closed_after_review",
    roles: ["supervisor"],
    closes: true,
  },
  report_advised: {
    label: "Advise a suspicious activity report",
    from: ["escalated"],
    to: "report_advised",
    roles: ["supervisor"],
    closes: true,
  },
  return_to_analyst: {
    label: "Return to the analyst for more work",
    from: ["escalated"],
    to: "in_review",
    roles: ["supervisor"],
    closes: false,
  },
} as const satisfies Record<string, DecisionRule>;

export type DecisionCode = keyof typeof DECISIONS;
export const DECISION_CODES = Object.keys(DECISIONS) as [DecisionCode, ...DecisionCode[]];

// Maps the agent's suggestion to the matching human decision, to measure agreement.
export const AGENT_SUGGESTION_TO_DECISION: Record<string, DecisionCode> = {
  close: "close_false_positive",
  escalate: "escalate",
  request_info: "request_info",
};

export function allowedDecisions(
  alert: { status: AlertStatusValue; assignedToId: string | null },
  user: { userId: string; role: Role },
): DecisionCode[] {
  return DECISION_CODES.filter((code) => {
    const rule: DecisionRule = DECISIONS[code];
    if (!rule.roles.includes(user.role)) return false;
    if (!rule.from.includes(alert.status)) return false;
    // Analysts can only decide on alerts assigned to them. Supervisors can decide on any.
    if (user.role === "analyst" && alert.assignedToId !== user.userId) return false;
    return true;
  });
}

export function decisionLabel(code: string) {
  return code in DECISIONS ? DECISIONS[code as DecisionCode].label : code;
}
