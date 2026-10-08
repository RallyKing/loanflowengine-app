import type { AlertCategory } from "@/lib/alerts/alertCategories";

/**
 * Stable dedupe key: user + category + entity + fireAt.
 * One alert per that tuple (idempotent fire / backfill).
 */
export function buildAlertDedupeKey(args: {
  userKey: string;
  category: AlertCategory;
  entityType: string;
  entityId: string;
  fireAt: number;
}): string {
  const userKey = args.userKey.trim();
  const entityId = args.entityId.trim();
  if (!userKey || !entityId || !Number.isFinite(args.fireAt)) {
    throw new Error("Invalid alert dedupe inputs");
  }
  return [
    "alert",
    userKey,
    args.category,
    args.entityType,
    entityId,
    String(Math.trunc(args.fireAt)),
  ].join(":");
}
