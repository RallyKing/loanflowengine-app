/**
 * Phase 12.2 Step 8D — pipeline file share certification (production hard proof).
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  assertCanMutatePipelineRow,
  filterPipelineRowsForMember,
  removeResourceShare,
  resolvePipelineAccessLevel,
  upsertResourceShare,
} from "../resourceAccess";
import { resolveShareTargetUserKey } from "../shareTargetResolve";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER_ID = "ts7d3keadq48gay3pa8k6gdwx9878p33";
const TARGET_EMAIL = "joshuaeballard@gmail.com";
const EMAIL_VARIANTS = [
  "joshuaeballard@gmail.com",
  "JoshuaEBallard@gmail.com",
  "JOSHUAEBALLARD@GMAIL.COM",
  "  joshuaeballard@gmail.com  ",
] as const;

async function visibleFileCounts(ctx: QueryCtx | MutationCtx, memberUserKey: string) {
  const files = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", JOSHUA_ORG_ID),
    )
    .collect();
  const visible = await filterPipelineRowsForMember(
    ctx,
    files,
    JOSHUA_ORG_ID,
    memberUserKey,
  );
  return {
    files: visible.length,
    fileIds: visible.map((f) => String(f._id)),
  };
}

/** Mirrors `pipelineFileShares.upsertShare` (view or edit). */
async function pipelineShareUpsertViaEmail(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  permission: "view" | "edit",
  emailInput: string,
) {
  const file = await ctx.db.get(fileId);
  if (!file?.organizationId) throw new Error("File missing org scope.");

  const target = await resolveShareTargetUserKey(
    ctx,
    file.organizationId,
    emailInput,
  );
  const now = Date.now();
  const permissionLevel = permission === "edit" ? ("edit" as const) : ("view" as const);
  const access = permission;

  const existing = await ctx.db
    .query("pipelineFileShares")
    .withIndex("by_file_user", (q) => q.eq("fileId", fileId).eq("userKey", target))
    .first();

  if (existing) {
    const isSame =
      existing.access === access &&
      (existing.permissionLevel ?? null) === permissionLevel;
    if (!isSame) {
      await ctx.db.patch(existing._id, {
        access,
        permissionLevel,
        updatedAt: now,
        createdByUserKey: JOSHUA_USER_ID,
      });
    }
  } else {
    await ctx.db.insert("pipelineFileShares", {
      fileId,
      userKey: target,
      access,
      permissionLevel,
      shareKind: "direct",
      createdAt: now,
      updatedAt: now,
      createdByUserKey: JOSHUA_USER_ID,
    });
  }

  await upsertResourceShare(ctx, {
    organizationId: file.organizationId,
    resourceType: "pipeline",
    resourceId: String(fileId),
    sharedUserId: target,
    permission: access,
    createdByUserId: JOSHUA_USER_ID,
  });

  return { target, access, permissionLevel };
}

/** Mirrors `pipelineFileShares.removeShare`. */
async function pipelineShareRemoveViaEmail(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  emailInput: string,
) {
  const file = await ctx.db.get(fileId);
  if (!file?.organizationId) throw new Error("File missing org scope.");

  const target = await resolveShareTargetUserKey(
    ctx,
    file.organizationId,
    emailInput,
  );
  const existing = await ctx.db
    .query("pipelineFileShares")
    .withIndex("by_file_user", (q) => q.eq("fileId", fileId).eq("userKey", target))
    .first();
  if (existing) await ctx.db.delete(existing._id);
  const removed = await removeResourceShare(ctx, {
    resourceType: "pipeline",
    resourceId: String(fileId),
    sharedUserId: target,
  });
  return { removed, target };
}

async function storageIntegrity(ctx: MutationCtx, fileId: Id<"pipeline">) {
  const resourceRows = await ctx.db
    .query("resourceShares")
    .withIndex("by_resource", (q) =>
      q.eq("resourceType", "pipeline").eq("resourceId", String(fileId)),
    )
    .collect();
  const legacyRows = await ctx.db
    .query("pipelineFileShares")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .collect();

  const dupResource = resourceRows.filter(
    (r, i, arr) =>
      arr.findIndex(
        (x) =>
          x.sharedUserId === r.sharedUserId &&
          x.resourceType === r.resourceType &&
          x.resourceId === r.resourceId,
      ) !== i,
  );
  const dupLegacy = legacyRows.filter(
    (r, i, arr) =>
      arr.findIndex((x) => x.userKey === r.userKey && x.fileId === r.fileId) !== i,
  );

  const resourceUserIds = new Set(resourceRows.map((r) => r.sharedUserId));
  const legacyUserIds = new Set(legacyRows.map((r) => r.userKey));
  const orphanLegacy = legacyRows.filter((r) => !resourceUserIds.has(r.userKey));
  const orphanResource = resourceRows.filter((r) => !legacyUserIds.has(r.sharedUserId));

  const ownerLeakage = resourceRows.some((r) => r.sharedUserId === JOSHUA_USER_ID);

  return {
    resourceShareCount: resourceRows.length,
    legacyShareCount: legacyRows.length,
    duplicateResourceShares: dupResource.length,
    duplicateLegacyShares: dupLegacy.length,
    orphanLegacyShares: orphanLegacy.length,
    orphanResourceShares: orphanResource.length,
    ownerLeakage,
    pass:
      dupResource.length === 0 &&
      dupLegacy.length === 0 &&
      orphanLegacy.length === 0 &&
      orphanResource.length === 0 &&
      !ownerLeakage &&
      resourceRows.length === legacyRows.length,
  };
}

export const runPipelineShareCertification = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);

    const emailVariantResults: Array<{
      input: string;
      resolvedUserKey: string | null;
      error: string | null;
    }> = [];
    for (const input of EMAIL_VARIANTS) {
      try {
        const resolved = await resolveShareTargetUserKey(ctx, JOSHUA_ORG_ID, input);
        emailVariantResults.push({ input, resolvedUserKey: resolved, error: null });
      } catch (e) {
        emailVariantResults.push({
          input,
          resolvedUserKey: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    const emailVariantsPass =
      emailVariantResults.every(
        (r) => r.resolvedUserKey === EBALLARD_USER_ID && !r.error,
      ) && emailVariantResults.length === EMAIL_VARIANTS.length;

    const matrixA = await visibleFileCounts(ctx, EBALLARD_USER_ID);
    const beforeJoshua = await visibleFileCounts(ctx, JOSHUA_USER_ID);

    const files = await ctx.db
      .query("pipeline")
      .withIndex("by_organization_createdAt", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID),
      )
      .collect();
    const joshuaFiles = await filterPipelineRowsForMember(
      ctx,
      files,
      JOSHUA_ORG_ID,
      JOSHUA_USER_ID,
    );
    const shareFile = joshuaFiles[0];
    if (!shareFile) {
      throw new Error("Joshua must own at least one pipeline file.");
    }
    const shareFileId = shareFile._id;

    await pipelineShareRemoveViaEmail(ctx, shareFileId, TARGET_EMAIL);

    const matrixBShare = await pipelineShareUpsertViaEmail(
      ctx,
      shareFileId,
      "view",
      TARGET_EMAIL,
    );
    const matrixB = await visibleFileCounts(ctx, EBALLARD_USER_ID);
    const matrixBAccess = await resolvePipelineAccessLevel(
      ctx,
      shareFile,
      EBALLARD_USER_ID,
    );
    let matrixBEditDenied = false;
    try {
      await assertCanMutatePipelineRow(ctx, shareFile, EBALLARD_USER_ID, "proof_edit");
    } catch {
      matrixBEditDenied = true;
    }
    const integrityAfterB = await storageIntegrity(ctx, shareFileId);

    const matrixCShare = await pipelineShareUpsertViaEmail(
      ctx,
      shareFileId,
      "edit",
      TARGET_EMAIL,
    );
    const matrixC = await visibleFileCounts(ctx, EBALLARD_USER_ID);
    const matrixCAccess = await resolvePipelineAccessLevel(
      ctx,
      shareFile,
      EBALLARD_USER_ID,
    );
    let matrixCEditAllowed = false;
    try {
      await assertCanMutatePipelineRow(ctx, shareFile, EBALLARD_USER_ID, "proof_edit");
      matrixCEditAllowed = true;
    } catch {
      matrixCEditAllowed = false;
    }
    const integrityAfterC = await storageIntegrity(ctx, shareFileId);

    const matrixDRevoke = await pipelineShareRemoveViaEmail(
      ctx,
      shareFileId,
      TARGET_EMAIL,
    );
    const matrixD = await visibleFileCounts(ctx, EBALLARD_USER_ID);
    const integrityAfterD = await storageIntegrity(ctx, shareFileId);

    const matrixEReShare = await pipelineShareUpsertViaEmail(
      ctx,
      shareFileId,
      "view",
      "  JoshuaEBallard@gmail.com  ",
    );
    const matrixE = await visibleFileCounts(ctx, EBALLARD_USER_ID);
    await pipelineShareRemoveViaEmail(ctx, shareFileId, TARGET_EMAIL);
    const afterCleanupEballard = await visibleFileCounts(ctx, EBALLARD_USER_ID);
    const afterCleanupJoshua = await visibleFileCounts(ctx, JOSHUA_USER_ID);
    const integrityFinal = await storageIntegrity(ctx, shareFileId);

    const pass =
      emailVariantsPass &&
      matrixA.files === 0 &&
      matrixB.files === 1 &&
      matrixB.fileIds.includes(String(shareFileId)) &&
      matrixBAccess === "view" &&
      matrixBEditDenied &&
      matrixBShare.access === "view" &&
      matrixC.files === 1 &&
      matrixCAccess === "edit" &&
      matrixCEditAllowed &&
      matrixCShare.access === "edit" &&
      matrixDRevoke.removed &&
      matrixD.files === 0 &&
      matrixE.files === 1 &&
      afterCleanupEballard.files === 0 &&
      afterCleanupJoshua.files === beforeJoshua.files &&
      afterCleanupJoshua.files === 11 &&
      integrityAfterB.pass &&
      integrityAfterC.pass &&
      integrityAfterD.pass &&
      integrityFinal.pass;

    return {
      pass,
      sharedFileId: String(shareFileId),
      emailVariants: { pass: emailVariantsPass, variants: emailVariantResults },
      matrix: {
        A: { label: "recipient baseline 0 files", ...matrixA, pass: matrixA.files === 0 },
        B: {
          label: "view share → 1 file, edit denied",
          visibility: matrixB,
          accessLevel: matrixBAccess,
          editDenied: matrixBEditDenied,
          share: matrixBShare,
          integrity: integrityAfterB,
          pass:
            matrixB.files === 1 &&
            matrixBAccess === "view" &&
            matrixBEditDenied &&
            integrityAfterB.pass,
        },
        C: {
          label: "upgrade to edit → edit allowed",
          visibility: matrixC,
          accessLevel: matrixCAccess,
          editAllowed: matrixCEditAllowed,
          share: matrixCShare,
          integrity: integrityAfterC,
          pass:
            matrixC.files === 1 &&
            matrixCAccess === "edit" &&
            matrixCEditAllowed &&
            integrityAfterC.pass,
        },
        D: {
          label: "revoke → 0 files",
          revoke: matrixDRevoke,
          visibility: matrixD,
          integrity: integrityAfterD,
          pass: matrixD.files === 0 && matrixDRevoke.removed && integrityAfterD.pass,
        },
        E: {
          label: "re-share via email variant + whitespace",
          reShare: matrixEReShare,
          visibility: matrixE,
          pass: matrixE.files === 1 && matrixEReShare.target === EBALLARD_USER_ID,
        },
      },
      joshuaZeroDrift: {
        before: beforeJoshua,
        after: afterCleanupJoshua,
        pass:
          afterCleanupJoshua.files === beforeJoshua.files &&
          afterCleanupJoshua.files === 11,
      },
      storageIntegrityFinal: integrityFinal,
    };
  },
});
