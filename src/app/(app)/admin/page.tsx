import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { runRulesAction, updateRule } from "./actions";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; saved?: string; error?: string }>;
}) {
  await requireRole(["admin"]);
  const { created, saved, error } = await searchParams;
  const rules = await prisma.rule.findMany({ orderBy: { baseScore: "desc" } });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Admin</h1>

      {created !== undefined && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Rules finished. {created} new alert{created === "1" ? "" : "s"} created.
        </p>
      )}
      {saved && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">Saved changes to {saved}.</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-5">
        <div>
          <h2 className="font-semibold">Run detection rules</h2>
          <p className="text-sm text-gray-500">Checks every customer. Patterns already alerted are skipped.</p>
        </div>
        <form action={runRulesAction}>
          <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
            Run rules now
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Detection rules</h2>
        <p className="text-sm text-gray-500">
          Changes apply the next time the rules run, and every change is recorded in the audit log.
        </p>
        {rules.map((rule) => (
          <form key={rule.id} action={updateRule} className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
            <input type="hidden" name="ruleId" value={rule.id} />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{rule.name}</p>
                <p className="text-sm text-gray-500">{rule.description}</p>
                <p className="mt-1 text-xs text-gray-400">Last changed {formatDateTime(rule.updatedAt)}</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="enabled" defaultChecked={rule.enabled} />
                Enabled
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <label className="text-sm font-medium">
                Base score
                <input
                  type="number"
                  name="baseScore"
                  min={0}
                  max={100}
                  defaultValue={rule.baseScore}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 font-normal"
                />
              </label>
              <label className="text-sm font-medium">
                Settings (JSON)
                <textarea
                  name="params"
                  rows={4}
                  defaultValue={JSON.stringify(rule.params, null, 2)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 font-mono text-xs font-normal"
                />
              </label>
            </div>
            <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100">Save</button>
          </form>
        ))}
      </section>
    </div>
  );
}
