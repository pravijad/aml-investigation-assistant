import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { auditWhere } from "@/lib/audit-query";

const PAGE_SIZE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entity?: string; page?: string }>;
}) {
  await requireRole(["supervisor", "admin"]);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const where = auditWhere(params);

  const [entries, total, actions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { actor: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);

  const query = new URLSearchParams();
  if (params.action) query.set("action", params.action);
  if (params.entity) query.set("entity", params.entity);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (p: number) => `/audit?${new URLSearchParams({ ...Object.fromEntries(query), page: String(p) })}`;

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">Audit log</h1>
          <p className="text-sm text-gray-500">Every important action, newest first. Entries can&apos;t be edited or deleted.</p>
        </div>
        <a
          href={`/api/audit/export?${query.toString()}`}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-100"
        >
          Export CSV
        </a>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm">
        <label className="flex flex-col gap-1">
          Action
          <select name="action" defaultValue={params.action ?? ""} className="rounded-md border border-gray-300 px-2 py-1.5">
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a.action} value={a.action}>{a.action}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Record ID
          <input
            name="entity"
            defaultValue={params.entity ?? ""}
            placeholder="For example, an alert ID"
            className="w-64 rounded-md border border-gray-300 px-2 py-1.5"
          />
        </label>
        <button className="rounded-md bg-gray-900 px-4 py-1.5 font-medium text-white hover:bg-gray-700">Filter</button>
        <span className="pb-1.5 text-gray-500">{total} entries</span>
      </form>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Who</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Record</th>
              <th className="px-4 py-2 font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-gray-100 align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatDateTime(e.createdAt)}</td>
                <td className="px-4 py-2">{e.actor?.name ?? "System"}</td>
                <td className="px-4 py-2"><code className="text-xs">{e.action}</code></td>
                <td className="px-4 py-2">
                  {e.entityType}
                  {e.entityId && e.entityType === "alert" ? (
                    <Link href={`/alerts/${e.entityId}`} className="ml-1 text-blue-700 hover:underline">open</Link>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600">
                  {e.before ? <div>before: <code>{JSON.stringify(e.before)}</code></div> : null}
                  {e.after ? <div>after: <code>{JSON.stringify(e.after)}</code></div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
