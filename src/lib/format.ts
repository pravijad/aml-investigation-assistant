export const DAY = 24 * 60 * 60 * 1000;

export const ALERT_STATUSES = [
  "new",
  "in_review",
  "info_requested",
  "escalated",
  "closed_false_positive",
  "closed_after_review",
  "report_advised",
] as const;

export type AlertStatusValue = (typeof ALERT_STATUSES)[number];

export const OPEN_STATUSES: AlertStatusValue[] = ["new", "in_review", "info_requested", "escalated"];

export const STATUS_LABELS: Record<AlertStatusValue, string> = {
  new: "New",
  in_review: "In review",
  info_requested: "Info requested",
  escalated: "Escalated",
  closed_false_positive: "Closed: false positive",
  closed_after_review: "Closed after review",
  report_advised: "Report advised",
};

export function isAlertStatus(value: string | undefined): value is AlertStatusValue {
  return !!value && (ALERT_STATUSES as readonly string[]).includes(value);
}

export function formatNZD(value: unknown) {
  return Number(value).toLocaleString("en-NZ", { style: "currency", currency: "NZD" });
}

export function formatDate(date: Date) {
  return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(date: Date) {
  return date.toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function daysSince(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / DAY);
}

export function riskBadgeClass(score: number) {
  if (score >= 70) return "bg-red-100 text-red-800";
  if (score >= 50) return "bg-amber-100 text-amber-800";
  return "bg-gray-100 text-gray-700";
}
