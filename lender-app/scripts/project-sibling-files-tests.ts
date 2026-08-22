/**
 * Pure helper tests — project sibling file filtering for workspace header.
 */
import { buildProjectSiblingFileRows } from "../modules/pipeline/lib/core/workspaceDataDerivations";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const rows = [
  { _id: "a", projectId: "p1", fileName: "Alpha", status: "x", updatedAt: 3 },
  { _id: "b", projectId: "p1", fileName: "Beta", status: "x", updatedAt: 2 },
  { _id: "c", projectId: "p2", fileName: "Gamma", status: "x", updatedAt: 1 },
  { _id: "d", projectId: null, fileName: "Orphan", status: "x", updatedAt: 0 },
];

const siblings = buildProjectSiblingFileRows(rows, "p1");
assert(siblings.length === 2, `expected 2 siblings, got ${siblings.length}`);
assert(siblings[0]?._id === "a" && siblings[1]?._id === "b", "order preserved");

assert(
  buildProjectSiblingFileRows(rows, null).length === 0,
  "null project → empty",
);
assert(
  buildProjectSiblingFileRows(rows, "   ").length === 0,
  "blank project → empty",
);
assert(
  buildProjectSiblingFileRows(rows, "p2").length === 1,
  "single-file project still returns that file",
);

console.log("project-sibling-files-tests: ok");
