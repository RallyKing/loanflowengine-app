import assert from "node:assert/strict";
import {
  partitionDocumentTaskTemplates,
  sortIndividualTemplatesByFavorites,
  templateStackLabel,
} from "../lib/library/partitionDocumentTaskTemplates";

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

test("Individual lists all templates including stack members", () => {
  const stacks = [
    { _id: "s1", sortOrder: 1000, name: "MCA Pack" },
    { _id: "s2", sortOrder: 2000, name: "Refi Pack" },
  ];
  const templates = [
    { _id: "t1", stackId: "s1", sortOrder: 2000, title: "Bank stmts" },
    { _id: "t2", stackId: "s1", sortOrder: 1000, title: "ID" },
    { _id: "t3", sortOrder: 500, title: "Loose custom" },
    { _id: "t4", stackId: "s2", sortOrder: 1000, title: "Tax returns" },
  ];

  const { stacks: out, individualTemplates } = partitionDocumentTaskTemplates(
    stacks,
    templates,
  );

  assert.equal(individualTemplates.length, 4);
  assert.deepEqual(
    individualTemplates.map((t) => t._id),
    ["t3", "t2", "t4", "t1"],
  );
  assert.equal(out.length, 2);
  assert.deepEqual(
    out[0]!.templates.map((t) => t._id),
    ["t2", "t1"],
  );
  assert.deepEqual(
    out[1]!.templates.map((t) => t._id),
    ["t4"],
  );
});

test("Orphan stackId appears only in Individual", () => {
  const stacks = [{ _id: "s1", sortOrder: 0, name: "Live" }];
  const templates = [
    { _id: "alive", stackId: "s1", sortOrder: 0 },
    { _id: "orphan", stackId: "deleted-stack", sortOrder: 1 },
  ];
  const { stacks: out, individualTemplates } = partitionDocumentTaskTemplates(
    stacks,
    templates,
  );
  assert.equal(out[0]!.templates.length, 1);
  assert.equal(out[0]!.templates[0]!._id, "alive");
  assert.equal(individualTemplates.length, 2);
  assert.ok(individualTemplates.some((t) => t._id === "orphan"));
});

test("templateStackLabel resolves live and orphan names", () => {
  const stacks = [{ _id: "s1", name: "MCA Pack" }];
  assert.equal(templateStackLabel(undefined, stacks), null);
  assert.equal(templateStackLabel("s1", stacks), "MCA Pack");
  assert.equal(templateStackLabel("gone", stacks), "Orphaned stack");
});

test("sortIndividualTemplatesByFavorites pins favorites then sorts by name", () => {
  const templates = [
    { _id: "t1", title: "Zebra" },
    { _id: "t2", title: "Apple" },
    { _id: "t3", title: "Mango" },
    { _id: "t4", title: "Banana" },
  ];
  const sorted = sortIndividualTemplatesByFavorites(
    templates,
    new Set(["t1", "t4"]),
  );
  assert.deepEqual(
    sorted.map((t) => t._id),
    ["t4", "t1", "t2", "t3"],
  );
});

test("sortIndividualTemplatesByFavorites with no favorites sorts by name", () => {
  const templates = [
    { _id: "t1", title: "Zebra" },
    { _id: "t2", title: "Apple" },
  ];
  const sorted = sortIndividualTemplatesByFavorites(templates, new Set());
  assert.deepEqual(
    sorted.map((t) => t._id),
    ["t2", "t1"],
  );
});

console.log(`\n${passed} passed`);
