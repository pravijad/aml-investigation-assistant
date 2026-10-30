import { prisma } from "@/lib/db";
import type { Session } from "@/lib/session";
import { STATUS_LABELS, formatDateTime, type AlertStatusValue } from "@/lib/format";
import { DECISIONS, allowedDecisions, decisionLabel } from "@/lib/decisions";
import { InvestigationResultSchema, SUGGESTED_ACTION_LABELS } from "@/agent/schema";
import { recordDecision } from "../decision-actions";

type Props = {
  alert: { id: string; status: AlertStatusValue; assignedToId: string | null };
  user: Session;
  decisionError?: string;
  decided?: boolean;
};

export async function DecisionPanel({ alert, user, decisionError, decided }: Props) {
  const allowed = allowedDecisions(alert, user);

  const [latestInvestigation, history] = await Promise.all([
    prisma.investigation.findFirst({
      where: { alertId: alert.id, status: "succeeded" },
      orderBy: { createdAt: "desc" },
      select: { result: true },
    }),
    prisma.caseDecision.findMany({
      where: { alertId: alert.id },
      orderBy: { createdAt: "desc" },
      include: { decidedBy: { select: { name: true } } },
    }),
  ]);

  const draft = latestInvestigation?.result ? InvestigationResultSchema.safeParse(latestInvestigation.result) : null;
  const draftSummary = draft?.success ? draft.data.summary : "";

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
      <div>
        <h2 className="font-semibold">Decision</h2>
        <p className="text-sm text-gray-500">Status: {STATUS_LABELS[alert.status]}</p>
      </div>

      {decided && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">Decision recorded.</p>
      )}
      {decisionError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{decisionError}</p>
      )}

      {allowed.length === 0 ? (
        <p className="text-sm text-gray-500">
          {alert.status === "new"
            ? "Assign this alert to yourself to record a decision."
            : alert.status === "escalated" && user.role === "analyst"
              ? "This alert is waiting for a supervisor."
              : "There are no decisions you can make on this alert."}
        </p>
      ) : (
        <form action={recordDecision} className="space-y-4">
          <input type="hidden" name="alertId" value={alert.id} />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Decision</legend>
            {allowed.map((code, index) => (
              <label key={code} className="flex items-center gap-2 text-sm">
                <input type="radio" name="decision" value={code} required defaultChecked={index === 0} />
                {DECISIONS[code].label}
              </label>
            ))}
          </fieldset>

          <label className="block text-sm font-medium">
            Reason <span className="font-normal text-gray-500">(at least 20 characters)</span>
            <textarea
              name="reason"
              required
              minLength={20}
              rows={3}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-normal"
            />
          </label>

          <label className="block text-sm font-medium">
            Case notes{" "}
            <span className="font-normal text-gray-500">
              {draftSummary ? "(starts from the agent's summary; edit as needed)" : "(optional)"}
            </span>
            <textarea
              name="notes"
              rows={5}
              defaultValue={draftSummary}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-normal"
            />
          </label>

          <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
            Record decision
          </button>
        </form>
      )}

      {history.length > 0 && (
        <div className="space-y-2 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold">Decision history</h3>
          <ul className="space-y-3 text-sm">
            {history.map((d) => {
              const agent = d.agentDraft ? InvestigationResultSchema.safeParse(d.agentDraft) : null;
              return (
                <li key={d.id} className="space-y-1">
                  <p>
                    <strong>{decisionLabel(d.decision)}</strong> by {d.decidedBy.name} · {formatDateTime(d.createdAt)}
                  </p>
                  <p className="text-gray-500">
                    {STATUS_LABELS[d.fromStatus]} → {STATUS_LABELS[d.toStatus]}
                    {agent?.success && ` · agent suggested: ${SUGGESTED_ACTION_LABELS[agent.data.suggestedAction]}`}
                  </p>
                  <p className="text-gray-800">Reason: {d.reason}</p>
                  {(d.finalNotes || agent?.success) && (
                    <details>
                      <summary className="cursor-pointer text-gray-600">Case notes and agent draft</summary>
                      {d.finalNotes && (
                        <p className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-2">
                          <span className="font-medium">Final notes: </span>
                          {d.finalNotes}
                        </p>
                      )}
                      {agent?.success && (
                        <p className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-2 text-gray-600">
                          <span className="font-medium">Agent&apos;s original draft: </span>
                          {agent.data.summary}
                        </p>
                      )}
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
