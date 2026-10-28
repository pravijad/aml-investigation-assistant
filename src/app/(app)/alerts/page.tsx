import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  ALERT_STATUSES,
  OPEN_STATUSES,
  STATUS_LABELS,
  daysSince,
  formatNZD,
  isAlertStatus,
  riskBadgeClass,
} from "@/lib/format";

const PAGE_SIZE = 25;

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; rule?: string; mine?: string; page?: string; denied?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const mine = params.mine === "1";

  const where = {
    ...(isAlertStatus(params.status)
      ? { status: params.status }
      : params.status === "all"
        ? {}
        : { status: { in: OPEN_STATUSES } }),
    ...(params.rule ? { ruleCode: params.rule } : {}),
    ...(mine ? { assignedToId: user.userId } : {}),
  };

  const [alerts, total, rules] = await Promise.all([
    prisma.alert.findMany({
      where,
      orderBy: [{ riskScore: "desc" }, { triggeredAt: "asc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        customer: { select: { reference: true } },
        rule: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.alert.count({ where }),
    prisma.rule.findMany({ select: { code: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (p: number) => {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.rule) query.set("rule", params.rule);
    if (mine) query.set("mine", "1");
    query.set("page", String(p));
    return `/alerts?${query.toString()}`;
  };

  return (
    <div className="space-y-5">
      {params.denied && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You don&apos;t have access to that page.
        </p>
      )}

      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Alerts</h1>
        <p className="text-sm text-gray-500">{total} matching</p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm">
        <label className="flex flex-col gap-1">
          Status
          <select name="status" defaultValue={params.status ?? ""} className="rounded-md border border-gray-300 px-2 py-1.5">
            <option value="">Open alerts</option>
            <option value="all">All alerts</option>
            {ALERT_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Rule
          <select name="rule" defaultValue={params.rule ?? ""} className="rounded-md border border-gray-300 px-2 py-1.5">
            <option value="">All rules</option>
            {rules.map((r) => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1.5">
          <input type="checkbox" name="mine" value="1" defaultChecked={mine} />
          Assigned to me
        </label>
        <button className="rounded-md bg-gray-900 px-4 py-1.5 font-medium text-white hover:bg-gray-700">Filter</button>
      </form>

      {alerts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          No alerts match. An admin can run the detection rules from the Admin page.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Risk</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Rule</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Assigned to</th>
                <th className="px-4 py-2 text-right font-medium">Age</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => {
                const age = daysSince(alert.triggeredAt);
                const overdue = age > 5 && OPEN_STATUSES.includes(alert.status);
                return (
                  <tr key={alert.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <span className={`rounded px-2 py-0.5 font-semibold ${riskBadgeClass(alert.riskScore)}`}>
                        {alert.riskScore}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/alerts/${alert.id}`} className="font-medium text-blue-700 hover:underline">
                        {alert.customer.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{alert.rule.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNZD(alert.amountInvolved)}</td>
                    <td className="px-4 py-2">{STATUS_LABELS[alert.status]}</td>
                    <td className="px-4 py-2 text-gray-600">{alert.assignedTo?.name ?? "Unassigned"}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${overdue ? "font-semibold text-red-700" : ""}`}>
                      {age}d
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={pageLink(page - 1)} className="text-blue-700 hover:underline">Previous</Link> : <span />}
          <span className="text-gray-500">Page {page} of {pages}</span>
          {page < pages ? <Link href={pageLink(page + 1)} className="text-blue-700 hover:underline">Next</Link> : <span />}
        </div>
      )}
    </div>
  );
}
