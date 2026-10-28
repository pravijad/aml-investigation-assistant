import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { runRulesAction } from "./actions";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  await requireRole(["admin"]);
  const { created } = await searchParams;
  const rules = await prisma.rule.findMany({ orderBy: { baseScore: "desc" } });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Admin</h1>

      {created !== undefined && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Rules finished. {created} new alert{created === "1" ? "" : "s"} created.
        </p>
      )}

      <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Detection rules</h2>
            <p className="text-sm text-gray-500">
              Running the rules checks every customer. Patterns already alerted are skipped.
            </p>
          </div>
          <form action={runRulesAction}>
            <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
              Run rules now
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="py-2 pr-4 font-medium">Rule</th>
                <th className="py-2 pr-4 font-medium">Enabled</th>
                <th className="py-2 pr-4 font-medium">Base score</th>
                <th className="py-2 font-medium">Settings</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-gray-100 align-top last:border-0">
                  <td className="py-2 pr-4">
                    <p className="font-medium">{rule.name}</p>
                    <p className="text-gray-500">{rule.description}</p>
                  </td>
                  <td className="py-2 pr-4">{rule.enabled ? "Yes" : "No"}</td>
                  <td className="py-2 pr-4">{rule.baseScore}</td>
                  <td className="py-2">
                    <code className="rounded bg-gray-50 px-2 py-1 text-xs">{JSON.stringify(rule.params)}</code>
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
