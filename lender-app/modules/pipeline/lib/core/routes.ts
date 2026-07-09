/** Pipeline workspace: licensing reference and related helpers. */
import {
  isSyntheticHubClientKey,
  isSyntheticHubProjectKey,
} from "@/lib/pipeline/hubHierarchyKeys";

export const PIPELINE_LICENSES_PATH = "/pipeline/licenses" as const;

/** Query param used when returning from a file so the hub can highlight that row. */
export const PIPELINE_HUB_FOCUS_QUERY = "focus" as const;
export const PIPELINE_HUB_CLIENT_QUERY = "hubClient" as const;
export const PIPELINE_HUB_PROJECT_QUERY = "hubProject" as const;
export const PIPELINE_HUB_PROJECTION_QUERY = "hubMode" as const;
export const PIPELINE_HUB_ENTITY_QUERY = "hubEntity" as const;
/** Opens the file workspace with a drawer block expanded (e.g. `fileNotes`). */
export const PIPELINE_FILE_BLOCK_QUERY = "block" as const;
/** Opens the file workspace on a specific top-level tab (e.g. `documents`). */
export const PIPELINE_FILE_TAB_QUERY = "tab" as const;
/** Auto-expand a project block on `/pipeline/client/[clientId]`. */
export const PIPELINE_CLIENT_PROJECT_QUERY = "project" as const;

export type PipelineHubProjectionModeParam =
  | "client"
  | "project"
  | "file"
  | "lender"
  | "referral"
  | "team"
  | "task";

const PIPELINE_FILE_BASE = "/pipeline/file" as const;

export function pipelineLicensesHref(): string {
  return PIPELINE_LICENSES_PATH;
}

/** Hub list route; optional `focusFileId` scrolls/highlights that row once (URL is then normalized). */
export function pipelineHubHref(
  focusFileId?: string,
  opts?: {
    hubMode?: PipelineHubProjectionModeParam;
    hubEntity?: string;
    hubClient?: string;
    hubProject?: string;
  },
): string {
  const q = new URLSearchParams();
  if (focusFileId) q.set(PIPELINE_HUB_FOCUS_QUERY, focusFileId);
  if (opts?.hubMode) q.set(PIPELINE_HUB_PROJECTION_QUERY, opts.hubMode);
  if (opts?.hubEntity) q.set(PIPELINE_HUB_ENTITY_QUERY, opts.hubEntity);
  if (opts?.hubClient) q.set(PIPELINE_HUB_CLIENT_QUERY, opts.hubClient);
  if (opts?.hubProject) q.set(PIPELINE_HUB_PROJECT_QUERY, opts.hubProject);
  const qs = q.toString();
  return qs ? `/pipeline?${qs}` : "/pipeline";
}

export function pipelineHubProjectionHref(
  mode: PipelineHubProjectionModeParam,
  entityId?: string,
  focusFileId?: string,
): string {
  return pipelineHubHref(focusFileId, {
    hubMode: mode,
    hubEntity: entityId,
  });
}

/** True when the hub key maps to a persisted Convex `clients` document. */
export function shouldOpenClientWorkspace(clientKey: string): boolean {
  const key = clientKey.trim();
  return Boolean(key) && !isSyntheticHubClientKey(key);
}

function legacyHubClientFilterHref(clientKey: string): string {
  const q = new URLSearchParams();
  q.set(PIPELINE_HUB_CLIENT_QUERY, clientKey);
  q.set(PIPELINE_HUB_PROJECTION_QUERY, "client");
  return `/pipeline?${q.toString()}`;
}

function legacyHubProjectFilterHref(clientId: string, projectId: string): string {
  const q = new URLSearchParams();
  q.set(PIPELINE_HUB_CLIENT_QUERY, clientId);
  q.set(PIPELINE_HUB_PROJECT_QUERY, projectId);
  q.set(PIPELINE_HUB_PROJECTION_QUERY, "client");
  return `/pipeline?${q.toString()}`;
}

/** Phase 55 — canonical multi-tier client workspace (Client → Project → File). */
export function pipelineClientWorkspaceHref(
  clientId: string,
  opts?: { projectId?: string },
): string {
  const base = `/pipeline/client/${encodeURIComponent(clientId.trim())}`;
  const projectId = opts?.projectId?.trim();
  if (projectId && !isSyntheticHubProjectKey(projectId)) {
    const q = new URLSearchParams();
    q.set(PIPELINE_CLIENT_PROJECT_QUERY, projectId);
    return `${base}?${q.toString()}`;
  }
  return base;
}

/**
 * Canonical client navigation — fractal workspace for real Convex clients;
 * synthetic hub keys remain on the filtered hub list until normalized.
 */
export function resolveFractalClientWorkspaceHref(
  clientKey: string,
  projectKey?: string,
): string | null {
  const ck = clientKey.trim();
  if (!shouldOpenClientWorkspace(ck)) return null;
  const pk = projectKey?.trim();
  if (pk && !isSyntheticHubProjectKey(pk)) {
    return pipelineClientWorkspaceHref(ck, { projectId: pk });
  }
  return pipelineClientWorkspaceHref(ck);
}

/**
 * Hub / file chrome client navigation — fractal workspace for real clients;
 * legacy synthetic hub keys still open the filtered hub list.
 */
export function pipelineHubClientHref(clientId: string): string {
  const key = clientId.trim();
  if (!key) return pipelineHubHref();
  return resolveFractalClientWorkspaceHref(key) ?? legacyHubClientFilterHref(key);
}

/** Client workspace with optional project deep-link; legacy keys stay on hub filters. */
export function pipelineHubProjectHref(
  clientId: string,
  projectId: string,
): string {
  const ck = clientId.trim();
  const pk = projectId.trim();
  if (!ck || !pk) return pipelineHubHref();
  return (
    resolveFractalClientWorkspaceHref(ck, pk) ??
    legacyHubProjectFilterHref(ck, pk)
  );
}

/** Dedicated full-page pipeline file workspace. */
export function pipelineDealEditorHref(
  fileId: string,
  returnHub?: {
    hubMode?: PipelineHubProjectionModeParam;
    hubEntity?: string;
    hubClient?: string;
    hubProject?: string;
    /** Drawer section to expand on load (e.g. `fileNotes`). */
    focusBlock?: string;
    /** Top-level file workspace tab (e.g. `documents`). */
    tab?: string;
  },
): string {
  const q = new URLSearchParams();
  if (returnHub?.hubMode) {
    q.set(PIPELINE_HUB_PROJECTION_QUERY, returnHub.hubMode);
  }
  if (returnHub?.hubEntity) {
    q.set(PIPELINE_HUB_ENTITY_QUERY, returnHub.hubEntity);
  }
  if (returnHub?.hubClient) {
    q.set(PIPELINE_HUB_CLIENT_QUERY, returnHub.hubClient);
  }
  if (returnHub?.hubProject) {
    q.set(PIPELINE_HUB_PROJECT_QUERY, returnHub.hubProject);
  }
  if (returnHub?.focusBlock) {
    q.set(PIPELINE_FILE_BLOCK_QUERY, returnHub.focusBlock);
  }
  if (returnHub?.tab) {
    q.set(PIPELINE_FILE_TAB_QUERY, returnHub.tab);
  }
  const qs = q.toString();
  return `/pipeline/${encodeURIComponent(fileId)}${qs ? `?${qs}` : ""}`;
}

/** Print layout for a pipeline-hosted deal. */
export function pipelineDealPrintHref(fileId: string): string {
  return `${PIPELINE_FILE_BASE}/${fileId}/print`;
}
