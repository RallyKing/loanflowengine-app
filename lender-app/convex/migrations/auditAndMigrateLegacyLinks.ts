/**
 * Legacy portal link sweeper — ingests orphaned bundle/delivery tokens into
 * `clientPortalLinks`.
 *
 * ## Execute from Convex Dashboard (Functions → Run)
 *
 * 1. **Dry run (recommended first)** — processes one batch, no writes:
 *    ```
 *    migrations/auditAndMigrateLegacyLinks:auditAndMigrateLegacyLinks
 *    { "adminSecret": "<DATA_MIGRATION_ADMIN_SECRET>", "dryRun": true }
 *    ```
 *
 * 2. **Live migration** — repeat until `done: true`:
 *    ```
 *    migrations/auditAndMigrateLegacyLinks:auditAndMigrateLegacyLinks
 *    { "adminSecret": "<DATA_MIGRATION_ADMIN_SECRET>", "dryRun": false }
 *    ```
 *
 * 3. **Resume a batch** — pass `cursor` from the prior response:
 *    ```
 *    { "adminSecret": "...", "dryRun": false, "cursor": "{\"phase\":\"deliveries\",\"tableCursor\":\"...\"}" }
 *    ```
 *
 * Idempotent: skips tokens already registered by `tokenHash` or FK
 * (`bundleTokenId` / `lenderDeliveryTokenId`). Safe to re-run.
 *
 * CLI equivalent:
 * `npx convex run migrations/auditAndMigrateLegacyLinks:auditAndMigrateLegacyLinks '{"adminSecret":"...","dryRun":true}'`
 */
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  resolveCompanySlugForPipeline,
  registerLenderPortalLink,
  loadLinkByTokenHash,
  registerTaskUploadPortalLink,
  registerPortalGrantLink,
  grantRegistryTokenHash,
  loadLinkByGrantId,
} from "../clientPortalLinks";
import { slugifyCompanySlug } from "../../lib/clientPortalUrl";
import { normalizePortalToken, randomHex, sha256Hex } from "../clientPortalCrypto";

const DEFAULT_BATCH = 40;

type MigrationPhase =
  | "bundles"
  | "deliveries"
  | "task_uploads"
  | "portal_grants";

type MigrationCursor = {
  phase: MigrationPhase;
  tableCursor: string | null;
};

type BatchStats = {
  scanned: number;
  created: number;
  skipped: number;
  skippedReasons: Record<string, number>;
};

function parseCursor(raw: string | undefined): MigrationCursor {
  if (!raw?.trim()) return { phase: "bundles", tableCursor: null };
  try {
    const parsed = JSON.parse(raw) as MigrationCursor;
    if (parsed.phase !== "bundles" && parsed.phase !== "deliveries") {
      if (
        parsed.phase !== "task_uploads" &&
        parsed.phase !== "portal_grants"
      ) {
        return { phase: "bundles", tableCursor: null };
      }
    }
    return {
      phase: parsed.phase,
      tableCursor: parsed.tableCursor ?? null,
    };
  } catch {
    return { phase: "bundles", tableCursor: null };
  }
}

function bumpReason(stats: BatchStats, reason: string) {
  stats.skipped += 1;
  stats.skippedReasons[reason] = (stats.skippedReasons[reason] ?? 0) + 1;
}

/** Plain portal token or legacy rows that stored the hash directly. */
async function tokenHashCandidates(raw: string): Promise<string[]> {
  const trimmed = normalizePortalToken(raw);
  if (!trimmed) return [];
  const hashed = await sha256Hex(trimmed);
  const out = new Set<string>([hashed]);
  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    out.add(trimmed.toLowerCase());
  }
  return [...out];
}

async function loadDeliveryByTokenCandidates(
  ctx: MutationCtx,
  raw: string,
): Promise<Doc<"lenderDeliveryTokens"> | null> {
  for (const tokenHash of await tokenHashCandidates(raw)) {
    const row = await ctx.db
      .query("lenderDeliveryTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (row) return row;
  }
  return null;
}

function inferBundleLinkKind(
  bundle: Doc<"documentVaultClientBundleTokens">,
): NonNullable<Doc<"clientPortalLinks">["linkKind"]> {
  if (bundle.brokerAgentCapable) {
    return bundle.readOnlyPreview ? "broker_preview" : "broker_agent";
  }
  return "client_invite";
}

async function registryExistsForBundle(
  ctx: MutationCtx,
  bundle: Doc<"documentVaultClientBundleTokens">,
): Promise<boolean> {
  const byHash = await ctx.db
    .query("clientPortalLinks")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", bundle.tokenHash))
    .first();
  if (byHash) return true;

  const pipelineLinks = await ctx.db
    .query("clientPortalLinks")
    .withIndex("by_pipeline_created", (q) =>
      q.eq("pipelineFileId", bundle.pipelineFileId),
    )
    .collect();
  return pipelineLinks.some((l) => l.bundleTokenId === bundle._id);
}

async function registryExistsForDelivery(
  ctx: MutationCtx,
  delivery: Doc<"lenderDeliveryTokens">,
): Promise<boolean> {
  const byHash = await ctx.db
    .query("clientPortalLinks")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", delivery.tokenHash))
    .first();
  if (byHash) return true;

  const pipelineLinks = await ctx.db
    .query("clientPortalLinks")
    .withIndex("by_pipeline_created", (q) =>
      q.eq("pipelineFileId", delivery.pipelineFileId),
    )
    .collect();
  return pipelineLinks.some((l) => l.lenderDeliveryTokenId === delivery._id);
}

async function migrateBundleRow(
  ctx: MutationCtx,
  bundle: Doc<"documentVaultClientBundleTokens">,
  dryRun: boolean,
  stats: BatchStats,
): Promise<void> {
  stats.scanned += 1;
  if (await registryExistsForBundle(ctx, bundle)) {
    bumpReason(stats, "already_registered");
    return;
  }

  const pipeline = await ctx.db.get(bundle.pipelineFileId);
  if (!pipeline) {
    bumpReason(stats, "missing_pipeline");
    return;
  }

  if (dryRun) {
    stats.created += 1;
    return;
  }

  const companySlug = await resolveCompanySlugForPipeline(ctx, pipeline);
  const status = bundle.status === "revoked" ? ("revoked" as const) : ("active" as const);

  await ctx.db.insert("clientPortalLinks", {
    pipelineFileId: bundle.pipelineFileId,
    organizationId: pipeline.organizationId,
    linkType: "client",
    bundleTokenId: bundle._id,
    companySlug: slugifyCompanySlug(companySlug),
    title: pipeline.fileName?.trim() || "Client portal",
    tokenHash: bundle.tokenHash,
    status,
    linkKind: inferBundleLinkKind(bundle),
    expiresAt: bundle.expiresAt,
    ...(status === "revoked" ? { revokedAt: bundle.createdAt } : {}),
    createdByUserKey: bundle.createdByUserKey,
    createdAt: bundle.createdAt,
  });
  stats.created += 1;
}

async function migrateDeliveryRow(
  ctx: MutationCtx,
  delivery: Doc<"lenderDeliveryTokens">,
  dryRun: boolean,
  stats: BatchStats,
): Promise<void> {
  stats.scanned += 1;
  if (await registryExistsForDelivery(ctx, delivery)) {
    bumpReason(stats, "already_registered");
    return;
  }

  const pipeline = await ctx.db.get(delivery.pipelineFileId);
  if (!pipeline) {
    bumpReason(stats, "missing_pipeline");
    return;
  }

  const lender = delivery.lenderId ? await ctx.db.get(delivery.lenderId) : null;

  if (dryRun) {
    stats.created += 1;
    return;
  }

  const companySlug = slugifyCompanySlug(
    await resolveCompanySlugForPipeline(ctx, pipeline),
  );
  const status =
    delivery.status === "revoked" ? ("revoked" as const) : ("active" as const);
  const targetName =
    lender?.company?.trim() ||
    lender?.contactName?.trim() ||
    "Lender (legacy)";

  await ctx.db.insert("clientPortalLinks", {
    pipelineFileId: delivery.pipelineFileId,
    organizationId: pipeline.organizationId,
    linkType: "lender",
    lenderDeliveryTokenId: delivery._id,
    ...(delivery.lenderId ? { lenderId: delivery.lenderId } : {}),
    targetName,
    companySlug,
    title: `Lender: ${targetName}`,
    tokenHash: delivery.tokenHash,
    status,
    linkKind: "lender_delivery",
    legacyPath: true,
    expiresAt: delivery.expiresAt,
    ...(status === "revoked" ? { revokedAt: delivery.createdAt } : {}),
    createdByUserKey: delivery.createdByUserKey,
    createdAt: delivery.createdAt,
  });
  stats.created += 1;
}

async function processBundleBatch(
  ctx: MutationCtx,
  cursor: MigrationCursor,
  batchSize: number,
  dryRun: boolean,
): Promise<{ stats: BatchStats; nextCursor: MigrationCursor | null }> {
  const stats: BatchStats = {
    scanned: 0,
    created: 0,
    skipped: 0,
    skippedReasons: {},
  };

  const page = await ctx.db
    .query("documentVaultClientBundleTokens")
    .paginate({ numItems: batchSize, cursor: cursor.tableCursor });

  for (const bundle of page.page) {
    await migrateBundleRow(ctx, bundle, dryRun, stats);
  }

  if (!page.isDone) {
    return {
      stats,
      nextCursor: { phase: "bundles", tableCursor: page.continueCursor },
    };
  }

  return {
    stats,
    nextCursor: { phase: "deliveries", tableCursor: null },
  };
}

async function processDeliveryBatch(
  ctx: MutationCtx,
  cursor: MigrationCursor,
  batchSize: number,
  dryRun: boolean,
): Promise<{ stats: BatchStats; nextCursor: MigrationCursor | null }> {
  const stats: BatchStats = {
    scanned: 0,
    created: 0,
    skipped: 0,
    skippedReasons: {},
  };

  const page = await ctx.db
    .query("lenderDeliveryTokens")
    .paginate({ numItems: batchSize, cursor: cursor.tableCursor });

  for (const delivery of page.page) {
    await migrateDeliveryRow(ctx, delivery, dryRun, stats);
  }

  if (!page.isDone) {
    return {
      stats,
      nextCursor: { phase: "deliveries", tableCursor: page.continueCursor },
    };
  }

  return {
    stats,
    nextCursor: { phase: "task_uploads", tableCursor: null },
  };
}

async function registryExistsForTaskUpload(
  ctx: MutationCtx,
  upload: Doc<"documentVaultFileTaskUploadTokens">,
): Promise<boolean> {
  const byHash = await ctx.db
    .query("clientPortalLinks")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", upload.tokenHash))
    .first();
  if (byHash) return true;
  const byFk = await ctx.db
    .query("clientPortalLinks")
    .withIndex("by_fileTaskUploadToken", (q) =>
      q.eq("fileTaskUploadTokenId", upload._id),
    )
    .first();
  return Boolean(byFk);
}

async function registryExistsForGrant(
  ctx: MutationCtx,
  grant: Doc<"clientPortalGrants">,
): Promise<boolean> {
  const byFk = await loadLinkByGrantId(ctx, grant._id);
  if (byFk) return true;
  const tokenHash = await grantRegistryTokenHash(grant._id);
  const byHash = await loadLinkByTokenHash(ctx, tokenHash);
  return Boolean(byHash);
}

async function migrateTaskUploadRow(
  ctx: MutationCtx,
  upload: Doc<"documentVaultFileTaskUploadTokens">,
  dryRun: boolean,
  stats: BatchStats,
): Promise<void> {
  stats.scanned += 1;
  if (await registryExistsForTaskUpload(ctx, upload)) {
    bumpReason(stats, "already_registered");
    return;
  }
  const pipeline = await ctx.db.get(upload.pipelineFileId);
  if (!pipeline) {
    bumpReason(stats, "missing_pipeline");
    return;
  }
  const task = await ctx.db.get(upload.fileTaskId);
  if (!task) {
    bumpReason(stats, "missing_task");
    return;
  }
  if (dryRun) {
    stats.created += 1;
    return;
  }
  const status =
    upload.status === "revoked" ? ("revoked" as const) : ("active" as const);
  const linkId = await registerTaskUploadPortalLink(ctx, {
    pipelineFileId: upload.pipelineFileId,
    organizationId: pipeline.organizationId,
    fileTaskUploadTokenId: upload._id,
    fileTaskId: upload.fileTaskId,
    tokenHash: upload.tokenHash,
    title: `Task Upload: ${task.title}`,
    expiresAt: upload.expiresAt,
    createdByUserKey: upload.createdByUserKey,
    createdAt: upload.createdAt,
  });
  if (status === "revoked") {
    await ctx.db.patch(linkId, {
      status: "revoked",
      revokedAt: upload.createdAt,
    });
  }
  stats.created += 1;
}

async function migrateGrantRow(
  ctx: MutationCtx,
  grant: Doc<"clientPortalGrants">,
  dryRun: boolean,
  stats: BatchStats,
): Promise<void> {
  stats.scanned += 1;
  if (await registryExistsForGrant(ctx, grant)) {
    bumpReason(stats, "already_registered");
    return;
  }
  const pipeline = await ctx.db.get(grant.pipelineFileId);
  if (!pipeline) {
    bumpReason(stats, "missing_pipeline");
    return;
  }
  if (dryRun) {
    stats.created += 1;
    return;
  }
  const now = Date.now();
  const expiresAt = grant.grantExpiresAt ?? now + 10 * 365 * 24 * 60 * 60 * 1000;
  const status =
    grant.status === "revoked" ? ("revoked" as const) : ("active" as const);
  const linkId = await registerPortalGrantLink(ctx, {
    pipelineFileId: grant.pipelineFileId,
    organizationId: pipeline.organizationId,
    grantId: grant._id,
    emailKey: grant.emailKey,
    title: grant.label?.trim()
      ? `Portal grant: ${grant.label.trim()}`
      : `Portal grant: ${grant.emailKey}`,
    targetName: grant.emailKey,
    expiresAt,
    createdByUserKey: grant.invitedByUserKey,
    createdAt: grant.createdAt,
  });
  if (status === "revoked") {
    await ctx.db.patch(linkId, {
      status: "revoked",
      revokedAt: grant.updatedAt,
    });
  }
  stats.created += 1;
}

async function processTaskUploadBatch(
  ctx: MutationCtx,
  cursor: MigrationCursor,
  batchSize: number,
  dryRun: boolean,
): Promise<{ stats: BatchStats; nextCursor: MigrationCursor | null }> {
  const stats: BatchStats = {
    scanned: 0,
    created: 0,
    skipped: 0,
    skippedReasons: {},
  };
  const page = await ctx.db
    .query("documentVaultFileTaskUploadTokens")
    .paginate({ numItems: batchSize, cursor: cursor.tableCursor });
  for (const upload of page.page) {
    await migrateTaskUploadRow(ctx, upload, dryRun, stats);
  }
  if (!page.isDone) {
    return {
      stats,
      nextCursor: { phase: "task_uploads", tableCursor: page.continueCursor },
    };
  }
  return {
    stats,
    nextCursor: { phase: "portal_grants", tableCursor: null },
  };
}

async function processGrantBatch(
  ctx: MutationCtx,
  cursor: MigrationCursor,
  batchSize: number,
  dryRun: boolean,
): Promise<{ stats: BatchStats; nextCursor: MigrationCursor | null }> {
  const stats: BatchStats = {
    scanned: 0,
    created: 0,
    skipped: 0,
    skippedReasons: {},
  };
  const page = await ctx.db
    .query("clientPortalGrants")
    .paginate({ numItems: batchSize, cursor: cursor.tableCursor });
  for (const grant of page.page) {
    await migrateGrantRow(ctx, grant, dryRun, stats);
  }
  if (!page.isDone) {
    return {
      stats,
      nextCursor: { phase: "portal_grants", tableCursor: page.continueCursor },
    };
  }
  return { stats, nextCursor: null };
}

export const auditAndMigrateLegacyLinks = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.boolean(),
    batchSize: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const batchSize = Math.min(Math.max(args.batchSize ?? DEFAULT_BATCH, 5), 100);
    const cursor = parseCursor(args.cursor);

    const result =
      cursor.phase === "bundles"
        ? await processBundleBatch(ctx, cursor, batchSize, args.dryRun)
        : cursor.phase === "deliveries"
          ? await processDeliveryBatch(ctx, cursor, batchSize, args.dryRun)
          : cursor.phase === "task_uploads"
            ? await processTaskUploadBatch(ctx, cursor, batchSize, args.dryRun)
            : await processGrantBatch(ctx, cursor, batchSize, args.dryRun);

    const done = result.nextCursor === null;
    return {
      ok: true as const,
      dryRun: args.dryRun,
      phase: cursor.phase,
      batchSize,
      done,
      stats: result.stats,
      nextCursor: result.nextCursor
        ? JSON.stringify(result.nextCursor)
        : undefined,
      message: done
        ? "Migration sweep complete for bundles, deliveries, task uploads, and portal grants."
        : `Batch finished (${cursor.phase}). Re-run with nextCursor until done is true.`,
    };
  },
});

/** Operator QA: insert a bundle token without registry row to test the sweeper. */
export const seedOrphanBundleTokenForTest = mutation({
  args: {
    adminSecret: v.string(),
    pipelineFileId: v.id("pipeline"),
  },
  handler: async (ctx, { adminSecret, pipelineFileId }) => {
    assertDataMigrationAdmin(adminSecret);
    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");

    const tasks = await ctx.db
      .query("documentVaultFileTasks")
      .withIndex("by_pipeline_sort", (q) => q.eq("pipelineFileId", pipelineFileId))
      .take(1);
    if (tasks.length === 0) {
      throw new Error("Pipeline has no file tasks — create one first.");
    }

    const now = Date.now();
    const plainToken = randomHex(24);
    const tokenHash = await sha256Hex(plainToken);

    const bundleId = await ctx.db.insert("documentVaultClientBundleTokens", {
      pipelineFileId,
      fileTaskIds: [tasks[0]!._id],
      tokenHash,
      status: "active",
      mode: "selective",
      readOnlyPreview: false,
      brokerAgentCapable: false,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000,
      createdByUserKey: "__migration_test__",
      createdAt: now,
    });

    return {
      ok: true as const,
      bundleId,
      tokenHash,
      plainToken,
      note: "No clientPortalLinks row created — run auditAndMigrateLegacyLinks to ingest.",
    };
  },
});

/** Audit summary: count session rows missing registry FK (read-only). */
export const auditLegacyLinkOrphans = mutation({
  args: {
    adminSecret: v.string(),
    sampleLimit: v.optional(v.number()),
  },
  handler: async (ctx, { adminSecret, sampleLimit }) => {
    assertDataMigrationAdmin(adminSecret);
    const limit = Math.min(Math.max(sampleLimit ?? 500, 50), 2000);
    let orphanBundles = 0;
    let orphanDeliveries = 0;

    const bundles = await ctx.db.query("documentVaultClientBundleTokens").take(limit);
    for (const bundle of bundles) {
      if (!(await registryExistsForBundle(ctx, bundle))) orphanBundles += 1;
    }

    const deliveries = await ctx.db.query("lenderDeliveryTokens").take(limit);
    for (const delivery of deliveries) {
      if (!(await registryExistsForDelivery(ctx, delivery))) orphanDeliveries += 1;
    }

    return {
      ok: true as const,
      sampleLimit: limit,
      orphanBundles,
      orphanDeliveries,
      needsMigration: orphanBundles > 0 || orphanDeliveries > 0,
    };
  },
});

/** Operator diagnostic: trace a plain or hashed portal token across session + registry tables. */
export const diagnosePortalToken = mutation({
  args: {
    adminSecret: v.string(),
    token: v.string(),
    pipelineNameHint: v.optional(v.string()),
  },
  handler: async (ctx, { adminSecret, token, pipelineNameHint }) => {
    assertDataMigrationAdmin(adminSecret);
    const trimmed = normalizePortalToken(token);
    const hashes = await tokenHashCandidates(token);

    const registryMatches = [];
    for (const tokenHash of hashes) {
      const link = await loadLinkByTokenHash(ctx, tokenHash);
      if (link) registryMatches.push({ tokenHash, link });
    }

    const delivery = await loadDeliveryByTokenCandidates(ctx, token);
    let deliveryPipeline: Doc<"pipeline"> | null = null;
    if (delivery) {
      deliveryPipeline = await ctx.db.get(delivery.pipelineFileId);
    }

    const registryForDeliveryHash = delivery
      ? await loadLinkByTokenHash(ctx, delivery.tokenHash)
      : null;

    const pipelineHints: {
      _id: Id<"pipeline">;
      fileName?: string;
      linkCount: number;
    }[] = [];
    if (pipelineNameHint?.trim()) {
      const hint = pipelineNameHint.trim().toLowerCase();
      const pipelines = await ctx.db.query("pipeline").take(500);
      for (const p of pipelines) {
        const name = p.fileName?.toLowerCase() ?? "";
        if (!name.includes(hint)) continue;
        const links = await ctx.db
          .query("clientPortalLinks")
          .withIndex("by_pipeline_created", (q) =>
            q.eq("pipelineFileId", p._id),
          )
          .collect();
        pipelineHints.push({
          _id: p._id,
          fileName: p.fileName,
          linkCount: links.length,
        });
      }
    }

    const gap =
      delivery && !registryForDeliveryHash
        ? "delivery_without_registry"
        : !delivery && registryMatches.length > 0
          ? "registry_without_delivery"
          : delivery &&
              registryForDeliveryHash &&
              registryForDeliveryHash.pipelineFileId !== delivery.pipelineFileId
            ? "pipeline_file_mismatch"
            : delivery && registryForDeliveryHash
              ? "bound"
              : "not_found";

    return {
      ok: true as const,
      inputTokenPreview: trimmed.slice(0, 8) + "…",
      tokenHashCandidates: hashes,
      gap,
      delivery: delivery
        ? {
            _id: delivery._id,
            pipelineFileId: delivery.pipelineFileId,
            pipelineFileName: deliveryPipeline?.fileName,
            lenderId: delivery.lenderId,
            status: delivery.status,
            expiresAt: delivery.expiresAt,
            tokenHash: delivery.tokenHash,
          }
        : null,
      registry: registryForDeliveryHash ?? registryMatches[0]?.link ?? null,
      registryMatches: registryMatches.map((m) => ({
        tokenHash: m.tokenHash,
        linkId: m.link._id,
        pipelineFileId: m.link.pipelineFileId,
        status: m.link.status,
        legacyPath: m.link.legacyPath,
      })),
      pipelineHints,
    };
  },
});

/**
 * Force-bind a known ghost lender-delivery token into clientPortalLinks for a file.
 * Re-homes the delivery session row when pipelineFileId differs.
 */
export const bindGhostLenderLink = mutation({
  args: {
    adminSecret: v.string(),
    pipelineFileId: v.id("pipeline"),
    token: v.string(),
  },
  handler: async (ctx, { adminSecret, pipelineFileId, token }) => {
    assertDataMigrationAdmin(adminSecret);

    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");

    const delivery = await loadDeliveryByTokenCandidates(ctx, token);
    if (!delivery) {
      throw new Error(
        "No lenderDeliveryTokens row found for this token (tried SHA-256 and direct hash).",
      );
    }

    if (delivery.pipelineFileId !== pipelineFileId) {
      await ctx.db.patch(delivery._id, { pipelineFileId });
    }

    const existing = await loadLinkByTokenHash(ctx, delivery.tokenHash);
    if (existing) {
      await ctx.db.patch(existing._id, {
        pipelineFileId,
        organizationId: pipeline.organizationId,
        legacyPath: true,
      });
      return {
        ok: true as const,
        action: "updated" as const,
        linkId: existing._id,
        deliveryId: delivery._id,
        pipelineFileId,
        tokenHash: delivery.tokenHash,
      };
    }

    const lender = delivery.lenderId ? await ctx.db.get(delivery.lenderId) : null;
    const companySlug = slugifyCompanySlug(
      await resolveCompanySlugForPipeline(ctx, pipeline),
    );
    const targetName =
      lender?.company?.trim() ||
      lender?.contactName?.trim() ||
      "Lender (legacy)";
    const status =
      delivery.status === "revoked" ? ("revoked" as const) : ("active" as const);

    const linkId = await registerLenderPortalLink(ctx, {
      pipelineFileId,
      organizationId: pipeline.organizationId,
      lenderDeliveryTokenId: delivery._id,
      lenderId: delivery.lenderId,
      targetName,
      companySlug,
      tokenHash: delivery.tokenHash,
      expiresAt: delivery.expiresAt,
      createdByUserKey: delivery.createdByUserKey,
      createdAt: delivery.createdAt,
    });

    await ctx.db.patch(linkId, {
      legacyPath: true,
      status,
      ...(status === "revoked" ? { revokedAt: delivery.createdAt } : {}),
    });

    return {
      ok: true as const,
      action: "created" as const,
      linkId,
      deliveryId: delivery._id,
      pipelineFileId,
      tokenHash: delivery.tokenHash,
      companySlug,
      targetName,
    };
  },
});
