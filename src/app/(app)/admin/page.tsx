import { requireRole } from "@/lib/auth";

export default async function AdminPage() {
  await requireRole(["admin"]);
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Admin</h1>
      <p className="text-gray-600">Admins only. Coming in phase 4.</p>
    </div>
  );
}
