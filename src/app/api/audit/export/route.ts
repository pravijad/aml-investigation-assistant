import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { auditWhere } from "@/lib/audit-query";

// Quotes a value for CSV. Values starting with = + - @ are prefixed with ' so
// spreadsheet apps don't run them as formulas (CSV injection).
function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || (session.role !== "supervisor" && session.role !== "admin")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const where = auditWhere({ action: url.searchParams.get("action"), entity: url.searchParams.get("entity") });

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000,
    include: { actor: { select: { email: true } } },
  });

  const header = ["created_at", "actor", "action", "entity_type", "entity_id", "before", "after"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [r.createdAt.toISOString(), r.actor?.email ?? "system", r.action, r.entityType, r.entityId, r.before, r.after]
        .map(csvCell)
        .join(","),
    ),
  ];

  await writeAudit({ actorId: session.userId, action: "audit.exported", entityType: "audit", after: { rows: rows.length } });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${date}.csv"`,
    },
  });
}
