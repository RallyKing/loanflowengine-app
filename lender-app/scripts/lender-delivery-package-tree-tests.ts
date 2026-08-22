import assert from "node:assert/strict";
import type { Id } from "../convex/_generated/dataModel";
import {
  buildLenderPackageTreeSections,
  buildLenderPackageZipPath,
  collectPackageFolderIds,
  groupPackageDocumentsByLocation,
  taskRootKey,
} from "../lib/library/lenderDeliveryPackageTree";

function id<TableName extends "documentFolders" | "documentVaultFileTasks" | "libraryDocuments">(
  value: string,
): Id<TableName> {
  return value as Id<TableName>;
}

function run() {
  const folders = [
    {
      _id: id<"documentFolders">("f-parent"),
      name: "IDs",
      parentFolderId: undefined,
      fileTaskId: id<"documentVaultFileTasks">("task-1"),
      sortOrder: 0,
    },
    {
      _id: id<"documentFolders">("f-child"),
      name: "Rob",
      parentFolderId: id<"documentFolders">("f-parent"),
      fileTaskId: id<"documentVaultFileTasks">("task-1"),
      sortOrder: 0,
    },
    {
      _id: id<"documentFolders">("f-empty-sibling"),
      name: "Empty",
      parentFolderId: undefined,
      fileTaskId: id<"documentVaultFileTasks">("task-1"),
      sortOrder: 1,
    },
    {
      _id: id<"documentFolders">("f-unassigned"),
      name: "Misc",
      parentFolderId: undefined,
      sortOrder: 0,
    },
  ];

  const docs = [
    {
      documentId: id<"libraryDocuments">("d1"),
      title: "Rob_ID-front",
      fileName: "Rob_ID-front.pdf",
      folderId: id<"documentFolders">("f-child"),
      fileTaskId: id<"documentVaultFileTasks">("task-1"),
    },
    {
      documentId: id<"libraryDocuments">("d2"),
      title: "Rob_ID-back",
      fileName: "Rob_ID-back.pdf",
      folderId: id<"documentFolders">("f-child"),
      fileTaskId: id<"documentVaultFileTasks">("task-1"),
    },
    {
      documentId: id<"libraryDocuments">("d3"),
      title: "Loose task file",
      fileTaskId: id<"documentVaultFileTasks">("task-1"),
    },
    {
      documentId: id<"libraryDocuments">("d4"),
      title: "Root loose",
      folderId: id<"documentFolders">("f-unassigned"),
    },
  ];

  const packageFolderIds = collectPackageFolderIds(
    folders,
    docs.map((d) => d.folderId),
  );
  assert.ok(packageFolderIds.has("f-child"));
  assert.ok(packageFolderIds.has("f-parent"));
  assert.ok(packageFolderIds.has("f-unassigned"));
  assert.equal(packageFolderIds.has("f-empty-sibling"), false);

  const prunedFolders = folders.filter((f) =>
    packageFolderIds.has(String(f._id)),
  );

  const byLoc = groupPackageDocumentsByLocation(docs, prunedFolders);
  assert.equal(byLoc.get("f-child")?.length, 2);
  assert.equal(byLoc.get(taskRootKey("task-1"))?.length, 1);
  assert.equal(byLoc.get("f-unassigned")?.length, 1);

  const sections = buildLenderPackageTreeSections({
    folders: prunedFolders,
    documents: docs,
    containers: [
      {
        fileTaskId: id<"documentVaultFileTasks">("task-1"),
        title: "Borrower Identification",
        sortOrder: 0,
      },
    ],
  });

  assert.equal(sections.length, 2);
  assert.equal(sections[0]!.kind, "task");
  assert.equal(sections[0]!.title, "Borrower Identification");
  assert.equal(sections[0]!.rootDocs.length, 1);
  assert.equal(sections[0]!.folderTree.length, 1);
  assert.equal(sections[0]!.folderTree[0]!.folder.name, "IDs");
  assert.equal(sections[0]!.folderTree[0]!.children[0]!.folder.name, "Rob");
  assert.equal(sections[1]!.kind, "unassigned");
  assert.equal(sections[1]!.folderTree[0]!.folder.name, "Misc");

  const zipPath = buildLenderPackageZipPath({
    folders: prunedFolders,
    containersById: new Map([["task-1", "Borrower Identification"]]),
    folderId: id<"documentFolders">("f-child"),
    fileTaskId: id<"documentVaultFileTasks">("task-1"),
    fileName: "Rob_ID-front.pdf",
  });
  assert.equal(
    zipPath,
    "Borrower Identification/IDs/Rob/Rob_ID-front.pdf",
  );

  console.log("lender-delivery-package-tree-tests: ok");
}

run();
