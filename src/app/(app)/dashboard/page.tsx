import { requireRole } from "@/lib/auth";

export default async function DashboardPage() {
  await requireRole(["supervisor", "admin"]);
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="text-gray-600">Supervisors and admins only. Coming in phase 4.</p>
    </div>
  );
}
