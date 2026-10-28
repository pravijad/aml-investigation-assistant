import { prisma } from "@/lib/db";

type JsonRecord = Record<string, string | number | boolean | null>;

type AuditInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: JsonRecord;
  after?: JsonRecord;
};

// Records who did what, and when. The app never edits or deletes audit entries.
export async function writeAudit(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: input.before,
      after: input.after,
    },
  });
}
