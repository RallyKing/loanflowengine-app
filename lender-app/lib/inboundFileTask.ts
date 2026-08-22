/**
 * File-linked inbound task helpers (GHL Confirm Interest + webhook `create_file_task`).
 * Display dates use America/Chicago via `zonedParts` — never UTC for the title calendar date.
 */

import {
  DEFAULT_VIEWER_TIMEZONE,
  zonedParts,
} from "./dateTimeZone";

export const NEW_LEAD_TASK_TITLE_PREFIX = "NEW LEAD: Make Contact";

/** Org-specific BFS triage label: "BFS: Follow-up w/ Client". */
export const CONFIRM_INTEREST_BFS_TRIAGE_LABEL_ID =
  "jx7jmdznxsw4pqp13y096vfb4x87n1y6";

export const CREATE_FILE_TASK_ACTION = "create_file_task";

export type ParsedCreateFileTask = {
  relatedFileId: string;
  title: string;
  description?: string;
  triageLabelId?: string;
  triageLabelName?: string;
  category: "call";
  status: "todo";
};

export function formatNewLeadMakeContactTitle(
  nowMs: number,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): string {
  const p = zonedParts(new Date(nowMs), timeZone);
  return `${NEW_LEAD_TASK_TITLE_PREFIX} ${p.month}/${p.day}/${p.year}`;
}

export function titleStartsWithNewLeadMakeContact(title: string): boolean {
  return title.trim().startsWith(NEW_LEAD_TASK_TITLE_PREFIX);
}

function asNonEmptyString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (!t) return undefined;
  return t.slice(0, max);
}

function inboundRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Flatten webhook job payload (`{ body }`) or top-level JSON. */
export function unwrapInboundPayloadBody(payload: unknown): Record<string, unknown> | null {
  const root = inboundRecord(payload);
  if (!root) return null;
  const nested = inboundRecord(root.body);
  if (nested) return nested;
  return root;
}

export function parseCreateFileTaskPayload(
  payload: unknown,
  opts?: { requireAction?: boolean },
): ParsedCreateFileTask | null {
  const requireAction = opts?.requireAction !== false;
  const body = unwrapInboundPayloadBody(payload);
  if (!body) return null;
  const action = asNonEmptyString(body.action, 64)?.toLowerCase();
  if (action === CREATE_FILE_TASK_ACTION) {
    return parseCreateFileTaskFields(body);
  }
  const nested = inboundRecord(body.payload) ?? inboundRecord(body.args);
  if (nested) {
    const nestedAction = asNonEmptyString(nested.action, 64)?.toLowerCase();
    if (nestedAction === CREATE_FILE_TASK_ACTION) {
      return parseCreateFileTaskFields(nested);
    }
    if (!requireAction) return parseCreateFileTaskFields(nested);
  }
  if (!requireAction) return parseCreateFileTaskFields(body);
  return null;
}

function parseCreateFileTaskFields(
  body: Record<string, unknown>,
): ParsedCreateFileTask | null {
  const relatedFileId =
    asNonEmptyString(body.relatedFileId, 64) ??
    asNonEmptyString(body.pipelineFileId, 64) ??
    asNonEmptyString(body.fileId, 64);
  const title = asNonEmptyString(body.title, 200);
  if (!relatedFileId || !title) return null;

  const categoryRaw = asNonEmptyString(body.category, 32)?.toLowerCase();
  if (categoryRaw && categoryRaw !== "call") return null;
  const statusRaw = asNonEmptyString(body.status, 32)?.toLowerCase();
  if (statusRaw && statusRaw !== "todo") return null;

  const description =
    asNonEmptyString(body.description, 4000) ??
    asNonEmptyString(body.body, 4000);

  return {
    relatedFileId,
    title,
    description,
    triageLabelId: asNonEmptyString(body.triageLabelId, 64),
    triageLabelName: asNonEmptyString(body.triageLabelName, 120),
    category: "call",
    status: "todo",
  };
}
