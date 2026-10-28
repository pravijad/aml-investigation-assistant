import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const [customers, transactions] = await Promise.all([
    prisma.customer.count(),
    prisma.transaction.count(),
  ]);

  return (
    <div className="space-y-4">
      {denied && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You don&apos;t have access to that page.
        </p>
      )}
      <h1 className="text-xl font-semibold">Alerts</h1>
      <p className="text-gray-600">
        Welcome, {user.name}. The alert queue arrives in phase 2.
      </p>
      <p className="text-sm text-gray-500">
        Database: {customers} customers, {transactions} transactions.
      </p>
    </div>
  );
}
