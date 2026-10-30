import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  DAY,
  OPEN_STATUSES,
  STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatNZD,
  riskBadgeClass,
} from "@/lib/format";
import { assignToMe } from "../actions";
import { InvestigationPanel } from "./investigation-panel";
import { DecisionPanel } from "./decision-panel";

export default async function AlertDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ taken?: string; cannot?: string; decided?: string; decisionError?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { taken, cannot, decided, decisionError } = await searchParams;

  const alert = await prisma.alert.findUnique({
    where: { id },
    include: {
      customer: true,
      rule: true,
      assignedTo: { select: { name: true } },
      transactions: { select: { transactionId: true } },
    },
  });
  if (!alert) notFound();

  const triggering = new Set(alert.transactions.map((t) => t.transactionId));

  const [timeline, pastAlerts] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        account: { customerId: alert.customerId },
        occurredAt: {
          gte: new Date(alert.windowStart.getTime() - 30 * DAY),
          lte: new Date(alert.windowEnd.getTime() + 7 * DAY),
        },
      },
      orderBy: { occurredAt: "desc" },
      take: 150,
    }),
    prisma.alert.findMany({
      where: { customerId: alert.customerId, NOT: { id: alert.id } },
      include: { rule: { select: { name: true } } },
      orderBy: { triggeredAt: "desc" },
      take: 10,
    }),
  ]);

  const canAssign =
    (user.role === "analyst" || user.role === "supervisor") && !alert.assignedToId && alert.status === "new";

  const isWorker = user.role === "analyst" || user.role === "supervisor";
  const canInvestigate =
    isWorker &&
    alert.status !== "new" &&
    OPEN_STATUSES.includes(alert.status) &&
    (alert.assignedToId === user.userId || user.role === "supervisor");
  const cannotReason = !isWorker
    ? "Only analysts and supervisors can run investigations."
    : alert.status === "new"
      ? "Assign this alert to yourself to run an investigation."
      : !OPEN_STATUSES.includes(alert.status)
        ? "This alert is closed."
        : "This alert is assigned to someone else.";

  return (
    <div className="space-y-6">
      <Link href="/alerts" className="text-sm text-blue-700 hover:underline">← Back to alerts</Link>

      {cannot && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You can&apos;t run an investigation on this alert right now.
        </p>
      )}

      {taken && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Someone else picked up this alert first.
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-5">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className={`rounded px-2 py-0.5 text-lg font-semibold ${riskBadgeClass(alert.riskScore)}`}>
              {alert.riskScore}
            </span>
            <h1 className="text-xl font-semibold">{alert.rule.name}</h1>
          </div>
          <p className="max-w-2xl text-gray-700">{alert.summary}</p>
          <p className="text-sm text-gray-500">
            {STATUS_LABELS[alert.status]} · {alert.assignedTo ? `Assigned to ${alert.assignedTo.name}` : "Unassigned"} ·
            Raised {formatDateTime(alert.triggeredAt)}
          </p>
        </div>
        {canAssign && (
          <form action={assignToMe}>
            <input type="hidden" name="alertId" value={alert.id} />
            <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
              Assign to me
            </button>
          </form>
        )}
      </div>

      <InvestigationPanel
        alertId={alert.id}
        customerId={alert.customerId}
        canInvestigate={canInvestigate}
        cannotReason={canInvestigate ? null : cannotReason}
      />

      <DecisionPanel
        alert={{ id: alert.id, status: alert.status, assignedToId: alert.assignedToId }}
        user={user}
        decided={!!decided}
        decisionError={decisionError}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">Customer</h2>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-gray-500">Reference</dt><dd className="font-medium">{alert.customer.reference}</dd></div>
            <div><dt className="text-gray-500">Occupation</dt><dd>{alert.customer.occupation}</dd></div>
            <div><dt className="text-gray-500">Risk rating</dt><dd className="capitalize">{alert.customer.riskRating}</dd></div>
            <div><dt className="text-gray-500">Expected monthly volume</dt><dd>{formatNZD(alert.customer.expectedMonthlyVolume)}</dd></div>
            <div><dt className="text-gray-500">Customer since</dt><dd>{formatDate(alert.customer.onboardedAt)}</dd></div>
          </dl>
        </section>

        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5 lg:col-span-2">
          <h2 className="font-semibold">Past alerts for this customer</h2>
          {pastAlerts.length === 0 ? (
            <p className="text-sm text-gray-500">None.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {pastAlerts.map((a) => (
                <li key={a.id}>
                  <Link href={`/alerts/${a.id}`} className="text-blue-700 hover:underline">{a.rule.name}</Link>{" "}
                  · {STATUS_LABELS[a.status]} · {formatDate(a.triggeredAt)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Transactions around the alert</h2>
          <p className="text-sm text-gray-500">Highlighted rows triggered the rule</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Description</th>
                <th className="py-2 pr-4 font-medium">Channel</th>
                <th className="py-2 pr-4 font-medium">Counterparty</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b border-gray-100 last:border-0 ${triggering.has(t.id) ? "bg-amber-50 font-medium" : ""}`}
                >
                  <td className="py-1.5 pr-4 tabular-nums">{formatDateTime(t.occurredAt)}</td>
                  <td className="py-1.5 pr-4">{t.description}</td>
                  <td className="py-1.5 pr-4 capitalize">{t.channel}</td>
                  <td className="py-1.5 pr-4">
                    {t.counterparty ?? "—"}
                    {t.counterpartyCountry && t.counterpartyCountry !== "NZ" ? ` (${t.counterpartyCountry})` : ""}
                  </td>
                  <td className={`py-1.5 text-right tabular-nums ${t.direction === "in" ? "text-green-700" : ""}`}>
                    {t.direction === "in" ? "+" : "−"}
                    {formatNZD(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
