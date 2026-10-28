import { prisma } from "@/lib/db";
import { formatDateTime, formatNZD } from "@/lib/format";
import { AutoRefresh } from "@/components/auto-refresh";
import { InvestigationResultSchema, SUGGESTED_ACTION_LABELS } from "@/agent/schema";
import { startInvestigation } from "../investigation-actions";

type Props = {
  alertId: string;
  customerId: string;
  canInvestigate: boolean;
  cannotReason: string | null;
};

export async function InvestigationPanel({ alertId, customerId, canInvestigate, cannotReason }: Props) {
  const investigation = await prisma.investigation.findFirst({
    where: { alertId },
    orderBy: { createdAt: "desc" },
    include: { steps: { orderBy: { stepNumber: "asc" } }, startedBy: { select: { name: true } } },
  });

  const inProgress = investigation?.status === "queued" || investigation?.status === "running";
  const parsed = investigation?.result ? InvestigationResultSchema.safeParse(investigation.result) : null;
  const result = parsed?.success ? parsed.data : null;

  // Look up every transaction the draft cites, limited to this customer.
  const evidenceIds = result
    ? [...new Set([...result.riskFactors, ...result.mitigatingFactors].flatMap((f) => f.evidenceTransactionIds))]
    : [];
  const evidence = evidenceIds.length
    ? await prisma.transaction.findMany({
        where: { id: { in: evidenceIds }, account: { customerId } },
      })
    : [];
  const evidenceById = new Map(evidence.map((t) => [t.id, t]));

  const button = (label: string) => (
    <form action={startInvestigation}>
      <input type="hidden" name="alertId" value={alertId} />
      <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
        {label}
      </button>
    </form>
  );

  const renderEvidence = (ids: string[]) =>
    ids.length === 0 ? null : (
      <ul className="mt-1 space-y-0.5 pl-4 text-xs text-gray-600">
        {ids.map((id) => {
          const t = evidenceById.get(id);
          return (
            <li key={id} className="tabular-nums">
              {t ? (
                <>
                  {formatDateTime(t.occurredAt)} · {t.direction === "in" ? "+" : "−"}
                  {formatNZD(t.amount)} · {t.channel} · {t.description ?? ""}
                  {t.counterpartyCountry && t.counterpartyCountry !== "NZ" ? ` · ${t.counterpartyCountry}` : ""}
                </>
              ) : (
                <span className="text-red-700">Transaction {id} not found</span>
              )}
            </li>
          );
        })}
      </ul>
    );

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Agent investigation</h2>
          <p className="text-sm text-gray-500">The agent drafts. You decide.</p>
        </div>
        {canInvestigate && !inProgress && button(investigation ? "Run again" : "Investigate")}
      </div>

      {!canInvestigate && cannotReason && <p className="text-sm text-gray-500">{cannotReason}</p>}

      {!investigation && canInvestigate && (
        <p className="text-sm text-gray-500">
          No investigation yet. The agent will gather evidence with read-only tools and draft a summary for you to review.
        </p>
      )}

      {investigation && (
        <p className="text-xs text-gray-500">
          {investigation.mode === "claude" ? `Claude (${investigation.model})` : "Fake mode, no AI"} · started by{" "}
          {investigation.startedBy.name} · {formatDateTime(investigation.createdAt)}
          {investigation.inputTokens + investigation.outputTokens > 0 &&
            ` · ${investigation.inputTokens.toLocaleString()} input + ${investigation.outputTokens.toLocaleString()} output tokens`}
        </p>
      )}

      {inProgress && (
        <div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Investigating… this page updates automatically.
          <AutoRefresh />
        </div>
      )}

      {investigation?.status === "failed" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          The investigation failed: {investigation.error}. You can run it again or investigate manually.
        </p>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded bg-gray-100 px-2 py-0.5">
              Suggested: <strong>{SUGGESTED_ACTION_LABELS[result.suggestedAction]}</strong>
            </span>
            <span className="rounded bg-gray-100 px-2 py-0.5">
              Confidence: <strong className="capitalize">{result.confidence}</strong>
            </span>
          </div>

          <p className="text-gray-800">{result.summary}</p>

          <div>
            <h3 className="text-sm font-semibold">Risk factors</h3>
            <ul className="mt-1 space-y-2 text-sm">
              {result.riskFactors.map((f, i) => (
                <li key={i}>
                  {f.description}
                  {renderEvidence(f.evidenceTransactionIds)}
                </li>
              ))}
            </ul>
          </div>

          {result.mitigatingFactors.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Mitigating factors</h3>
              <ul className="mt-1 space-y-2 text-sm">
                {result.mitigatingFactors.map((f, i) => (
                  <li key={i}>
                    {f.description}
                    {renderEvidence(f.evidenceTransactionIds)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.openQuestions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Open questions</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {result.openQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {investigation && investigation.steps.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-600">
            Investigation trail ({investigation.steps.length} steps)
          </summary>
          <ol className="mt-2 space-y-1 pl-5">
            {investigation.steps.map((s) => (
              <li key={s.id} className={s.isError ? "text-red-700" : ""}>
                <code className="text-xs">{s.toolName}</code>
                {JSON.stringify(s.toolInput) !== "{}" && (
                  <code className="ml-1 text-xs text-gray-500">{JSON.stringify(s.toolInput)}</code>
                )}{" "}
                → {s.outputSummary}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
