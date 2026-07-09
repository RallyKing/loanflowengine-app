/**
 * Phase 15 Step 14.4 — scorched-earth legacy hub delete (no normalizeId, no hierarchy helpers).
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  assertCanDeletePipelineRow,
  filterPipelineByOrgScope,
  filterPipelineRowsForMember,
} from "./organizationAccess";
import { deletePipelineGraph } from "./graphCleanup";
import { deleteClientGraphEdges, deleteProjectGraphEdges } from "./hierarchyEntityCleanup";
import {
  hubClientKeyFromDisplayName,
  hubProjectKeyFromParts,
} from "../lib/pipeline/hubHierarchyKeys";
import {
  legacyClientProjectFromDealData,
  normalizeHierarchyName,
} from "../lib/pipelineHierarchy";

const NUCLEAR_KNOWN_LABELS = new Set(["rtest", "test", "borrower", "project"]);

/** True when we must never touch clients/projects tables or hierarchy resolvers. */
export function requiresNuclearLegacyBypass(hubKey: string): boolean {
  const k = hubKey.trim();
  if (!k) return false;
  if (k.startsWith("legacy")) return true;
  if (k.includes(":")) return true;
  if (NUCLEAR_KNOWN_LABELS.has(k.toLowerCase())) return true;
  return false;
}

function parseLegacyClientBypass(raw: string): {
  displayName: string;
  canonicalHubKey: string;
} {
  const trimmed = raw.trim();
  if (trimmed.startsWith("legacy-client:")) {
    const displayName = trimmed.slice("legacy-client:".length).trim() || "borrower";
    return {
      displayName,
      canonicalHubKey: hubClientKeyFromDisplayName(displayName),
    };
  }
  const displayName = trimmed || "borrower";
  return {
    displayName,
    canonicalHubKey: hubClientKeyFromDisplayName(displayName),
  };
}

function parseLegacyProjectBypass(raw: string): {
  projectTitle: string;
  clientHubKey: string;
  canonicalHubKey: string;
} {
  const trimmed = raw.trim();
  if (trimmed.startsWith("legacy-project:")) {
    const rest = trimmed.slice("legacy-project:".length);
    const lastColon = rest.lastIndexOf(":");
    const clientHubKey =
      lastColon > 0 ? rest.slice(0, lastColon) : hubClientKeyFromDisplayName("borrower");
    const projectTitle =
      lastColon > 0 ? rest.slice(lastColon + 1).trim() || "project" : rest.trim() || "project";
    return {
      projectTitle,
      clientHubKey,
      canonicalHubKey: trimmed,
    };
  }
  const projectTitle = trimmed || "project";
  const clientHubKey = hubClientKeyFromDisplayName("borrower");
  return {
    projectTitle,
    clientHubKey,
    canonicalHubKey: hubProjectKeyFromParts(clientHubKey, projectTitle),
  };
}

/** No normalizeId — heuristic only. */
function pipelineRowEligibleForLegacyHubBypass(file: Doc<"pipeline">): boolean {
  const cid = file.clientId ? String(file.clientId).trim() : "";
  const pid = file.projectId ? String(file.projectId).trim() : "";
  const looksLikeConvexId = (value: string) =>
    value.length >= 20 &&
    !value.includes(":") &&
    !value.startsWith("legacy") &&
    /^[a-z0-9_]+$/i.test(value);
  if (pid && looksLikeConvexId(pid)) return false;
  if (cid && looksLikeConvexId(cid)) return false;
  return true;
}

async function listVisiblePipelineFiles(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
): Promise<Doc<"pipeline">[]> {
  const rows = await ctx.db.query("pipeline").order("desc").collect();
  const scoped = filterPipelineByOrgScope(rows, organizationId);
  return filterPipelineRowsForMember(ctx, scoped, organizationId, memberUserKey);
}

/** Deal-data / file-name match only — no resolveFileHierarchy, no normalizeId. */
export async function nuclearCollectHubClientFiles(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
  rawHubClientKey: string,
): Promise<Doc<"pipeline">[]> {
  const parsed = parseLegacyClientBypass(rawHubClientKey);
  const normTarget = normalizeHierarchyName(parsed.displayName);
  const visible = await listVisiblePipelineFiles(ctx, organizationId, memberUserKey);
  const out: Doc<"pipeline">[] = [];
  const seen = new Set<string>();

  for (const file of visible) {
    if (!pipelineRowEligibleForLegacyHubBypass(file)) {
      continue;
    }
    const legacy = legacyClientProjectFromDealData(file.dealData, file.fileName);
    if (normalizeHierarchyName(legacy.clientName) !== normTarget) {
      continue;
    }
    const id = String(file._id);
    if (!seen.has(id)) {
      seen.add(id);
      out.push(file);
    }
  }
  return out;
}

export async function nuclearCollectHubProjectFiles(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
  rawHubProjectKey: string,
): Promise<Doc<"pipeline">[]> {
  const parsed = parseLegacyProjectBypass(rawHubProjectKey);
  const clientParsed = parseLegacyClientBypass(parsed.clientHubKey);
  const normProject = normalizeHierarchyName(parsed.projectTitle);
  const normClient = normalizeHierarchyName(clientParsed.displayName);
  const visible = await listVisiblePipelineFiles(ctx, organizationId, memberUserKey);
  const out: Doc<"pipeline">[] = [];
  const seen = new Set<string>();

  for (const file of visible) {
    if (!pipelineRowEligibleForLegacyHubBypass(file)) {
      continue;
    }
    const legacy = legacyClientProjectFromDealData(file.dealData, file.fileName);
    if (normalizeHierarchyName(legacy.projectName) !== normProject) {
      continue;
    }
    if (normalizeHierarchyName(legacy.clientName) !== normClient) {
      continue;
    }
    const id = String(file._id);
    if (!seen.has(id)) {
      seen.add(id);
      out.push(file);
    }
  }
  return out;
}

async function nuclearDeletePipelineFiles(
  ctx: MutationCtx,
  files: Doc<"pipeline">[],
  memberUserKey: string,
): Promise<number> {
  let deletedFileCount = 0;
  for (const file of files) {
    await assertCanDeletePipelineRow(ctx, file, memberUserKey);
    try {
      await deletePipelineGraph(ctx, file._id);
    } catch {
      await ctx.db.delete(file._id);
    }
    deletedFileCount += 1;
  }
  return deletedFileCount;
}

export async function nuclearBypassDeleteHubClient(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    hubClientKey: string;
    forceCascade?: boolean;
  },
): Promise<{
  success: true;
  bypassed: true;
  deletedFileCount: number;
}> {
  const rawKey = args.hubClientKey.trim();
  const files = await nuclearCollectHubClientFiles(
    ctx,
    args.organizationId,
    args.memberUserKey,
    rawKey,
  );
  if (files.length > 0 && !args.forceCascade) {
    throw new Error(
      "This legacy client group has loan files. Confirm cascade delete with forceCascade.",
    );
  }
  const deletedFileCount = await nuclearDeletePipelineFiles(
    ctx,
    files,
    args.memberUserKey,
  );
  return { success: true, bypassed: true, deletedFileCount };
}

/** Phase 15 Step 14.5 — absolute override for ghost hub key `rtest`. */
export function matchesRtestHardWipe(hubClientKey: string): boolean {
  const k = hubClientKey.trim();
  if (!k) return false;
  const lower = k.toLowerCase();
  return lower === "rtest" || lower.includes("rtest");
}

/** Phase 15 Step 14.5 — absolute override for ghost hub key `Test`. */
export function matchesTestHardWipe(hubProjectKey: string): boolean {
  const k = hubProjectKey.trim();
  if (!k) return false;
  const lower = k.toLowerCase();
  return k === "Test" || lower === "test" || lower.includes("test");
}

async function forceDeletePipelineFile(
  ctx: MutationCtx,
  fileId: Doc<"pipeline">["_id"],
): Promise<void> {
  try {
    await deletePipelineGraph(ctx, fileId);
  } catch {
    await ctx.db.delete(fileId);
  }
}

function fileMatchesRtestGhost(
  file: Doc<"pipeline">,
  rawHubClientKey: string,
): boolean {
  const legacy = legacyClientProjectFromDealData(file.dealData, file.fileName);
  const normTarget = normalizeHierarchyName("rtest");
  if (normalizeHierarchyName(legacy.clientName) === normTarget) {
    return true;
  }
  const parsed = parseLegacyClientBypass(rawHubClientKey);
  if (
    normalizeHierarchyName(legacy.clientName) ===
    normalizeHierarchyName(parsed.displayName)
  ) {
    return true;
  }
  const cid = String(file.clientId ?? "").trim().toLowerCase();
  if (cid === "rtest" || cid === rawHubClientKey.trim().toLowerCase()) {
    return true;
  }
  const name = file.fileName?.toLowerCase() ?? "";
  return name.includes("rtest");
}

function fileMatchesTestGhost(
  file: Doc<"pipeline">,
  rawHubProjectKey: string,
): boolean {
  const legacy = legacyClientProjectFromDealData(file.dealData, file.fileName);
  const normTest = normalizeHierarchyName("Test");
  if (normalizeHierarchyName(legacy.projectName) === normTest) {
    return true;
  }
  const parsed = parseLegacyProjectBypass(rawHubProjectKey);
  if (
    normalizeHierarchyName(legacy.projectName) ===
    normalizeHierarchyName(parsed.projectTitle)
  ) {
    return true;
  }
  const pid = String(file.projectId ?? "").trim();
  if (pid === "Test" || pid.toLowerCase() === "test") {
    return true;
  }
  return false;
}

/** No eligibility filter, no assertCanDelete — scorched earth for `rtest`. */
export async function hardWipeRtestHubClient(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    hubClientKey: string;
  },
): Promise<{
  success: true;
  bypassed: "rtest-hard-wipe";
  deletedFileCount: number;
}> {
  const rawKey = args.hubClientKey.trim();
  console.log("RTEST HARD WIPE deleteHubClient:", rawKey);
  const visible = await listVisiblePipelineFiles(
    ctx,
    args.organizationId,
    args.memberUserKey,
  );
  const seen = new Set<string>();
  let deletedFileCount = 0;

  for (const file of visible) {
    if (!fileMatchesRtestGhost(file, rawKey)) continue;
    const id = String(file._id);
    if (seen.has(id)) continue;
    seen.add(id);
    await forceDeletePipelineFile(ctx, file._id);
    deletedFileCount += 1;
  }

  const normRtest = normalizeHierarchyName("rtest");
  const clients = await ctx.db.query("clients").collect();
  for (const client of clients) {
    if (client.organizationId !== args.organizationId) continue;
    if (normalizeHierarchyName(client.displayName) !== normRtest) continue;
    try {
      await deleteClientGraphEdges(ctx, client._id);
    } catch {
      /* ghost graph */
    }
    await ctx.db.delete(client._id);
  }

  return { success: true, bypassed: "rtest-hard-wipe", deletedFileCount };
}

/** No eligibility filter, no assertCanDelete — scorched earth for `Test` project. */
export async function hardWipeTestHubProject(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    hubProjectKey: string;
  },
): Promise<{
  success: true;
  bypassed: "test-hard-wipe";
  deletedFileCount: number;
}> {
  const rawKey = args.hubProjectKey.trim();
  console.log("TEST HARD WIPE deleteHubProject:", rawKey);
  const visible = await listVisiblePipelineFiles(
    ctx,
    args.organizationId,
    args.memberUserKey,
  );
  const seen = new Set<string>();
  let deletedFileCount = 0;

  for (const file of visible) {
    if (!fileMatchesTestGhost(file, rawKey)) continue;
    const id = String(file._id);
    if (seen.has(id)) continue;
    seen.add(id);
    await forceDeletePipelineFile(ctx, file._id);
    deletedFileCount += 1;
  }

  const normTest = normalizeHierarchyName("Test");
  const projects = await ctx.db.query("projects").collect();
  for (const project of projects) {
    if (project.organizationId !== args.organizationId) continue;
    if (
      project.normalizedTitle !== normTest &&
      normalizeHierarchyName(project.title) !== normTest
    ) {
      continue;
    }
    try {
      await deleteProjectGraphEdges(ctx, project._id);
    } catch {
      /* ghost graph */
    }
    await ctx.db.delete(project._id);
  }

  return { success: true, bypassed: "test-hard-wipe", deletedFileCount };
}

export async function nuclearBypassDeleteHubProject(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    hubProjectKey: string;
    forceCascade?: boolean;
  },
): Promise<{
  success: true;
  bypassed: true;
  deletedFileCount: number;
}> {
  const rawKey = args.hubProjectKey.trim();
  const files = await nuclearCollectHubProjectFiles(
    ctx,
    args.organizationId,
    args.memberUserKey,
    rawKey,
  );
  if (files.length > 0 && !args.forceCascade) {
    throw new Error(
      "This legacy project group has loan files. Confirm cascade delete with forceCascade.",
    );
  }
  const deletedFileCount = await nuclearDeletePipelineFiles(
    ctx,
    files,
    args.memberUserKey,
  );
  return { success: true, bypassed: true, deletedFileCount };
}
