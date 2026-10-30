import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";

// Every page inside the (app) folder requires a signed-in user.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const isSupervisor = user.role === "supervisor";
  const canOversee = user.role === "supervisor" || user.role === "admin";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <nav className="flex items-center gap-6 text-sm">
          <span className="text-base font-semibold">CaseLens</span>
          <Link href="/alerts" className="hover:underline">Alerts</Link>
          {isSupervisor && (
            <Link href="/alerts?status=escalated" className="hover:underline">Escalated</Link>
          )}
          {canOversee && <Link href="/dashboard" className="hover:underline">Dashboard</Link>}
          {canOversee && <Link href="/audit" className="hover:underline">Audit log</Link>}
          {user.role === "admin" && <Link href="/admin" className="hover:underline">Admin</Link>}
        </nav>
        <div className="flex items-center gap-4 text-sm">
          <span>
            {user.name} · <span className="capitalize">{user.role}</span>
          </span>
          <form action={logout}>
            <button className="rounded-md border border-gray-300 px-3 py-1 hover:bg-gray-100">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
