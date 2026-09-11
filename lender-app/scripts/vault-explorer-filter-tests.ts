import assert from "node:assert/strict";
import {
  emptyVaultStarredIds,
  explorerFilterEmptyMessage,
  filterExplorerDocuments,
  filterExplorerFolderTree,
  filterExplorerTasks,
  matchesExplorerQuery,
  normalizeExplorerQuery,
  type ExplorerFolderNode,
  type VaultStarredIds,
} from "../lib/library/vaultExplorerFilter";

let passed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`ok — ${name}`);
  } catch (error) {
    console.error(`FAIL — ${name}`);
    throw error;
  }
}

function folder(
  id: string,
  name: string,
  children: ExplorerFolderNode[] = [],
): ExplorerFolderNode {
  return { id, name, children, source: id };
}

test("normalizes query trim + case", () => {
  assert.equal(normalizeExplorerQuery("  Bank  "), "bank");
  assert.equal(matchesExplorerQuery("Updated Bank Statement", "bank"), true);
  assert.equal(matchesExplorerQuery("Title payoff", "bank"), false);
  assert.equal(matchesExplorerQuery("Anything", ""), true);
});

test("search keeps matching docs only", () => {
  const docs = [
    { id: "d1", title: "W2 2024" },
    { id: "d2", title: "Bank statement" },
  ];
  const filtered = filterExplorerDocuments(docs, {
    query: "bank",
    starredOnly: false,
    starred: emptyVaultStarredIds(),
  });
  assert.deepEqual(
    filtered.map((d) => d.id),
    ["d2"],
  );
});

test("search keeps parent folders of matching docs", () => {
  const tree = [
    folder("f1", "Closing", [folder("f2", "Payoffs")]),
    folder("f3", "Unrelated"),
  ];
  const docs = new Map([
    ["f2", [{ id: "d1", title: "Title ordering payoff" }]],
    ["f3", [{ id: "d2", title: "Other.pdf" }]],
  ]);
  const filtered = filterExplorerFolderTree(tree, docs, {
    query: "title ordering",
    starredOnly: false,
    starred: emptyVaultStarredIds(),
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.id, "f1");
  assert.equal(filtered[0]?.children[0]?.id, "f2");
});

test("folder name match keeps the folder even without matching docs", () => {
  const tree = [folder("f1", "Bank Statements")];
  const filtered = filterExplorerFolderTree(tree, new Map(), {
    query: "bank",
    starredOnly: false,
    starred: emptyVaultStarredIds(),
  });
  assert.equal(filtered[0]?.id, "f1");
});

test("folder name match keeps non-matching child folders", () => {
  const tree = [folder("f1", "Bank Statements", [folder("f2", "January")])];
  const filtered = filterExplorerFolderTree(tree, new Map(), {
    query: "bank",
    starredOnly: false,
    starred: emptyVaultStarredIds(),
  });
  assert.equal(filtered[0]?.children[0]?.id, "f2");
});

test("starred-only keeps starred files and ancestor folders", () => {
  const tree = [folder("f1", "Closing", [folder("f2", "Payoffs")])];
  const docs = new Map([
    ["f2", [{ id: "d1", title: "Star me" }, { id: "d2", title: "Skip" }]],
  ]);
  const starred: VaultStarredIds = {
    documentIds: new Set(["d1"]),
    folderIds: new Set(),
  };
  const filtered = filterExplorerFolderTree(tree, docs, {
    query: "",
    starredOnly: true,
    starred,
  });
  assert.equal(filtered[0]?.id, "f1");
  assert.equal(filtered[0]?.children[0]?.id, "f2");
  const visibleDocs = filterExplorerDocuments(docs.get("f2") ?? [], {
    query: "",
    starredOnly: true,
    starred,
  });
  assert.deepEqual(
    visibleDocs.map((d) => d.id),
    ["d1"],
  );
});

test("starred folder includes descendants; search then intersects", () => {
  const tree = [
    folder("f1", "Tax Returns", [
      folder("f2", "2024"),
      folder("f3", "2023"),
    ]),
  ];
  const docs = new Map([
    ["f2", [{ id: "d1", title: "1040 2024" }]],
    ["f3", [{ id: "d2", title: "1040 2023" }]],
  ]);
  const starred: VaultStarredIds = {
    documentIds: new Set(),
    folderIds: new Set(["f1"]),
  };
  const allInStarred = filterExplorerFolderTree(tree, docs, {
    query: "",
    starredOnly: true,
    starred,
  });
  assert.equal(allInStarred[0]?.children.length, 2);

  const searched = filterExplorerFolderTree(tree, docs, {
    query: "2024",
    starredOnly: true,
    starred,
  });
  assert.equal(searched[0]?.id, "f1");
  assert.equal(searched[0]?.children.length, 1);
  assert.equal(searched[0]?.children[0]?.id, "f2");
});

test("starred + search hides starred files that do not match", () => {
  const docs = [
    { id: "d1", title: "Bank statement" },
    { id: "d2", title: "W2" },
  ];
  const starred: VaultStarredIds = {
    documentIds: new Set(["d1", "d2"]),
    folderIds: new Set(),
  };
  const filtered = filterExplorerDocuments(docs, {
    query: "bank",
    starredOnly: true,
    starred,
  });
  assert.deepEqual(
    filtered.map((d) => d.id),
    ["d1"],
  );
});

test("tasks stay when title matches or a descendant is visible", () => {
  const tasks = [
    { id: "t1", name: "Title ordering payoff" },
    { id: "t2", name: "Updated Bank Statement" },
  ];
  const byTitle = filterExplorerTasks(
    tasks,
    new Map([
      ["t1", false],
      ["t2", false],
    ]),
    {
      query: "title ordering",
      starredOnly: false,
      starred: emptyVaultStarredIds(),
    },
  );
  assert.deepEqual(
    byTitle.map((t) => t.id),
    ["t1"],
  );
  const byChild = filterExplorerTasks(
    tasks,
    new Map([
      ["t1", false],
      ["t2", true],
    ]),
    {
      query: "xyz-no-match",
      starredOnly: false,
      starred: emptyVaultStarredIds(),
    },
  );
  assert.deepEqual(
    byChild.map((t) => t.id),
    ["t2"],
  );
});

test("empty-state copy covers search, starred, and both", () => {
  assert.equal(
    explorerFilterEmptyMessage(false, "bank"),
    "No matching tasks, files, or folders.",
  );
  assert.equal(
    explorerFilterEmptyMessage(true, ""),
    "No starred files or folders.",
  );
  assert.equal(
    explorerFilterEmptyMessage(true, "bank"),
    "No matching starred tasks, files, or folders.",
  );
});

console.log(`\n${passed} tests passed`);
