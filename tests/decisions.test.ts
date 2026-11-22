import { describe, expect, it } from "vitest";
import { allowedDecisions } from "../src/lib/decisions";

const analyst = { userId: "analyst-1", role: "analyst" as const };
const otherAnalyst = { userId: "analyst-2", role: "analyst" as const };
const supervisor = { userId: "supervisor-1", role: "supervisor" as const };
const admin = { userId: "admin-1", role: "admin" as const };

describe("allowedDecisions", () => {
  it("lets the assigned analyst close, escalate or request information on an alert in review", () => {
    const alert = { status: "in_review" as const, assignedToId: "analyst-1" };
    expect(allowedDecisions(alert, analyst).sort()).toEqual(["close_false_positive", "escalate", "request_info"]);
  });

  it("gives an analyst no decisions on an alert assigned to someone else", () => {
    const alert = { status: "in_review" as const, assignedToId: "analyst-1" };
    expect(allowedDecisions(alert, otherAnalyst)).toEqual([]);
  });

  it("stops analysts from making supervisor decisions on escalated alerts", () => {
    const alert = { status: "escalated" as const, assignedToId: "analyst-1" };
    expect(allowedDecisions(alert, analyst)).toEqual([]);
  });

  it("lets a supervisor make final decisions on an escalated alert", () => {
    const alert = { status: "escalated" as const, assignedToId: "analyst-1" };
    expect(allowedDecisions(alert, supervisor).sort()).toEqual([
      "close_after_review",
      "report_advised",
      "return_to_analyst",
    ]);
  });

  it("lets a supervisor decide on an alert assigned to an analyst", () => {
    const alert = { status: "in_review" as const, assignedToId: "analyst-1" };
    expect(allowedDecisions(alert, supervisor)).toContain("escalate");
  });

  it("gives admins no case decisions", () => {
    const alert = { status: "in_review" as const, assignedToId: "admin-1" };
    expect(allowedDecisions(alert, admin)).toEqual([]);
  });

  it("only allows resuming review once information has been requested", () => {
    const alert = { status: "info_requested" as const, assignedToId: "analyst-1" };
    expect(allowedDecisions(alert, analyst)).toEqual(["resume_review"]);
  });

  it("allows nothing on a closed alert", () => {
    const alert = { status: "closed_false_positive" as const, assignedToId: "analyst-1" };
    expect(allowedDecisions(alert, supervisor)).toEqual([]);
  });
});
