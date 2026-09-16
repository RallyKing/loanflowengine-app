/**
 * Read-bound proofs for the pipeline hub subscription + triage map.
 * Run: `npm run test:hub-read-bounds`
 *
 * These tests drive the real readers from `convex/pipelineHubBoundedReads` against
 * an instrumented fake `ctx.db` that records every query. The fake refuses any
 * read that is not index-scoped, so a regression back to `.collect()` on a bare
 * table fails here instead of in production.
 *
 * The dataset is deliberately lopsided — a small visible set inside a large org
 * (plus another org) — so an org-wide take-then-filter and a visible-scoped
 * `by_file` read differ by orders of magnitude in documents touched.
 */
import assert from "node:assert/strict";
import type { QueryCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";
import {
  loadContactFileLinksForFiles,
  loadFileClientEdgesForFiles,
  loadFileLenderEdgesForFiles,
  loadLoanClientLinksForFiles,
  loadNoteCountsForFiles,
  loadOrgScopedPipelineRowsBounded,
  loadRelatedTasksForFiles,
} from "../convex/pipelineHubBoundedReads";
import {
  PIPELINE_FILE_EDGE_SCAN_CAP,
  PIPELINE_FILE_NOTE_SCAN_CAP,
  PIPELINE_FILE_RELATED_TASK_SCAN_CAP,
  PIPELINE_GRAPH_CONTACT_LABEL_GET_CAP,
  PIPELINE_GRAPH_MEMBER_LABEL_GET_CAP,
  PIPELINE_GRAPH_MISSING_ENTITY_LABEL_GET_CAP,
  PIPELINE_TABLE_PREVIEW_MAX_ROWS,
} from "../lib/pipeline/tablePreviewReadBounds";
import {
  batchGraphLinksForPipelineFiles,
  emptyGraphLinksForPipelineFiles,
} from "../convex/pipelineGraphPreviewLinks";

type Row = Record<string, unknown> & { _id: string; _creationTime: number };

type ReadRecord = {
  table: string;
  index: string | null;
  eq: Array<[string, unknown]>;
  limit: number | null;
  returned: number;
};

/** Index field order for every table these readers touch. */
const INDEX_FIELDS: Record<string, Record<string, string[]>> = {
  pipeline: { by_organization_createdAt: ["organizationId", "createdAt"] },
  fileLenders: {
    by_file: ["fileId"],
    by_organization: ["organizationId"],
  },
  fileClients: {
    by_file: ["fileId"],
    by_organization: ["organizationId"],
  },
  fileProjects: {
    by_file: ["fileId"],
    by_organization: ["organizationId"],
  },
  fileTeamMembers: {
    by_file: ["fileId"],
    by_organization: ["organizationId"],
  },
  fileTasks: {
    by_file: ["fileId"],
    by_organization: ["organizationId"],
  },
  loanClients: {
    by_pipeline: ["pipelineId"],
  },
  contactFileLinks: { by_file: ["fileId", "updatedAt"] },
  tasks: {
    by_relatedFile: ["relatedFileId"],
    by_organization: ["organizationId"],
  },
  pipelineFileNotes: { by_org_file: ["organizationId", "pipelineFileId"] },
};

class UnindexedScanError extends Error {
  constructor(table: string) {
    super(
      `Unindexed read of "${table}" — hub reads must be index-scoped and capped.`,
    );
    this.name = "UnindexedScanError";
  }
}

class FakeQuery {
  private indexName: string | null = null;
  private eqs: Array<[string, unknown]> = [];
  private descending = false;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  withIndex(name: string, build?: (q: EqBuilder) => EqBuilder): this {
    const fields = INDEX_FIELDS[this.table]?.[name];
    assert.ok(fields, `Unknown index ${this.table}.${name}`);
    this.indexName = name;
    if (build) {
      const builder = new EqBuilder(fields);
      build(builder);
      this.eqs = builder.pairs;
    }
    return this;
  }

  order(direction: "asc" | "desc"): this {
    this.descending = direction === "desc";
    return this;
  }

  private materialize(): Row[] {
    if (!this.indexName) throw new UnindexedScanError(this.table);
    const fields = INDEX_FIELDS[this.table]![this.indexName]!;
    let rows = this.db.rows(this.table).filter((row) =>
      this.eqs.every(([field, value]) => row[field] === value),
    );
    const sortField = fields[this.eqs.length] ?? "_creationTime";
    rows = [...rows].sort((a, b) => {
      const av = Number(a[sortField] ?? a._creationTime);
      const bv = Number(b[sortField] ?? b._creationTime);
      return this.descending ? bv - av : av - bv;
    });
    return rows;
  }

  private record(limit: number | null, returned: number): void {
    this.db.reads.push({
      table: this.table,
      index: this.indexName,
      eq: this.eqs,
      limit,
      returned,
    });
    this.db.docReads += returned;
  }

  async take(n: number): Promise<Row[]> {
    const out = this.materialize().slice(0, n);
    this.record(n, out.length);
    return out;
  }

  async collect(): Promise<Row[]> {
    const out = this.materialize();
    this.record(null, out.length);
    return out;
  }

  async first(): Promise<Row | null> {
    const out = this.materialize().slice(0, 1);
    this.record(1, out.length);
    return out[0] ?? null;
  }
}

class EqBuilder {
  readonly pairs: Array<[string, unknown]> = [];
  constructor(private readonly fields: string[]) {}
  eq(field: string, value: unknown): this {
    assert.equal(
      field,
      this.fields[this.pairs.length],
      `Index key fields must be supplied in order (expected ${this.fields[this.pairs.length]}, got ${field})`,
    );
    this.pairs.push([field, value]);
    return this;
  }
}

class FakeDb {
  readonly reads: ReadRecord[] = [];
  docReads = 0;
  private readonly tables = new Map<string, Row[]>();

  seed(table: string, rows: Row[]): void {
    this.tables.set(table, rows);
  }

  rows(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  query(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  async get(id: string): Promise<Row | null> {
    for (const rows of this.tables.values()) {
      const hit = rows.find((r) => r._id === id);
      if (hit) {
        this.docReads += 1;
        return hit;
      }
    }
    return null;
  }

  reset(): void {
    this.reads.length = 0;
    this.docReads = 0;
  }
}

const OUR_ORG = "org_ours" as Id<"organizations">;
const OTHER_ORG = "org_theirs" as Id<"organizations">;

/** Visible hub files (active). */
const VISIBLE_FILES = 40;
/** Same-org files that are archived/snoozed and must NOT be junction-scanned. */
const HIDDEN_SAME_ORG_FILES = 400;
const OTHER_FILES = 4_000;
const EDGES_PER_FILE = 3;

function buildDb(): FakeDb {
  const db = new FakeDb();

  const pipeline: Row[] = [];
  for (let i = 0; i < VISIBLE_FILES; i++) {
    pipeline.push({
      _id: `ours_${i}`,
      _creationTime: 1_000 + i,
      organizationId: OUR_ORG,
      createdAt: 1_000 + i,
    });
  }
  for (let i = 0; i < HIDDEN_SAME_ORG_FILES; i++) {
    pipeline.push({
      _id: `ours_hidden_${i}`,
      _creationTime: 2_000 + i,
      organizationId: OUR_ORG,
      createdAt: 2_000 + i,
      archivedAt: 9_000 + i,
    });
  }
  for (let i = 0; i < OTHER_FILES; i++) {
    pipeline.push({
      _id: `theirs_${i}`,
      _creationTime: 500_000 + i,
      organizationId: OTHER_ORG,
      createdAt: 500_000 + i,
    });
  }
  // Org-unstamped legacy rows; only the platform default org may see these.
  for (let i = 0; i < 5; i++) {
    pipeline.push({
      _id: `legacy_${i}`,
      _creationTime: 10 + i,
      organizationId: undefined,
      createdAt: 10 + i,
    });
  }
  db.seed("pipeline", pipeline);

  const edgeTables = [
    "fileLenders",
    "fileClients",
    "fileProjects",
    "fileTeamMembers",
    "fileTasks",
  ];
  for (const table of edgeTables) {
    const rows: Row[] = [];
    for (const file of pipeline) {
      for (let e = 0; e < EDGES_PER_FILE; e++) {
        rows.push({
          _id: `${table}_${file._id}_${e}`,
          _creationTime: e,
          fileId: file._id,
          organizationId: file.organizationId,
          lenderId: `lender_${e}`,
          clientId: `client_${e}`,
          projectId: `project_${e}`,
          userKey: `user_${e}`,
          taskId: `task_${e}`,
        });
      }
    }
    db.seed(table, rows);
  }

  const loanClients: Row[] = [];
  for (const file of pipeline) {
    for (let e = 0; e < EDGES_PER_FILE; e++) {
      loanClients.push({
        _id: `loanClients_${file._id}_${e}`,
        _creationTime: e,
        pipelineId: file._id,
        organizationId: file.organizationId,
        clientId: `client_${e}`,
      });
    }
  }
  db.seed("loanClients", loanClients);

  db.seed(
    "contactFileLinks",
    pipeline.map((file, i) => ({
      _id: `cfl_${file._id}`,
      _creationTime: i,
      fileId: file._id,
      updatedAt: i,
      contactId: `contact_${i}`,
    })),
  );

  db.seed(
    "tasks",
    pipeline.map((file, i) => ({
      _id: `task_${file._id}`,
      _creationTime: i,
      relatedFileId: file._id,
      organizationId: file.organizationId,
    })),
  );

  const notes: Row[] = [];
  for (const file of pipeline) {
    for (let n = 0; n < 2; n++) {
      notes.push({
        _id: `note_${file._id}_${n}`,
        _creationTime: n,
        pipelineFileId: file._id,
        organizationId: file.organizationId,
      });
    }
  }
  db.seed("pipelineFileNotes", notes);

  return db;
}

function ctxFor(db: FakeDb): QueryCtx {
  return { db } as unknown as QueryCtx;
}

async function main(): Promise<void> {
  const db = buildDb();
  const ctx = ctxFor(db);
  const totalDocs =
    db.rows("pipeline").length +
    db.rows("fileLenders").length +
    db.rows("fileClients").length +
    db.rows("loanClients").length +
    db.rows("contactFileLinks").length +
    db.rows("tasks").length +
    db.rows("pipelineFileNotes").length;

  /* 1. Pipeline rows are org-scoped through an index, never a table scan. */
  db.reset();
  const pipelineRead = await loadOrgScopedPipelineRowsBounded(
    ctx,
    OUR_ORG,
    PIPELINE_TABLE_PREVIEW_MAX_ROWS,
    false,
  );
  assert.equal(
    pipelineRead.rows.length,
    VISIBLE_FILES + HIDDEN_SAME_ORG_FILES,
    "pipeline read must return exactly our org's rows",
  );
  assert.equal(pipelineRead.saturated, false);
  assert.ok(
    pipelineRead.rows.every((r) => r.organizationId === OUR_ORG),
    "pipeline read must not surface another org's rows",
  );
  assert.ok(
    db.reads.every((r) => r.index !== null),
    "every pipeline read must be index-scoped",
  );
  assert.ok(
    db.docReads <= VISIBLE_FILES + HIDDEN_SAME_ORG_FILES + 1,
    `pipeline read touched ${db.docReads} docs; expected <= ${VISIBLE_FILES + HIDDEN_SAME_ORG_FILES + 1}`,
  );
  assert.ok(
    db.reads.every((r) => (r.limit ?? Infinity) <= PIPELINE_TABLE_PREVIEW_MAX_ROWS + 1),
    "pipeline read must be capped",
  );

  /* The cap is honoured and reports saturation rather than silently truncating. */
  db.reset();
  const tinyCap = await loadOrgScopedPipelineRowsBounded(ctx, OUR_ORG, 10, false);
  assert.equal(tinyCap.rows.length, 10, "cap must bound the returned rows");
  assert.equal(tinyCap.saturated, true, "hitting the cap must report saturation");

  /* Ordering matches what the hub previously got from `.order("desc")`. */
  assert.deepEqual(
    tinyCap.rows.map((r) => r._id),
    Array.from({ length: 10 }, (_, i) => `ours_hidden_${HIDDEN_SAME_ORG_FILES - 1 - i}`),
    "rows must stay newest-first",
  );

  /* Legacy org-unstamped rows are read through the index, only when requested. */
  db.reset();
  const withLegacy = await loadOrgScopedPipelineRowsBounded(
    ctx,
    OUR_ORG,
    PIPELINE_TABLE_PREVIEW_MAX_ROWS,
    true,
  );
  assert.equal(
    withLegacy.rows.length,
    VISIBLE_FILES + HIDDEN_SAME_ORG_FILES + 5,
    "platform default org must still see org-unstamped legacy rows",
  );
  assert.ok(
    db.reads.every((r) => r.index === "by_organization_createdAt"),
    "legacy rows must come from the index, not a scan",
  );

  /* 2. fileLenders edges are visible-scoped via by_file — not org take-then-filter. */
  const visible = Array.from({ length: VISIBLE_FILES }, (_, i) =>
    `ours_${i}` as unknown as Id<"pipeline">,
  );
  db.reset();
  const lenderEdges = await loadFileLenderEdgesForFiles(ctx, visible, OUR_ORG);
  assert.equal(
    lenderEdges.rows.length,
    VISIBLE_FILES * EDGES_PER_FILE,
    "must return every edge for the visible files",
  );
  assert.ok(
    lenderEdges.rows.every((e) => String(e.organizationId) === String(OUR_ORG)),
    "must not return another org's edges",
  );
  assert.equal(
    db.reads.length,
    VISIBLE_FILES,
    "visible-scoped fileLenders must be one by_file read per visible file",
  );
  assert.ok(
    db.reads.every(
      (r) =>
        r.index === "by_file" &&
        r.limit === PIPELINE_FILE_EDGE_SCAN_CAP + 1,
    ),
  );
  assert.ok(
    db.docReads === VISIBLE_FILES * EDGES_PER_FILE,
    `fileLenders touched ${db.docReads} docs; expected only visible edges (${VISIBLE_FILES * EDGES_PER_FILE}), not hidden same-org edges`,
  );
  assert.ok(
    !db.reads.some((r) => r.index === "by_organization"),
    "hub fileLenders must not org-scan",
  );

  /* Duplicate ids still one read per unique file. */
  db.reset();
  await loadFileLenderEdgesForFiles(ctx, [...visible, ...visible], OUR_ORG);
  assert.equal(db.reads.length, VISIBLE_FILES, "duplicate file ids must not multiply reads");

  /* 3. Remaining hub joins: by_file / by_pipeline / by_relatedFile only. */
  db.reset();
  await loadFileClientEdgesForFiles(ctx, visible, OUR_ORG);
  assert.equal(db.reads.length, VISIBLE_FILES);
  assert.ok(db.reads.every((r) => r.index === "by_file"));

  db.reset();
  await loadLoanClientLinksForFiles(ctx, visible, OUR_ORG);
  assert.equal(db.reads.length, VISIBLE_FILES);
  assert.ok(db.reads.every((r) => r.index === "by_pipeline"));

  db.reset();
  await loadContactFileLinksForFiles(ctx, visible);
  assert.equal(db.reads.length, VISIBLE_FILES, "CFL still one read per visible file");
  assert.ok(
    db.reads.every((r) => r.index === "by_file" && r.limit === PIPELINE_FILE_EDGE_SCAN_CAP + 1),
  );

  db.reset();
  const relatedVisible = await loadRelatedTasksForFiles(ctx, visible, OUR_ORG);
  assert.equal(relatedVisible.rows.length, VISIBLE_FILES);
  assert.equal(db.reads.length, VISIBLE_FILES);
  assert.ok(
    db.reads.every(
      (r) =>
        r.index === "by_relatedFile" &&
        r.limit === PIPELINE_FILE_RELATED_TASK_SCAN_CAP + 1,
    ),
  );
  assert.ok(
    !db.reads.some((r) => r.index === "by_organization"),
    "hub graph related tasks must not org-scan",
  );

  /* 4. Hub note badges use bounded by_org_file counts (never denorm 0-lie). */
  db.reset();
  const noteCounts = await loadNoteCountsForFiles(
    ctx,
    visible.map((id) => ({
      _id: id,
      organizationId: OUR_ORG,
    })),
  );
  assert.equal(noteCounts.size, VISIBLE_FILES);
  assert.ok([...noteCounts.values()].every((n) => n === 2));
  assert.ok(
    db.reads.every(
      (r) =>
        r.eq.length === 2 &&
        r.eq[0]![0] === "organizationId" &&
        r.eq[1]![0] === "pipelineFileId",
    ),
    "hub note reads must supply both halves of by_org_file",
  );
  assert.ok(
    db.reads.every(
      (r) => (r.limit ?? Infinity) <= PIPELINE_FILE_NOTE_SCAN_CAP + 1,
    ),
    "hub note reads must take cap+1 for saturation",
  );

  /* 5. Whole-hub budget: visible-scoped joins stay far below org+deployment size. */
  db.reset();
  await Promise.all([
    loadFileLenderEdgesForFiles(ctx, visible, OUR_ORG),
    loadFileClientEdgesForFiles(ctx, visible, OUR_ORG),
    loadLoanClientLinksForFiles(ctx, visible, OUR_ORG),
    loadContactFileLinksForFiles(ctx, visible),
    loadRelatedTasksForFiles(ctx, visible, OUR_ORG),
    loadNoteCountsForFiles(
      ctx,
      visible.map((id) => ({
        _id: id,
        organizationId: OUR_ORG,
      })),
    ),
  ]);
  const orgEdgeDocsIfScanned =
    (VISIBLE_FILES + HIDDEN_SAME_ORG_FILES) * EDGES_PER_FILE;
  assert.ok(
    db.docReads < orgEdgeDocsIfScanned,
    `hub join budget read ${db.docReads} docs; must stay under same-org edge cardinality ${orgEdgeDocsIfScanned} (hidden files must not be scanned)`,
  );
  assert.ok(
    db.docReads < totalDocs / 20,
    `hub join budget read ${db.docReads} of ${totalDocs} docs; expected under ${Math.floor(totalDocs / 20)}`,
  );
  const fileLenderReads = db.reads.filter((r) => r.table === "fileLenders");
  assert.equal(
    fileLenderReads.length,
    VISIBLE_FILES,
    "hub tick must not double-read fileLenders beyond visible files",
  );

  /* 6. Triage path: by_relatedFile per visible file — never org-wide task collect. */
  db.reset();
  const triageTasks = await loadRelatedTasksForFiles(ctx, visible, OUR_ORG);
  assert.equal(triageTasks.rows.length, VISIBLE_FILES);
  assert.equal(db.reads.length, VISIBLE_FILES);
  assert.ok(
    db.reads.every(
      (r) =>
        r.table === "tasks" &&
        r.index === "by_relatedFile" &&
        r.limit === PIPELINE_FILE_RELATED_TASK_SCAN_CAP + 1,
    ),
    "triage must use by_relatedFile only",
  );
  assert.ok(
    db.reads.every((r) => visible.map(String).includes(String(r.eq[0]?.[1]))),
    "triage must not read tasks for non-visible files",
  );
  assert.ok(
    !db.reads.some((r) => r.index === "by_organization"),
    "triage must not org-scan tasks",
  );

  /* 7. The harness genuinely rejects a bare table scan. */
  await assert.rejects(
    async () => {
      await (db.query("fileLenders") as unknown as { collect(): Promise<Row[]> }).collect();
    },
    UnindexedScanError,
    "the fake db must reject unindexed reads",
  );

  /* 8. Graph label gets are hard-capped — dense unique contacts/members cannot
   * tip listTablePreviewEnrichment over the Convex 4096-document limit. */
  assert.ok(
    PIPELINE_GRAPH_CONTACT_LABEL_GET_CAP +
      PIPELINE_GRAPH_MEMBER_LABEL_GET_CAP +
      PIPELINE_GRAPH_MISSING_ENTITY_LABEL_GET_CAP <
      500,
    "graph label get caps must stay well under residual enrichment headroom",
  );

  const contactRows: Row[] = [];
  for (let i = 0; i < 600; i++) {
    contactRows.push({
      _id: `contact_dense_${i}`,
      _creationTime: i,
      name: `Contact ${i}`,
      contactRoleIds: ["referral_partner"],
    });
  }
  db.seed("contacts", contactRows);
  const authRows: Row[] = [];
  for (let i = 0; i < 300; i++) {
    authRows.push({
      _id: `auth_dense_${i}`,
      _creationTime: i,
      displayUsername: `user${i}`,
      normalizedUsername: `user${i}`,
    });
  }
  db.seed("authUsers", authRows);

  const denseFiles = Array.from({ length: 50 }, (_, i) => ({
    _id: `graph_file_${i}` as Id<"pipeline">,
    _creationTime: i,
    organizationId: OUR_ORG,
    assigneeId: `auth_dense_${i}`,
    sharedWithIds: [`auth_dense_${i + 50}`, `auth_dense_${i + 100}`],
  })) as unknown as import("../convex/_generated/dataModel").Doc<"pipeline">[];

  const denseCfls = Array.from({ length: 500 }, (_, i) => ({
    _id: `cfl_dense_${i}`,
    _creationTime: i,
    fileId: denseFiles[i % denseFiles.length]!._id,
    contactId: `contact_dense_${i}` as Id<"contacts">,
    contactRoleId: "referral_partner",
  })) as unknown as import("../convex/_generated/dataModel").Doc<"contactFileLinks">[];

  db.reset();
  const graphLinks = await batchGraphLinksForPipelineFiles(
    ctx,
    denseFiles,
    OUR_ORG,
    denseFiles.map((f) => ({
      fileId: f._id,
      linkedFromHierarchy: [],
      clientDisplayName: "",
      projectDisplayTitle: "",
    })),
    {
      fileLenderEdges: [],
      fileClientEdges: [],
      fileProjectEdges: [],
      fileTeamMemberEdges: [],
      fileTaskEdges: [],
      relatedTasks: [],
      contactFileLinks: denseCfls,
    },
  );
  assert.equal(graphLinks.size, denseFiles.length);
  const contactGets = db.docReads;
  assert.ok(
    contactGets <=
      PIPELINE_GRAPH_CONTACT_LABEL_GET_CAP +
        PIPELINE_GRAPH_MEMBER_LABEL_GET_CAP +
        PIPELINE_GRAPH_MISSING_ENTITY_LABEL_GET_CAP,
    `graph label gets touched ${contactGets} docs; must stay under caps`,
  );

  const empty = emptyGraphLinksForPipelineFiles(denseFiles);
  assert.equal(empty.size, denseFiles.length);
  assert.deepEqual(empty.get(String(denseFiles[0]!._id)), {
    clients: [],
    projects: [],
    lenders: [],
    referrals: [],
    team: [],
    tasks: [],
  });

  console.log(
    `[pipeline-hub-read-bounds] OK — ${db.docReads} docs read for ${VISIBLE_FILES} visible files across a ${totalDocs}-doc deployment (${HIDDEN_SAME_ORG_FILES} hidden same-org files not scanned). Graph label caps: contact=${PIPELINE_GRAPH_CONTACT_LABEL_GET_CAP} member=${PIPELINE_GRAPH_MEMBER_LABEL_GET_CAP}.`,
  );
}

main().catch((error: unknown) => {
  console.error("[pipeline-hub-read-bounds] FAILED:", error);
  process.exit(1);
});
