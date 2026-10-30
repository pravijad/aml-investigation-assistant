// Shared filters for the audit log page and its CSV export.
export function auditWhere(params: { action?: string | null; entity?: string | null }) {
  return {
    ...(params.action ? { action: params.action } : {}),
    ...(params.entity ? { entityId: params.entity.trim() } : {}),
  };
}
