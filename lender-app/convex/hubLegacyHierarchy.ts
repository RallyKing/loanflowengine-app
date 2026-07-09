/**
 * Phase 15 Step 14.1 / 14.2 — resolve pipeline files grouped by hub legacy/synthetic keys.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  assertOrgPermission,
  filterPipelineByOrgScope,
  filterPipelineRowsForMember,
  resolveMemberUserKey,
} from "./organizationAccess";
import {
  safeResolveFileHierarchy,
} from "./pipelineHierarchyCompat";
import {
  hubClientKeyFromHierarchy,
  hubProjectKeyFromHierarchy,
  legacyDisplayNameMatches,
  normalizeHubClientKey,
} from "../lib/pipeline/hubHierarchyKeys";
import {
  resolveHubClientDeletionTarget,
  resolveHubProjectDeletionTarget,
} from "./hubDeletionTargets";
import {
  legacyClientProjectFromDealData,
  normalizeHierarchyName,
} from "../lib/pipelineHierarchy";
import {
  resolveRowOwnerUserId,
  viewerIsOrgAdminOrOwner,
} from "./resourceAccess";

function formatHubLegacyError(reason: unknown): string {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg.startsWith("Failed to delete legacy")) return msg;
  return `Failed to delete legacy items: ${msg}`;
}

export { formatHubLegacyError };

async function listVisibleOrgPipelineFiles(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
): Promise<Doc<"pipeline">[]> {
  const rows = await ctx.db.query("pipeline").order("desc").collect();
  const scoped = filterPipelineByOrgScope(rows, organizationId);
  return filterPipelineRowsForMember(ctx, scoped, organizationId, memberUserKey);
}

function fileMatchesLegacyClientGroup(
  file: Doc<"pipeline">,
  canonicalHubKey: string,
  displayName: string,
): boolean {
  const legacy = legacyClientProjectFromDealData(file.dealData, file.fileName);
  const normDisplay = normalizeHierarchyName(displayName);
  const normLegacyClient = normalizeHierarchyName(legacy.clientName);
  if (normLegacyClient === normDisplay) return true;
  return legacyDisplayNameMatches(canonicalHubKey, legacy.clientName);
}

function fileMatchesLegacyProjectGroup(
  file: Doc<"pipeline">,
  canonicalHubKey: string,
  projectTitle: string,
  hubClientKey: string,
): boolean {
  const legacy = legacyClientProjectFromDealData(file.dealData, file.fileName);
  const normTitle = normalizeHierarchyName(projectTitle);
  if (normalizeHierarchyName(legacy.projectName) !== normTitle) return false;
  if (!hubClientKey) return true;
  const clientNorm = normalizeHubClientKey(hubClientKey);
  return fileMatchesLegacyClientGroup(
    file,
    clientNorm.canonicalHubKey,
    clientNorm.displayName,
  );
}

export async function collectHubClientPipelineFiles(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
  hubClientKey: string,
): Promise<Doc<"pipeline">[]> {
  const target = resolveHubClientDeletionTarget(ctx, hubClientKey);
  if (target.kind === "record") {
    return [];
  }
  const lookupKey = target.canonicalHubKey;
  const displayName = target.displayName;
  const visible = await listVisibleOrgPipelineFiles(
    ctx,
    organizationId,
    memberUserKey,
  );

  const out: Doc<"pipeline">[] = [];
  const seen = new Set<string>();
  for (const file of visible) {
    let matched = false;
    try {
      const hierarchy = await safeResolveFileHierarchy(ctx, file);
      matched = hubClientKeyFromHierarchy(hierarchy) === lookupKey;
    } catch {
      matched = false;
    }
    if (!matched) {
      matched = fileMatchesLegacyClientGroup(file, lookupKey, displayName);
    }
    if (matched && !seen.has(String(file._id))) {
      seen.add(String(file._id));
      out.push(file);
    }
  }
  return out;
}

export async function collectHubProjectPipelineFiles(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
  hubProjectKey: string,
): Promise<Doc<"pipeline">[]> {
  const target = resolveHubProjectDeletionTarget(ctx, hubProjectKey);
  if (target.kind === "record") {
    return [];
  }
  const lookupKey = target.canonicalHubKey;
  const projectTitle = target.projectTitle;
  const hubClientKeyForMatch = target.hubClientKey;
  const visible = await listVisibleOrgPipelineFiles(
    ctx,
    organizationId,
    memberUserKey,
  );

  const out: Doc<"pipeline">[] = [];
  const seen = new Set<string>();
  for (const file of visible) {
    let matched = false;
    try {
      const hierarchy = await safeResolveFileHierarchy(ctx, file);
      matched = hubProjectKeyFromHierarchy(hierarchy) === lookupKey;
    } catch {
      matched = false;
    }
    if (!matched) {
      matched = fileMatchesLegacyProjectGroup(
        file,
        lookupKey,
        projectTitle,
        hubClientKeyForMatch,
      );
    }
    if (matched && !seen.has(String(file._id))) {
      seen.add(String(file._id));
      out.push(file);
    }
  }
  return out;
}

export async function pipelineFileCanDelete(
  ctx: QueryCtx | MutationCtx,
  file: Doc<"pipeline">,
  memberUserKey: string,
): Promise<boolean> {
  if (!file.organizationId) return false;
  try {
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    await assertOrgPermission(ctx, file.organizationId, key, "files.delete");
    const owner = resolveRowOwnerUserId(file);
    if (!owner || owner === key) return true;
    return await viewerIsOrgAdminOrOwner(ctx, file.organizationId, key);
  } catch {
    return false;
  }
}

export async function hubPipelineFilesCanDelete(
  ctx: QueryCtx | MutationCtx,
  files: Doc<"pipeline">[],
  memberUserKey: string,
): Promise<boolean> {
  if (files.length === 0) return true;
  for (const file of files) {
    if (!(await pipelineFileCanDelete(ctx, file, memberUserKey))) {
      return false;
    }
  }
  return true;
}
