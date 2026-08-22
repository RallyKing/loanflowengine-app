/**
 * Programmatic Document Vault assurance checks (no git, local source + build).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function findChunkWith(marker) {
  const chunksDir = path.join(ROOT, ".next", "static", "chunks");
  if (!fs.existsSync(chunksDir)) return null;
  for (const file of fs.readdirSync(chunksDir)) {
    if (!file.endsWith(".js")) continue;
    const content = fs.readFileSync(path.join(chunksDir, file), "utf8");
    if (content.includes(marker)) return file;
  }
  return null;
}

console.log("Document Vault assurance checks\n");

// 1. Orphan removed
assert(
  !fs.existsSync(
    path.join(
      ROOT,
      "modules/pipeline/components/tabs/DocumentVaultFolderPanel.tsx",
    ),
  ),
  "DocumentVaultFolderPanel.tsx should be deleted",
);
assert(
  fs.existsSync(
    path.join(
      ROOT,
      "modules/pipeline/components/tabs/DocumentVaultFolderDialogs.tsx",
    ),
  ),
  "DocumentVaultFolderDialogs.tsx should exist",
);
assert(
  !read("components/library/LibraryDocumentsWorkspace.tsx").includes(
    "DocumentVaultFolderPanel",
  ),
  "LibraryDocumentsWorkspace must not import DocumentVaultFolderPanel",
);

// 2. Empty-state render gate
const workspace = read("components/library/LibraryDocumentsWorkspace.tsx");
assert(
  workspace.includes("vaultFolders.length === 0"),
  "Render gate must require vaultFolders.length === 0 before empty placeholder",
);
assert(
  workspace.includes("<DocumentVaultDirectoryTree"),
  "DocumentVaultDirectoryTree must be rendered from workspace",
);

// 3. Drag handles
const tree = read("modules/pipeline/components/tabs/DocumentVaultDirectoryTree.tsx");
assert(
  tree.includes("document-vault-folder-drag-"),
  "Tree must expose document-vault-folder-drag test ids",
);
assert(
  tree.includes("documentVaultOsFileDrop") ||
    tree.includes("isOsFileDragEvent"),
  "Tree must integrate OS file drag detection",
);
assert(
  tree.includes("document-vault-os-drop-root") ||
    tree.includes("data-os-drop"),
  "Tree must expose OS file drop markers",
);
assert(
  !tree.includes("justify-between"),
  "Explorer header must not use justify-between (icons left-aligned with title)",
);
assert(
  read("components/library/UploadAndOrganizeZone.tsx").includes("#1B4332"),
  "Upload trigger must use deep forest green styling",
);
assert(
  tree.includes("touch-none") && tree.includes('touchAction: "none"'),
  "Drag grip must include touch-none and touchAction none",
);
assert(
  tree.includes("opacity-70"),
  "Drag grip must default to opacity-70 (not hover-only hidden)",
);

// 4. PDF export wiring
const pdfFiles = [
  "components/library/DocumentVaultExplorerFileRow.tsx",
  "components/library/LibraryDocumentsList.tsx",
  "components/library/LibraryDocumentsVaultGrid.tsx",
  "components/library/LibraryDocumentsWorkspace.tsx",
];
for (const file of pdfFiles) {
  const src = read(file);
  assert(
    src.includes("Download as PDF") || src.includes("onDownloadAsPdf"),
    `${file} must wire Download as PDF`,
  );
}
assert(
  fs.existsSync(path.join(ROOT, "lib/documents/pdfExport.ts")),
  "lib/documents/pdfExport.ts must exist",
);
assert(
  read("components/library/LibraryDocumentsWorkspace.tsx").includes(
    "downloadVaultDocumentAsPdf",
  ),
  "Workspace must import downloadVaultDocumentAsPdf",
);

// 4b. Explorer ZIP / per-file download wiring
assert(
  fs.existsSync(path.join(ROOT, "lib/library/downloadVaultDocumentsZip.ts")),
  "lib/library/downloadVaultDocumentsZip.ts must exist",
);
assert(
  workspace.includes("downloadVaultDocumentsZip"),
  "Workspace must reuse downloadVaultDocumentsZip",
);
assert(
  workspace.includes("downloadRemoteFile"),
  "Workspace must reuse downloadRemoteFile for per-file download",
);
assert(
  workspace.includes("handleDownloadAll") ||
    workspace.includes("onDownloadAll"),
  "Workspace must wire Download all",
);
assert(
  tree.includes("document-vault-download-all") ||
    tree.includes("onDownloadAll"),
  "Explorer toolbar must expose Download all",
);
assert(
  tree.includes("document-vault-download-selected") ||
    tree.includes("onDownloadSelected"),
  "Explorer toolbar must expose Download selected",
);
assert(
  read("components/library/DocumentVaultExplorerFileRow.tsx").includes(
    "onDownload",
  ),
  "Explorer file row must expose per-file Download",
);

// 5. Recall drawer
const recall = read("components/library/RecallFromClientVaultDrawer.tsx");
assert(
  recall.includes("addDocumentLink"),
  "RecallFromClientVaultDrawer must call addDocumentLink",
);
assert(
  recall.includes("RecallFromClientVaultDrawer"),
  "Recall drawer component must exist",
);
assert(
  workspace.includes("<RecallFromClientVaultDrawer"),
  "Workspace must mount RecallFromClientVaultDrawer",
);

// 6. Delete modal
assert(
  tree.includes("FolderDeleteConfirmModal"),
  "Tree must render FolderDeleteConfirmModal",
);
assert(
  fs.existsSync(path.join(ROOT, "components/library/FolderDeleteConfirmModal.tsx")),
  "FolderDeleteConfirmModal.tsx must exist",
);

// 7. Persistence layer wiring
const schema = read("convex/schema.ts");
assert(
  schema.includes("sortOrder") && schema.includes("parentFolderId"),
  "documentFolders schema must include sortOrder and parentFolderId",
);
const convexFolders = read("convex/documentFolders.ts");
assert(
  convexFolders.includes("reorderSiblingFolders") &&
    convexFolders.includes("sortOrder: i * 1000"),
  "reorderSiblingFolders must persist sortOrder values",
);
assert(
  convexFolders.includes("rows.sort") && convexFolders.includes("sortOrder"),
  "listFoldersByPipeline must sort by sortOrder for reload persistence",
);
assert(
  workspace.includes("reorderSiblingFolders") &&
    workspace.includes("useMutation"),
  "Workspace must bind reorderSiblingFolders mutation",
);
assert(
  workspace.includes("await reorderSiblingFolders") &&
    workspace.includes("pipelineFileId: vaultPipelineFileId") &&
    workspace.includes("memberUserKey"),
  "handleVaultDragEnd must await reorderSiblingFolders with scoped ids",
);
assert(
  workspace.includes("resolveVaultDocumentDropFolderId"),
  "Document drops must resolve sortable folder row targets",
);
assert(
  !workspace.includes("(currentParent ?? null) === (targetParent ?? null)) {\n            return;"),
  "Nest handler must not silently return before reorder on same-parent drops",
);
const pipelineWorkspace = read(
  "modules/pipeline/workspace/PipelineFileWorkspace.tsx",
);
assert(
  pipelineWorkspace.includes(
    "memberUserKey={convexMemberKey ?? preferencesAccountId}",
  ),
  "DocumentVaultTab must receive canonical convexMemberKey for mutations",
);

// 9. Task block spatial overhaul
const composer = read("modules/pipeline/components/tasks/FileTaskTriageComposer.tsx");
const tasksBlock = read("modules/pipeline/components/blocks/FileTasksBlock.tsx");
assert(
  composer.includes("file-task-triage-select"),
  "Composer must use triage select dropdown instead of pill grid",
);
assert(
  !composer.includes("TriageLabelPillEditor"),
  "Composer must not render triage label pill salad",
);
assert(
  tasksBlock.includes("file-tasks-completed-accordion"),
  "FileTasksBlock must render collapsed completed tasks accordion",
);
assert(
  tasksBlock.includes("file-tasks-sub-toolbar"),
  "FileTasksBlock must render consolidated horizontal sub-toolbar",
);
assert(
  tasksBlock.includes("File-level triage and follow-ups."),
  "Sub-toolbar must include file-level triage subtitle",
);
assert(
  read("modules/pipeline/components/tasks/triage/TaskTriageLabelManagerSheet.tsx").includes(
    "max-h-[85vh]",
  ),
  "Triage label manager must clamp to max-h-[85vh]",
);

// 8. Build chunk markers (after npm run build)
const chunk = findChunkWith("document-vault-folder-drag-");
assert(chunk != null, "Built chunk must contain document-vault-folder-drag marker");
if (chunk) {
  const chunkContent = fs.readFileSync(
    path.join(ROOT, ".next", "static", "chunks", chunk),
    "utf8",
  );
  assert(
    chunkContent.includes("folder-delete-confirm-modal") ||
      chunkContent.includes("folder-delete-confirm-overlay"),
    "Built chunk must contain folder delete modal markers",
  );
  assert(
    chunkContent.includes("document-vault-folder-delete-btn-"),
    "Built chunk must contain direct folder delete button test id",
  );
  console.log(`Build chunk verified: ${chunk}`);
}

if (failures.length === 0) {
  console.log("\nAll assurance checks passed.");
  process.exit(0);
}

console.error("\nFailures:");
for (const f of failures) console.error(`  - ${f}`);
process.exit(1);
