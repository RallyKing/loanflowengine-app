/**
 * Compact pipeline file activity / audit helpers (pure; no I/O).
 */

import { normalizePipelineDrawerLayout } from "./pipelineDrawerLayoutStorage";

export const PIPELINE_FILE_ACTIVITY_SUMMARY_MAX = 420;

/** Max rows kept per file (older rows are pruned after inserts). */
export const PIPELINE_FILE_ACTIVITY_MAX_PER_FILE = 500;

export type PipelineFileActivityKind =
  | "file_created"
  | "data_patch"
  | "deal_patch"
  | "drawer_layout"
  | "contact_link"
  | "contact_unlink"
  | "contact_link_update"
  | "lender_attach"
  | "lender_detach"
  | "lender_select"
  | "automation"
  | "undo"
  | "share_grant"
  | "share_revoke"
  | "share_update"
  | "client_momentum"
  | "vault_client_upload"
  | "vault_broker_review"
  | "lender_delivery_accessed"
  | "lender_document_previewed"
  | "lender_folder_expanded"
  | "lender_package_exported";

export function clampActivitySummary(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t.length <= PIPELINE_FILE_ACTIVITY_SUMMARY_MAX
    ? t
    : `${t.slice(0, PIPELINE_FILE_ACTIVITY_SUMMARY_MAX)}…`;
}

/** Meaningful drawer edits: sections shown/hidden, order, or block settings — not expand/collapse only. */
export function drawerLayoutAuditTargetsChanged(
  prevRaw: unknown,
  nextRaw: unknown,
): boolean {
  const prev = normalizePipelineDrawerLayout(prevRaw);
  const next = normalizePipelineDrawerLayout(nextRaw);
  if (prev.order.join("\0") !== next.order.join("\0")) return true;
  const ph = [...prev.hidden].sort().join("\0");
  const nh = [...next.hidden].sort().join("\0");
  if (ph !== nh) return true;
  if (JSON.stringify(prev.settings ?? {}) !== JSON.stringify(next.settings ?? {})) {
    return true;
  }
  return false;
}

export function diffDrawerBlocksShownHidden(
  prevRaw: unknown,
  nextRaw: unknown,
): { blocksShown: string[]; blocksHidden: string[] } {
  const prev = normalizePipelineDrawerLayout(prevRaw);
  const next = normalizePipelineDrawerLayout(nextRaw);
  const prevH = new Set(prev.hidden);
  const nextH = new Set(next.hidden);
  const blocksShown = sortIds([...prevH].filter((id) => !nextH.has(id)));
  const blocksHidden = sortIds([...nextH].filter((id) => !prevH.has(id)));
  return { blocksShown, blocksHidden };
}

function sortIds(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

export function kindLabel(kind: PipelineFileActivityKind): string {
  switch (kind) {
    case "file_created":
      return "File created";
    case "data_patch":
      return "File data";
    case "deal_patch":
      return "Deal workspace";
    case "drawer_layout":
      return "Drawer sections";
    case "contact_link":
      return "Contact linked";
    case "contact_unlink":
      return "Contact removed";
    case "contact_link_update":
      return "Contact updated";
    case "lender_attach":
      return "Lender attached";
    case "lender_detach":
      return "Lender removed";
    case "lender_select":
      return "Lender selection";
    case "automation":
      return "Automation";
    case "undo":
      return "Undo";
    case "share_grant":
      return "Sharing granted";
    case "share_revoke":
      return "Sharing removed";
    case "share_update":
      return "Sharing updated";
    case "client_momentum":
      return "Client confidence";
    case "vault_client_upload":
      return "Client upload";
    case "vault_broker_review":
      return "Broker review";
    case "lender_delivery_accessed":
      return "Lender data room";
    case "lender_document_previewed":
      return "Document previewed";
    case "lender_folder_expanded":
      return "Folder viewed";
    case "lender_package_exported":
      return "Package downloaded";
    default:
      return kind;
  }
}
