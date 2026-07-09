/** Outbound webhook API — versioned envelope sent to subscriber HTTPS endpoints.
 *
 * **Verifying deliveries:** recompute the hex HMAC-SHA256 of the signing secret over
 * the string `X-Webhook-Timestamp + "." + rawBody`, where `rawBody` is the exact JSON
 * request body. Compare to `X-Webhook-Signature` (after the `sha256=` prefix). Reject
 * replays if the timestamp skew is too large (e.g. more than five minutes).
 */

export const WEBHOOK_PAYLOAD_SCHEMA_VERSION = 1 as const;

/** Subscribe to these (or `*` for all). */
export const WORKFLOW_AUTOMATION_EVENT = "workflow.automation";

export const OUTBOUND_WEBHOOK_EVENT_TYPES = [
  "pipeline.file.created",
  "pipeline.file.updated",
  "pipeline.file.status_changed",
  "pipeline.file.archived",
  "pipeline.file.restored",
  WORKFLOW_AUTOMATION_EVENT,
  "*",
] as const;

export type OutboundWebhookEventType =
  (typeof OUTBOUND_WEBHOOK_EVENT_TYPES)[number];

const ALLOWED = new Set<string>(OUTBOUND_WEBHOOK_EVENT_TYPES);

export function sanitizeOutboundWebhookEventTypes(
  raw: readonly string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    const t = s.trim();
    if (!ALLOWED.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export type WebhookEnvelopeV1 = {
  schemaVersion: typeof WEBHOOK_PAYLOAD_SCHEMA_VERSION;
  eventId: string;
  type: string;
  timestamp: number;
  organizationId: string;
  resource: {
    type: string;
    id: string;
  };
  data: Record<string, unknown>;
};

export function buildWebhookEnvelopeV1(args: {
  eventId: string;
  type: string;
  organizationId: string;
  resourceType: string;
  resourceId: string;
  data: Record<string, unknown>;
}): WebhookEnvelopeV1 {
  return {
    schemaVersion: WEBHOOK_PAYLOAD_SCHEMA_VERSION,
    eventId: args.eventId,
    type: args.type,
    timestamp: Date.now(),
    organizationId: args.organizationId,
    resource: { type: args.resourceType, id: args.resourceId },
    data: args.data,
  };
}

export function newWebhookEventId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
}

export function assertHttpsWebhookUrl(url: string): void {
  const t = url.trim();
  if (!t) throw new Error("Webhook URL is required.");
  let parsed: URL;
  try {
    parsed = new URL(t);
  } catch {
    throw new Error("Webhook URL must be a valid absolute URL.");
  }
  if (parsed.protocol === "https:") return;
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]"
  ) {
    return;
  }
  throw new Error(
    "Webhook URL must use https, or http(s) to localhost for development.",
  );
}
