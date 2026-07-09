/**
 * Phase 15 Step 14.3 — hub delete targets via `ctx.db.normalizeId` (schema-safe boundary).
 */
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  normalizeHubClientKey,
  normalizeHubProjectKey,
} from "../lib/pipeline/hubHierarchyKeys";

export type HubClientDeletionTarget =
  | { kind: "record"; clientId: Id<"clients"> }
  | {
      kind: "synthetic";
      canonicalHubKey: string;
      displayName: string;
    };

export type HubProjectDeletionTarget =
  | { kind: "record"; projectId: Id<"projects"> }
  | {
      kind: "synthetic";
      canonicalHubKey: string;
      projectTitle: string;
      hubClientKey: string;
    };

/** Never pass synthetic strings to `ctx.db.get("clients", …)`. */
export function resolveHubClientDeletionTarget(
  ctx: QueryCtx | MutationCtx,
  hubClientKey: string,
): HubClientDeletionTarget {
  const trimmed = hubClientKey.trim();
  const clientId = ctx.db.normalizeId("clients", trimmed);
  if (clientId != null) {
    return { kind: "record", clientId };
  }
  const norm = normalizeHubClientKey(trimmed);
  return {
    kind: "synthetic",
    canonicalHubKey: norm.canonicalHubKey,
    displayName: norm.displayName,
  };
}

export function resolveHubProjectDeletionTarget(
  ctx: QueryCtx | MutationCtx,
  hubProjectKey: string,
): HubProjectDeletionTarget {
  const trimmed = hubProjectKey.trim();
  const projectId = ctx.db.normalizeId("projects", trimmed);
  if (projectId != null) {
    return { kind: "record", projectId };
  }
  const norm = normalizeHubProjectKey(trimmed);
  return {
    kind: "synthetic",
    canonicalHubKey: norm.canonicalHubKey,
    projectTitle: norm.projectTitle,
    hubClientKey: norm.hubClientKey,
  };
}

export function normalizePipelineClientId(
  ctx: QueryCtx | MutationCtx,
  raw: string | undefined | null,
): Id<"clients"> | null {
  if (!raw) return null;
  return ctx.db.normalizeId("clients", String(raw).trim());
}

export function normalizePipelineProjectId(
  ctx: QueryCtx | MutationCtx,
  raw: string | undefined | null,
): Id<"projects"> | null {
  if (!raw) return null;
  return ctx.db.normalizeId("projects", String(raw).trim());
}
