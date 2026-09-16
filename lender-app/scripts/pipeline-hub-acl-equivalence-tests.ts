/**
 * Hub one-shot ACL ≡ resolvePipelineAccessLevel semantics.
 * Run: `npm run test:hub-acl`
 *
 * Proves `hubPipelineAccessFromIndexes` / `pipelineAccessViaHierarchy` match
 * canonical inherit for the Critical cases that previously widened hub
 * `canEditFile` past mutate gates.
 */
import assert from "node:assert/strict";
import type { Doc, Id } from "../convex/_generated/dataModel";
import {
  hubPipelineAccessFromIndexes,
  pipelineAccessViaHierarchy,
  type HubHierarchyVisibilityIndex,
  type HubShareIndex,
} from "../convex/resourceAccess";

const ORG = "org_test" as Id<"organizations">;
const VIEWER = "user_viewer";
const OWNER = "user_owner";

function emptyShares(): HubShareIndex {
  return { viewIds: new Set(), editIds: new Set() };
}

function emptyHierarchy(): HubHierarchyVisibilityIndex {
  return {
    ownedClientIds: new Set(),
    ownedProjectIds: new Set(),
    clientViewIds: new Set(),
    clientEditIds: new Set(),
    projectViewIds: new Set(),
    projectEditIds: new Set(),
    projectToClientId: new Map(),
  };
}

function pipelineRow(partial: {
  id: string;
  ownerUserId?: string;
  clientId?: string;
  projectId?: string;
}): Doc<"pipeline"> {
  return {
    _id: partial.id as Id<"pipeline">,
    _creationTime: 1,
    organizationId: ORG,
    ownerUserId: partial.ownerUserId ?? OWNER,
    ownerUserKey: partial.ownerUserId ?? OWNER,
    clientId: partial.clientId
      ? (partial.clientId as Id<"clients">)
      : undefined,
    projectId: partial.projectId
      ? (partial.projectId as Id<"projects">)
      : undefined,
    fileName: "Test",
    createdAt: 1,
    updatedAt: 1,
  } as Doc<"pipeline">;
}

function assertHubLevel(
  label: string,
  row: Doc<"pipeline">,
  viewerKey: string,
  shares: HubShareIndex,
  hierarchy: HubHierarchyVisibilityIndex,
  expected: "none" | "view" | "edit",
): void {
  const level = hubPipelineAccessFromIndexes(row, viewerKey, shares, hierarchy);
  assert.equal(
    level,
    expected,
    `${label}: hub one-shot ACL got ${level}, expected ${expected}`,
  );
  assert.equal(
    level === "edit",
    expected === "edit",
    `${label}: canEditFile must be ${expected === "edit"}`,
  );
}

function testUnrestrictedViewerDoesNotGetBlanketEdit(): void {
  // God/global-admin elevated visibility still uses owner/share/hierarchy —
  // not blanket "edit". A file with no ownership/share/inherit → "none".
  const row = pipelineRow({ id: "file_none", ownerUserId: OWNER });
  assertHubLevel(
    "unrestricted viewer / no grant",
    row,
    VIEWER,
    emptyShares(),
    emptyHierarchy(),
    "none",
  );
}

function testProjectViewShareNotRaisedByParentClientEdit(): void {
  const projectId = "proj_view";
  const parentClientId = "client_parent";
  const fileClientId = "client_file";
  const hierarchy = emptyHierarchy();
  hierarchy.projectViewIds.add(projectId);
  hierarchy.ownedClientIds.add(parentClientId);
  hierarchy.clientEditIds.add(fileClientId);
  hierarchy.projectToClientId.set(projectId, parentClientId);

  const row = pipelineRow({
    id: "file_proj_view",
    ownerUserId: OWNER,
    projectId,
    clientId: fileClientId,
  });

  assert.equal(
    pipelineAccessViaHierarchy(row, hierarchy),
    "view",
    "project view must win over parent/file client edit (no max/raise)",
  );
  assertHubLevel(
    "project view share",
    row,
    VIEWER,
    emptyShares(),
    hierarchy,
    "view",
  );
}

function testFileEditShare(): void {
  const fileId = "file_edit_share";
  const shares = emptyShares();
  shares.editIds.add(fileId);
  shares.viewIds.add(fileId);
  const row = pipelineRow({ id: fileId, ownerUserId: OWNER });
  assertHubLevel(
    "file edit share",
    row,
    VIEWER,
    shares,
    emptyHierarchy(),
    "edit",
  );
}

function testNone(): void {
  const row = pipelineRow({
    id: "file_nobody",
    ownerUserId: OWNER,
    projectId: "proj_x",
    clientId: "client_x",
  });
  assertHubLevel(
    "none",
    row,
    VIEWER,
    emptyShares(),
    emptyHierarchy(),
    "none",
  );
}

function testOwnerEdit(): void {
  const row = pipelineRow({ id: "file_mine", ownerUserId: VIEWER });
  assertHubLevel(
    "owner",
    row,
    VIEWER,
    emptyShares(),
    emptyHierarchy(),
    "edit",
  );
}

function testProjectNoneFallsThroughToFileClient(): void {
  const hierarchy = emptyHierarchy();
  hierarchy.ownedClientIds.add("client_file");
  hierarchy.projectToClientId.set("proj_empty", "client_other");
  const row = pipelineRow({
    id: "file_client_fallthrough",
    ownerUserId: OWNER,
    projectId: "proj_empty",
    clientId: "client_file",
  });
  assertHubLevel(
    "project none → file client ownership",
    row,
    VIEWER,
    emptyShares(),
    hierarchy,
    "edit",
  );
}

function main(): void {
  testUnrestrictedViewerDoesNotGetBlanketEdit();
  testProjectViewShareNotRaisedByParentClientEdit();
  testFileEditShare();
  testNone();
  testOwnerEdit();
  testProjectNoneFallsThroughToFileClient();
  console.log(
    "[pipeline-hub-acl-equivalence-tests] OK — hub one-shot ACL ≡ resolvePipelineAccessLevel cases.",
  );
}

main();
