/**
 * Phase 15 Step 11 — file-scoped downstream ACL proof (secondary session).
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { api } from "../_generated/api";
import type { PipelineTablePreviewRow } from "../../lib/pipelineTablePreview";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER_ID = "ts7d3keadq48gay3pa8k6gdwx9878p33";

const ACCESS_DENIED = "You do not have access to this pipeline file.";

async function expectAccessDenied(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return false;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.includes(ACCESS_DENIED) || msg.includes("Pipeline file not found");
  }
}

export const runSecuritySweepProofStep15_11 = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const orgId = args.organizationId ?? JOSHUA_ORG_ID;

    const joshuaRows = (await ctx.runQuery(api.pipeline.listTablePreview, {
      organizationId: orgId,
      memberUserKey: JOSHUA_USER_ID,
      includeArchived: false,
      includeSnoozed: false,
    })) as PipelineTablePreviewRow[];

    const eballardRows = (await ctx.runQuery(api.pipeline.listTablePreview, {
      organizationId: orgId,
      memberUserKey: EBALLARD_USER_ID,
      includeArchived: false,
      includeSnoozed: false,
    })) as PipelineTablePreviewRow[];

    const eballardIds = new Set(eballardRows.map((r) => String(r._id)));
    const privateFile = joshuaRows.find((r) => !eballardIds.has(String(r._id)));

    if (!privateFile) {
      return {
        pass: false,
        reason: "No joshua-only file found for ACL denial test",
        joshuaCount: joshuaRows.length,
        eballardCount: eballardRows.length,
      };
    }

    const fileId = privateFile._id;
    const orgScope = {
      organizationId: orgId,
      memberUserKey: EBALLARD_USER_ID,
    };

    const ledgerDenied = await expectAccessDenied(() =>
      ctx.runQuery(api.ledger.byFileId, {
        fileId,
        memberUserKey: EBALLARD_USER_ID,
      }),
    );

    const fileStateDenied = await expectAccessDenied(() =>
      ctx.runQuery(api.fileSharedState.getNormalized, {
        fileId,
        memberUserKey: EBALLARD_USER_ID,
      }),
    );

    const activityDenied = await expectAccessDenied(() =>
      ctx.runQuery(api.pipelineFileActivity.listForFile, {
        fileId,
        limit: 5,
        memberUserKey: EBALLARD_USER_ID,
      }),
    );

    const tasksDenied = await expectAccessDenied(() =>
      ctx.runQuery(api.tasks.byRelatedFile, {
        fileId,
        ...orgScope,
      }),
    );

    const paymentsDenied = await expectAccessDenied(() =>
      ctx.runQuery(api.payments.listForFile, {
        fileId,
        memberUserKey: EBALLARD_USER_ID,
      }),
    );

    const pass =
      ledgerDenied && fileStateDenied && activityDenied && tasksDenied && paymentsDenied;

    return {
      pass,
      testFileId: String(fileId),
      testFileName: privateFile.fileName,
      joshuaFileCount: joshuaRows.length,
      eballardFileCount: eballardRows.length,
      denials: {
        ledgerByFileId: ledgerDenied,
        fileSharedStateGetNormalized: fileStateDenied,
        pipelineFileActivityListForFile: activityDenied,
        tasksByRelatedFile: tasksDenied,
        paymentsListForFile: paymentsDenied,
      },
      expectedErrorSubstring: ACCESS_DENIED,
    };
  },
});
