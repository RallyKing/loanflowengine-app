import assert from "node:assert/strict";
import {
  filterStacksByQuery,
  filterTemplatesByQuery,
  normalizeApplyTemplateQuery,
  partitionDocumentTaskTemplates,
  sortIndividualTemplatesByFavorites,
  templateMatchesQuery,
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

test("normalizeApplyTemplateQuery trims and lowercases", () => {
  assert.equal(normalizeApplyTemplateQuery("  Bank  "), "bank");
  assert.equal(normalizeApplyTemplateQuery(""), "");
});

test("filterTemplatesByQuery is case-insensitive on title and description", () => {
  const templates = [
    { _id: "t1", title: "Bank Statements", description: "Last 3 months" },
    { _id: "t2", title: "Driver License", description: "Photo ID" },
    {
      _id: "t3",
      title: "Custom",
      clientInstructionText: "Upload voided check",
    },
  ];
  assert.deepEqual(
    filterTemplatesByQuery(templates, "bank").map((t) => t._id),
    ["t1"],
  );
  assert.deepEqual(
    filterTemplatesByQuery(templates, "PHOTO").map((t) => t._id),
    ["t2"],
  );
  assert.deepEqual(
    filterTemplatesByQuery(templates, "voided").map((t) => t._id),
    ["t3"],
  );
  assert.equal(filterTemplatesByQuery(templates, "   ").length, 3);
  assert.equal(filterTemplatesByQuery(templates, "nope").length, 0);
});

test("filterTemplatesByQuery matches optional extra text (stack label)", () => {
  const templates = [
    { _id: "t1", title: "ID", stackName: "MCA Pack" },
    { _id: "t2", title: "Tax", stackName: "Refi Pack" },
  ];
  const filtered = filterTemplatesByQuery(
    templates,
    "mca",
    (t) => t.stackName,
  );
  assert.deepEqual(
    filtered.map((t) => t._id),
    ["t1"],
  );
});

test("templateMatchesQuery empty query matches all", () => {
  assert.equal(templateMatchesQuery({ title: "Anything" }, ""), true);
  assert.equal(templateMatchesQuery({ title: "Anything" }, "  "), true);
});

test("filterStacksByQuery matches stack name, description, or member tasks", () => {
  const stacks = [
    {
      _id: "s1",
      name: "MCA Pack",
      description: "Working capital docs",
      templates: [{ title: "Bank Statements" }],
    },
    {
      _id: "s2",
      name: "Refi Pack",
      templates: [{ title: "Appraisal", description: "Full appraisal PDF" }],
    },
    {
      _id: "s3",
      name: "Empty Pack",
      templates: [] as Array<{ title: string; description?: string }>,
    },
  ];
  assert.deepEqual(
    filterStacksByQuery(stacks, "mca").map((s) => s._id),
    ["s1"],
  );
  assert.deepEqual(
    filterStacksByQuery(stacks, "working capital").map((s) => s._id),
    ["s1"],
  );
  assert.deepEqual(
    filterStacksByQuery(stacks, "appraisal").map((s) => s._id),
    ["s2"],
  );
  assert.deepEqual(
    filterStacksByQuery(stacks, "FULL APPRAISAL").map((s) => s._id),
    ["s2"],
  );
  assert.equal(filterStacksByQuery(stacks, "xyz").length, 0);
  assert.equal(filterStacksByQuery(stacks, "").length, 3);
});

console.log(`\n${passed} passed`);
