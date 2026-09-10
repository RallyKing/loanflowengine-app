/**
 * Presentation helpers for the org activity feed (`/activity`).
 * Keeps cards human-readable: no raw JSON, no internal Convex IDs as labels,
 * and collapses near-duplicate approval/status events from dual writers.
 */

/** Convex document ids are typically 32+ URL-safe chars. */
const CONVEX_ID_RE = /\b[a-z][a-z0-9]{20,}\b/gi;

const KIND_LABELS: Record<string, string> = {
  "file.file_created": "File created",
  "file.deal_patch": "Deal updated",
  "file.drawer_layout": "Drawer layout",
  "file.contact_link": "Contact linked",
  "file.contact_unlink": "Contact unlinked",
  "file.contact_link_update": "Contact link updated",
  "file.lender_attach": "Lender attached",
  "file.lender_detach": "Lender removed",
  "file.lender_select": "Lender selected",
  "file.automation": "Automation",
  "file.undo": "Undo",
  "file.share_grant": "Share granted",
  "file.share_revoke": "Share revoked",
  "file.share_update": "Share updated",
  "file.client_momentum": "Client confidence",
  "file.vault_client_upload": "Client upload",
  "file.vault_broker_review": "Broker review",
  "file.lender_delivery_accessed": "Lender data room",
  "file.lender_document_previewed": "Document previewed",
  "file.lender_folder_expanded": "Folder viewed",
  "file.lender_package_exported": "Package downloaded",
  "file.data_patch": "File updated",
  "collaboration.file_created": "File created",
  "collaboration.file_updated": "File updated",
  "collaboration.status_changed": "Status changed",
  "collaboration.task_assigned": "Task assigned",
  "collaboration.task_completed": "Task completed",
  "collaboration.comment_added": "Comment",
  "collaboration.document_uploaded": "Document uploaded",
  "collaboration.lender_interaction_created": "Lender interaction",
  "collaboration.note_edited": "Note edited",
  "collaboration.ownership_changed": "Ownership changed",
  "collaboration.deadline_changed": "Deadline changed",
  "collaboration.assignment_changed": "Assignment changed",
  "collaboration.communication_sent": "Message sent",
  "collaboration.communication_delivered": "Message delivered",
  "collaboration.communication_failed": "Message failed",
  "collaboration.communication_retry_scheduled": "Message retry",
  contact_created: "Contact created",
  contact_updated: "Contact updated",
  contact_deleted: "Contact deleted",
  stage_created: "Stage created",
  stage_updated: "Stage updated",
  stage_deleted: "Stage deleted",
  substage_created: "Sub-stage created",
  substage_updated: "Sub-stage updated",
  substage_deleted: "Sub-stage deleted",
};

const APPROVAL_OR_STATUS_KIND_RE =
  /(status_changed|vault_broker_review|approval|approved|stage_)/i;

const DEDUPE_WINDOW_MS = 30_000;

export type ActivityFeedPresentable = {
  _id: string;
  at: number;
  category: "file" | "contact" | "lender" | "task";
  kind: string;
  summary: string;
  detail?: string;
  actorKey: string;
  actorDisplayUsername?: string;
  fileId?: string;
  contactId?: string;
  lenderId?: string;
  taskId?: string;
};

export function humanizeFeedKind(kind: string): string {
  const trimmed = kind.trim();
  if (!trimmed) return "Activity";
  const known = KIND_LABELS[trimmed];
  if (known) return known;
  const leaf = trimmed.includes(".")
    ? trimmed.slice(trimmed.lastIndexOf(".") + 1)
    : trimmed;
  return leaf
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function looksLikeJsonBlob(text: string): boolean {
  const t = text.trim();
  return (
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]"))
  );
}

function isLikelyConvexId(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const t = value.trim();
  return /^[a-z][a-z0-9]{20,}$/i.test(t);
}

function formatScalar(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!t || isLikelyConvexId(t)) return null;
    return t.length > 120 ? `${t.slice(0, 118)}…` : t;
  }
  return null;
}

const DELTA_LABELS: Record<string, string> = {
  previousStatus: "From status",
  nextStatus: "To status",
  previousStageId: "From stage",
  nextStageId: "To stage",
  previousSubStageId: "From sub-stage",
  nextSubStageId: "To sub-stage",
  status: "Status",
  approval: "Approval",
  decision: "Decision",
  outcome: "Outcome",
  reviewStatus: "Review",
  brokerDecision: "Broker decision",
};

/**
 * Turn a collaboration `delta` object into a short human line.
 * Drops raw Convex IDs; prefers status/approval labels.
 */
export function formatCollaborationDelta(delta: unknown): string | null {
  if (delta == null || typeof delta !== "object" || Array.isArray(delta)) {
    return null;
  }
  const obj = delta as Record<string, unknown>;
  const prevStatus = formatScalar(obj.previousStatus);
  const nextStatus = formatScalar(obj.nextStatus);
  if (prevStatus && nextStatus) {
    return `${prevStatus} → ${nextStatus}`;
  }
  if (nextStatus) return `Now: ${nextStatus}`;

  const approval =
    formatScalar(obj.approval) ??
    formatScalar(obj.decision) ??
    formatScalar(obj.outcome) ??
    formatScalar(obj.reviewStatus) ??
    formatScalar(obj.brokerDecision);
  if (approval) return approval;

  const parts: string[] = [];
  for (const [key, raw] of Object.entries(obj)) {
    if (/Id$/i.test(key) || isLikelyConvexId(raw)) continue;
    const label = DELTA_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").trim();
    const val = formatScalar(raw);
    if (!val) continue;
    parts.push(`${label}: ${val}`);
    if (parts.length >= 4) break;
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Hide raw JSON / internal IDs from the detail line shown on cards. */
export function formatFeedDetail(detail: string | undefined | null): string | null {
  if (detail == null) return null;
  const raw = detail.trim();
  if (!raw) return null;

  if (looksLikeJsonBlob(raw)) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const formatted = formatCollaborationDelta(parsed);
      return formatted;
    } catch {
      return null;
    }
  }

  const cleaned = stripInternalIds(raw).trim();
  if (!cleaned || cleaned === "—" || cleaned === "-") return null;
  if (looksLikeJsonBlob(cleaned)) return null;
  return cleaned.length > 240 ? `${cleaned.slice(0, 238)}…` : cleaned;
}

export function stripInternalIds(text: string): string {
  return text
    .replace(CONVEX_ID_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s([,;:·])/g, "$1")
    .replace(/([(\[{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .trim();
}

export function sanitizeFeedSummary(summary: string): string {
  const cleaned = stripInternalIds(summary.trim());
  return cleaned || "Activity update";
}

function normalizeSummaryKey(summary: string): string {
  return sanitizeFeedSummary(summary)
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isApprovalOrStatusRow(row: ActivityFeedPresentable): boolean {
  if (APPROVAL_OR_STATUS_KIND_RE.test(row.kind)) return true;
  return /approv|status|stage|review|decision/i.test(row.summary);
}

function scoreRowForKeep(row: ActivityFeedPresentable): number {
  let score = 0;
  const detail = row.detail?.trim() ?? "";
  if (detail && !looksLikeJsonBlob(detail)) score += 3;
  if (detail && looksLikeJsonBlob(detail)) score -= 2;
  if (row.kind.startsWith("file.")) score += 1;
  if (row.kind.startsWith("collaboration.")) score -= 0;
  if (row.contactId || row.lenderId || row.taskId) score += 1;
  return score;
}

/**
 * Collapse near-duplicate approval/status events that arrive from dual writers
 * (pipeline file activity + collaboration mirror) in different formats.
 */
export function dedupeActivityFeedRows<T extends ActivityFeedPresentable>(
  rows: T[],
): T[] {
  if (rows.length <= 1) return rows;
  const sorted = [...rows].sort((a, b) => b.at - a.at);
  const kept: T[] = [];

  for (const row of sorted) {
    if (!isApprovalOrStatusRow(row)) {
      kept.push(row);
      continue;
    }
    const key = normalizeSummaryKey(row.summary);
    const dupIdx = kept.findIndex((existing) => {
      if (!isApprovalOrStatusRow(existing)) return false;
      if (Math.abs(existing.at - row.at) > DEDUPE_WINDOW_MS) return false;
      const sameFile =
        Boolean(existing.fileId) &&
        Boolean(row.fileId) &&
        existing.fileId === row.fileId;
      const sameActor = existing.actorKey === row.actorKey;
      if (!sameFile && !(sameActor && !existing.fileId && !row.fileId)) {
        return false;
      }
      const existingKey = normalizeSummaryKey(existing.summary);
      if (existingKey === key) return true;
      // Same file + overlapping approval vocabulary within window
      const bothApprovalish =
        /approv|status|stage|review|decision/i.test(existing.summary) &&
        /approv|status|stage|review|decision/i.test(row.summary);
      return bothApprovalish && sameFile && sameActor;
    });

    if (dupIdx < 0) {
      kept.push(row);
      continue;
    }

    const existing = kept[dupIdx]!;
    if (scoreRowForKeep(row) > scoreRowForKeep(existing)) {
      kept[dupIdx] = row;
    }
  }

  return kept.sort((a, b) => b.at - a.at);
}

/**
 * Deep links aligned with `registryCommandCenterHref` / notification deep links
 * when record IDs are present (audit P1-08).
 */
export function activityFeedContactHref(contactId: string): string {
  return `/contacts/${encodeURIComponent(contactId)}`;
}

export function activityFeedLenderHref(lenderId: string): string {
  return `/lenders?lender=${encodeURIComponent(lenderId)}`;
}

export function activityFeedTaskHref(taskId: string): string {
  return `/tasks?task=${encodeURIComponent(taskId)}`;
}
