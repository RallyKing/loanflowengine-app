/**
 * Read-bound proofs for the pipeline hub subscription.
 * Run: `npm run test:hub-read-bounds`
 *
 * These tests drive the real readers from `convex/pipelineHubBoundedReads` against
 * an instrumented fake `ctx.db` that records every query. The fake refuses any
 * read that is not index-scoped, so a regression back to `.collect()` on a bare
 * table fails here instead of in production.
 *
 * The dataset is deliberately lopsided — a small "our org" inside a large
 * deployment — so a full-table scan and a correctly scoped read differ by orders
 * of magnitude in documents touched.
 */
import assert from "node:assert/strict";
import type { QueryCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";
import {
  loadContactFileLinksForFiles,
  loadFileClientEdgesForFiles,
  loadFileLenderEdgesForFiles,
  loadNoteCountsForFiles,
  loadOrgScopedPipelineRowsBounded,
  loadRelatedTasksForFiles,
} from "../convex/pipelineHubBoundedReads";
import {
  PIPELINE_FILE_EDGE_SCAN_CAP,
  PIPELINE_TABLE_PREVIEW_MAX_ROWS,
} from "../lib/pipeline/tablePreviewReadBounds";

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
  fileLenders: { by_file: ["fileId"] },
  fileClients: { by_file: ["fileId"] },
  fileProjects: { by_file: ["fileId"] },
  fileTeamMembers: { by_file: ["fileId"] },
  fileTasks: { by_file: ["fileId"] },
  contactFileLinks: { by_file: ["fileId", "updatedAt"] },
  tasks: { by_relatedFile: ["relatedFileId"] },
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

const OUR_FILES = 40;
const OTHER_FILES = 4_000;
const EDGES_PER_FILE = 3;

function buildDb(): FakeDb {
  const db = new FakeDb();

  const pipeline: Row[] = [];
  for (let i = 0; i < OUR_FILES; i++) {
    pipeline.push({
      _id: `ours_${i}`,
      _creationTime: 1_000 + i,
      organizationId: OUR_ORG,
      createdAt: 1_000 + i,
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
    OUR_FILES,
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
    db.docReads <= OUR_FILES + 1,
    `pipeline read touched ${db.docReads} docs; expected <= ${OUR_FILES + 1} (table holds ${db.rows("pipeline").length})`,
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
    Array.from({ length: 10 }, (_, i) => `ours_${OUR_FILES - 1 - i}`),
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
    OUR_FILES + 5,
    "platform default org must still see org-unstamped legacy rows",
  );
  assert.ok(
    db.reads.every((r) => r.index === "by_organization_createdAt"),
    "legacy rows must come from the index, not a scan",
  );

  /* 2. fileLenders edges are scoped to the visible ids only. */
  const visible = pipelineRead.rows.map((r) => r._id as unknown as Id<"pipeline">);
  db.reset();
  const lenderEdges = await loadFileLenderEdgesForFiles(ctx, visible, OUR_ORG);
  assert.equal(
    lenderEdges.rows.length,
    OUR_FILES * EDGES_PER_FILE,
    "must return every edge for the visible files",
  );
  assert.ok(
    lenderEdges.rows.every((e) => String(e.organizationId) === String(OUR_ORG)),
    "must not return another org's edges",
  );
  const lenderFileKeys = new Set(db.reads.map((r) => String(r.eq[0]?.[1])));
  const visibleKeys = new Set(visible.map(String));
  assert.equal(db.reads.length, OUR_FILES, "one indexed read per visible file");
  assert.ok(
    [...lenderFileKeys].every((k) => visibleKeys.has(k)),
    "fileLenders must only be read for visible file ids",
  );
  assert.ok(
    db.docReads <= OUR_FILES * EDGES_PER_FILE,
    `fileLenders touched ${db.docReads} docs; table holds ${db.rows("fileLenders").length}`,
  );

  /* Duplicate ids collapse to one read each. */
  db.reset();
  await loadFileLenderEdgesForFiles(ctx, [...visible, ...visible], OUR_ORG);
  assert.equal(db.reads.length, OUR_FILES, "duplicate file ids must be deduped");

  /* Per-file edge reads are capped. */
  assert.ok(
    db.reads.every((r) => r.limit === PIPELINE_FILE_EDGE_SCAN_CAP + 1),
    "per-file edge reads must be capped",
  );

  /* 3. The remaining hub joins are equally scoped. */
  db.reset();
  await loadFileClientEdgesForFiles(ctx, visible, OUR_ORG);
  await loadContactFileLinksForFiles(ctx, visible);
  await loadRelatedTasksForFiles(ctx, visible, OUR_ORG);
  assert.ok(
    db.reads.every((r) => r.index !== null && r.limit !== null),
    "every junction read must be indexed and capped",
  );
  assert.ok(
    db.reads.every((r) => visibleKeys.has(String(r.eq[0]?.[1]))),
    "every junction read must key on a visible file id",
  );

  /* 4. Note counts use the full (org, file) key, not the org half. */
  db.reset();
  const noteCounts = await loadNoteCountsForFiles(
    ctx,
    pipelineRead.rows.map((r) => ({
      _id: r._id as unknown as Id<"pipeline">,
      organizationId: r.organizationId as Id<"organizations">,
    })),
  );
  assert.equal(noteCounts.size, OUR_FILES);
  assert.ok(
    [...noteCounts.values()].every((n) => n === 2),
    "note counts must be exact",
  );
  assert.ok(
    db.reads.every(
      (r) =>
        r.eq.length === 2 &&
        r.eq[0]![0] === "organizationId" &&
        r.eq[1]![0] === "pipelineFileId",
    ),
    "note reads must supply both halves of by_org_file (org-only keys scan the org)",
  );
  assert.ok(
    db.docReads <= OUR_FILES * 2,
    `note counts touched ${db.docReads} docs; table holds ${db.rows("pipelineFileNotes").length}`,
  );

  /* 5. Whole-hub budget: the join set must stay far below deployment size. */
  db.reset();
  const hubRows = await loadOrgScopedPipelineRowsBounded(
    ctx,
    OUR_ORG,
    PIPELINE_TABLE_PREVIEW_MAX_ROWS,
    false,
  );
  const hubIds = hubRows.rows.map((r) => r._id as unknown as Id<"pipeline">);
  await Promise.all([
    loadFileLenderEdgesForFiles(ctx, hubIds, OUR_ORG),
    loadFileClientEdgesForFiles(ctx, hubIds, OUR_ORG),
    loadContactFileLinksForFiles(ctx, hubIds),
    loadRelatedTasksForFiles(ctx, hubIds, OUR_ORG),
    loadNoteCountsForFiles(
      ctx,
      hubRows.rows.map((r) => ({
        _id: r._id as unknown as Id<"pipeline">,
        organizationId: r.organizationId as Id<"organizations">,
      })),
    ),
  ]);
  assert.ok(
    db.docReads < totalDocs / 20,
    `hub join budget read ${db.docReads} of ${totalDocs} docs; expected under ${Math.floor(totalDocs / 20)}`,
  );

  /* 6. The harness genuinely rejects a bare table scan. */
  await assert.rejects(
    async () => {
      await (db.query("fileLenders") as unknown as { collect(): Promise<Row[]> }).collect();
    },
    UnindexedScanError,
    "the fake db must reject unindexed reads",
  );

  console.log(
    `[pipeline-hub-read-bounds] OK — ${db.docReads} docs read for ${OUR_FILES} visible files across a ${totalDocs}-doc deployment.`,
  );
}

main().catch((error: unknown) => {
  console.error("[pipeline-hub-read-bounds] FAILED:", error);
  process.exit(1);
});
