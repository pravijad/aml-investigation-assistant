import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ALERT_STATUSES, OPEN_STATUSES, STATUS_LABELS } from "@/lib/format";
import { AGENT_SUGGESTION_TO_DECISION } from "@/lib/decisions";
import { InvestigationResultSchema } from "@/agent/schema";

const CLOSED_STATUSES = ["closed_false_positive", "closed_after_review", "report_advised"] as const;

function formatDuration(ms: number) {
  const hours = ms / (60 * 60 * 1000);
  return hours < 48 ? `${hours.toFixed(1)} hours` : `${(hours / 24).toFixed(1)} days`;
}

function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded bg-gray-100">
      <div className="h-2 rounded bg-gray-700" style={{ width: `${width}%` }} />
    </div>
  );
}

function Card({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-gray-500">{note}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  await requireRole(["supervisor", "admin"]);

  const [byStatus, byRule, closedByRule, falsePositivesByRule, rules, openAlerts, decidedAlerts, investigations, decisionsWithDraft] =
    await Promise.all([
      prisma.alert.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.alert.groupBy({ by: ["ruleCode"], _count: { _all: true } }),
      prisma.alert.groupBy({ by: ["ruleCode"], where: { status: { in: [...CLOSED_STATUSES] } }, _count: { _all: true } }),
      prisma.alert.groupBy({ by: ["ruleCode"], where: { status: "closed_false_positive" }, _count: { _all: true } }),
      prisma.rule.findMany({ select: { code: true, name: true } }),
      prisma.alert.findMany({ where: { status: { in: OPEN_STATUSES } }, select: { riskScore: true } }),
      prisma.alert.findMany({ where: { decidedAt: { not: null } }, select: { triggeredAt: true, decidedAt: true } }),
      prisma.investigation.findMany({ select: { status: true, mode: true, inputTokens: true, outputTokens: true } }),
      prisma.caseDecision.findMany({ where: { investigationId: { not: null } }, select: { decision: true, agentDraft: true } }),
    ]);

  const statusCount = (status: string) => byStatus.find((s) => s.status === status)?._count._all ?? 0;
  const maxStatus = Math.max(0, ...byStatus.map((s) => s._count._all));
  const ruleName = (code: string) => rules.find((r) => r.code === code)?.name ?? code;
  const countFor = (rows: { ruleCode: string; _count: { _all: number } }[], code: string) =>
    rows.find((r) => r.ruleCode === code)?._count._all ?? 0;

  const highRiskOpen = openAlerts.filter((a) => a.riskScore >= 70).length;
  const averageDecisionMs = decidedAlerts.length
    ? decidedAlerts.reduce((total, a) => total + (a.decidedAt!.getTime() - a.triggeredAt.getTime()), 0) / decidedAlerts.length
    : null;

  // How often the analyst's decision matched the agent's suggestion.
  let compared = 0;
  let agreed = 0;
  const comparable = new Set(Object.values(AGENT_SUGGESTION_TO_DECISION));
  for (const d of decisionsWithDraft) {
    if (!comparable.has(d.decision as (typeof AGENT_SUGGESTION_TO_DECISION)[string])) continue;
    const draft = InvestigationResultSchema.safeParse(d.agentDraft);
    if (!draft.success) continue;
    compared++;
    if (AGENT_SUGGESTION_TO_DECISION[draft.data.suggestedAction] === d.decision) agreed++;
  }

  const succeeded = investigations.filter((i) => i.status === "succeeded");
  const claudeRuns = succeeded.filter((i) => i.mode === "claude");
  const averageTokens = claudeRuns.length
    ? Math.round(claudeRuns.reduce((t, i) => t + i.inputTokens + i.outputTokens, 0) / claudeRuns.length)
    : null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Open alerts" value={String(openAlerts.length)} />
        <Card label="High-risk open alerts" value={String(highRiskOpen)} note="Risk score 70 or more" />
        <Card
          label="Average time to decision"
          value={averageDecisionMs === null ? "—" : formatDuration(averageDecisionMs)}
          note={`${decidedAlerts.length} closed alert${decidedAlerts.length === 1 ? "" : "s"}`}
        />
        <Card
          label="Agreed with the agent"
          value={compared ? `${Math.round((agreed / compared) * 100)}%` : "—"}
          note={`${compared} decisions made after an investigation`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">Alerts by status</h2>
          <ul className="space-y-2 text-sm">
            {ALERT_STATUSES.map((status) => (
              <li key={status} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3">
                <span>{STATUS_LABELS[status]}</span>
                <Bar value={statusCount(status)} max={maxStatus} />
                <span className="text-right tabular-nums">{statusCount(status)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">Agent usage</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-gray-500">Investigations run</dt><dd className="text-lg font-semibold">{investigations.length}</dd></div>
            <div><dt className="text-gray-500">Succeeded</dt><dd className="text-lg font-semibold">{succeeded.length}</dd></div>
            <div><dt className="text-gray-500">Failed</dt><dd className="text-lg font-semibold">{investigations.filter((i) => i.status === "failed").length}</dd></div>
            <div><dt className="text-gray-500">Claude runs</dt><dd className="text-lg font-semibold">{claudeRuns.length}</dd></div>
            <div className="col-span-2">
              <dt className="text-gray-500">Average tokens per Claude investigation</dt>
              <dd className="text-lg font-semibold">{averageTokens === null ? "—" : averageTokens.toLocaleString()}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="font-semibold">Alerts by rule</h2>
        <p className="text-sm text-gray-500">
          A high false positive rate suggests a rule&apos;s thresholds may need tuning on the Admin page.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="py-2 pr-4 font-medium">Rule</th>
                <th className="py-2 pr-4 text-right font-medium">Alerts</th>
                <th className="py-2 pr-4 text-right font-medium">Closed</th>
                <th className="py-2 text-right font-medium">False positive rate</th>
              </tr>
            </thead>
            <tbody>
              {byRule.map((r) => {
                const closed = countFor(closedByRule, r.ruleCode);
                const falsePositives = countFor(falsePositivesByRule, r.ruleCode);
                return (
                  <tr key={r.ruleCode} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-4">{ruleName(r.ruleCode)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r._count._all}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{closed}</td>
                    <td className="py-2 text-right tabular-nums">
                      {closed ? `${Math.round((falsePositives / closed) * 100)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
