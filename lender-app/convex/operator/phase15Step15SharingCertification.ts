/**
 * Phase 15 Step 15 — global canonical sharing certification + repair proof.
 */
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  auditEmailVariantsForOrg,
  runRepairs,
  scanIntegrity,
} from "../auth/identityIntegrityRepair";
import {
  collectAuthUsersByCanonicalLogin,
  findAuthUserForShareResolution,
} from "../auth/canonicalIdentity";
import { resolveShareTargetUserKey } from "../shareTargetResolve";
import { resolveDisplayUsernameForUserKey } from "../auth/displayIdentity";
import {
  assertCanMutatePipelineRow,
  assertCanMutateTaskRow,
  filterPipelineRowsForMember,
  filterTaskRowsForMember,
  removeResourceShare,
  resolvePipelineAccessLevel,
  resolveRowOwnerUserId,
  resolveTaskAccessLevel,
  upsertResourceShare,
} from "../resourceAccess";
import { pickCanonicalOrgMember } from "../orgMembership";
import { shareFileImpl } from "../pipelineFileShares";
import { notifyResourceShareEvent } from "../resourceOwnershipPresentation";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;

const CERT_ACCOUNTS = [
  "joshua@directlendingconnection.com",
  "joshuaeballard@gmail.com",
  "joshuaeballar1@gmail.com",
] as const;

const EMAIL_VARIANTS = [
  "joshua@directlendingconnection.com",
  "Joshua@DirectLendingConnection.com",
  "JOSHUA@DIRECTLENDINGCONNECTION.COM",
  "  joshua@directlendingconnection.com  ",
  "joshuaeballard@gmail.com",
  "JoshuaEBallard@gmail.com",
  "joshuaeballar1@gmail.com",
  "  joshuaeballar1@gmail.com  ",
] as const;

async function resolveCertAccount(
  ctx: QueryCtx | MutationCtx,
  email: string,
) {
  const auth = await findAuthUserForShareResolution(ctx, email);
  if (!auth) {
    return {
      email,
      userKey: null as string | null,
      inOrg: false,
      memberActive: false,
      error: "auth_user_not_found",
    };
  }
  const userKey = String(auth._id);
  const rows = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", JOSHUA_ORG_ID).eq("userKey", userKey),
    )
    .collect();
  const member = pickCanonicalOrgMember(rows);
  return {
    email,
    userKey,
    displayUsername: await resolveDisplayUsernameForUserKey(ctx, userKey),
    inOrg: Boolean(member),
    memberActive: member?.isActive !== false,
    error: member ? null : "not_org_member",
  };
}

async function symmetricResolveCheck(
  ctx: QueryCtx | MutationCtx,
  fromEmail: string,
  toEmail: string,
) {
  try {
    const a = await resolveShareTargetUserKey(ctx, JOSHUA_ORG_ID, fromEmail);
    const b = await resolveShareTargetUserKey(ctx, JOSHUA_ORG_ID, toEmail);
    return {
      fromEmail,
      toEmail,
      fromResolved: a,
      toResolved: b,
      pass: Boolean(a && b),
      error: null as string | null,
    };
  } catch (e) {
    return {
      fromEmail,
      toEmail,
      fromResolved: null,
      toResolved: null,
      pass: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export const scanPlatformSharingReadiness = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);
    const integrity = await scanIntegrity(ctx);
    const accounts = [];
    for (const email of CERT_ACCOUNTS) {
      accounts.push(await resolveCertAccount(ctx, email));
    }
    const symmetry = [];
    for (const a of CERT_ACCOUNTS) {
      for (const b of CERT_ACCOUNTS) {
        if (a === b) continue;
        symmetry.push(await symmetricResolveCheck(ctx, a, b));
      }
    }
    const variantAudits = [];
    for (const email of CERT_ACCOUNTS) {
      variantAudits.push(
        await auditEmailVariantsForOrg(ctx, JOSHUA_ORG_ID, email),
      );
    }
    return {
      integrity,
      accounts,
      symmetry,
      variantAudits,
      pass:
        integrity.issueCount === 0 &&
        accounts.every((a) => a.inOrg && !a.error) &&
        symmetry.every((s) => s.pass) &&
        variantAudits.every((v) => v.pass),
    };
  },
});

export const runGlobalSharingCertification = mutation({
  args: {
    adminSecret: v.string(),
    repairFirst: v.optional(v.boolean()),
  },
  handler: async (ctx, { adminSecret, repairFirst }) => {
    assertDataMigrationAdmin(adminSecret);

    const repairBefore = await scanIntegrity(ctx);
    const repair =
      repairFirst !== false
        ? {
            dryRun: false,
            before: repairBefore,
            repairs: await runRepairs(ctx, false),
            after: await scanIntegrity(ctx),
          }
        : null;

    const accounts = [];
    for (const email of CERT_ACCOUNTS) {
      accounts.push(await resolveCertAccount(ctx, email));
    }

    const symmetry = [];
    for (const a of CERT_ACCOUNTS) {
      for (const b of CERT_ACCOUNTS) {
        if (a === b) continue;
        symmetry.push(await symmetricResolveCheck(ctx, a, b));
      }
    }

    const variantRows = [];
    for (const input of EMAIL_VARIANTS) {
      const matches = await collectAuthUsersByCanonicalLogin(ctx, input);
      let resolved: string | null = null;
      let error: string | null = null;
      try {
        if (matches.length === 1) {
          resolved = await resolveShareTargetUserKey(ctx, JOSHUA_ORG_ID, input);
        } else if (matches.length > 1) {
          error = "CANONICAL_AUTH_IDENTITY_CONFLICT";
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      variantRows.push({
        input,
        authUserIds: matches.map((m) => String(m._id)),
        resolvedUserKey: resolved,
        error,
      });
    }

    const primary = accounts.find(
      (a) => a.email === "joshua@directlendingconnection.com",
    );
    const secondary = accounts.find(
      (a) => a.email === "joshuaeballard@gmail.com",
    );
    const tertiary = accounts.find((a) => a.email === "joshuaeballar1@gmail.com");

    if (!primary?.userKey || !secondary?.userKey || !tertiary?.userKey) {
      throw new Error(
        "Certification accounts must resolve and belong to org — run repair or fix membership.",
      );
    }

    const matrix = await runLiveShareMatrix(ctx, {
      primaryKey: primary.userKey,
      secondaryKey: secondary.userKey,
      tertiaryKey: tertiary.userKey,
      primaryEmail: primary.email,
      secondaryEmail: secondary.email,
      tertiaryEmail: tertiary.email,
    });

    const afterIntegrity = await scanIntegrity(ctx);

    const pass =
      (repair == null || repair.after.issueCount === 0) &&
      symmetry.every((s) => s.pass) &&
      matrix.pass &&
      afterIntegrity.issueCount === 0;

    return {
      pass,
      repair,
      accounts,
      symmetry,
      emailVariants: variantRows,
      matrix,
      afterIntegrity,
      resolverPath: "shareTargetResolve → findAuthUserForShareResolution → collectAuthUsersByCanonicalLogin",
      resourceTables: ["resourceShares"],
      shareMutations: [
        "taskShares.upsertShare",
        "taskShares.removeShare",
        "pipelineFileShares.shareFile",
        "pipelineFileShares.updateSharePermission",
        "pipelineFileShares.revokeShare",
      ],
    };
  },
});

const CERT_FILE_PREFIX = "CERT_SHARE_FILE_";
const CERT_TASK_PREFIX = "CERT_SHARE_TASK_";

async function ensureCertOwnedPair(
  ctx: MutationCtx,
  ownerKey: string,
  label: string,
) {
  const now = Date.now();
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
    .collect();
  let task = tasks.find(
    (t) =>
      resolveRowOwnerUserId(t) === ownerKey &&
      t.title.startsWith(CERT_TASK_PREFIX),
  );
  if (!task) {
    const taskId = await ctx.db.insert("tasks", {
      title: `${CERT_TASK_PREFIX}${label}`,
      type: "work",
      category: "admin",
      quadrant: 2,
      status: "todo",
      priority: 0,
      organizationId: JOSHUA_ORG_ID,
      ownerUserId: ownerKey,
      createdAt: now,
      updatedAt: now,
    });
    task = (await ctx.db.get(taskId))!;
  }

  const files = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", JOSHUA_ORG_ID),
    )
    .collect();
  let file = files.find(
    (f) =>
      resolveRowOwnerUserId(f) === ownerKey &&
      f.fileName.startsWith(CERT_FILE_PREFIX),
  );
  if (!file) {
    const fileId = await ctx.db.insert("pipeline", {
      fileName: `${CERT_FILE_PREFIX}${label}`,
      status: "Lead",
      rate: 0,
      term: "",
      lenders: [],
      contacts: [],
      organizationId: JOSHUA_ORG_ID,
      ownerUserId: ownerKey,
      ownerUserKey: ownerKey,
      createdAt: now,
      updatedAt: now,
    });
    file = (await ctx.db.get(fileId))!;
  }

  return { task, file };
}

async function runLiveShareMatrix(
  ctx: MutationCtx,
  args: {
    primaryKey: string;
    secondaryKey: string;
    tertiaryKey: string;
    primaryEmail: string;
    secondaryEmail: string;
    tertiaryEmail: string;
  },
) {
  const steps: Array<{ name: string; pass: boolean; detail?: unknown }> = [];

  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
    .collect();
  const files = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", JOSHUA_ORG_ID),
    )
    .collect();

  const primaryTasks = await filterTaskRowsForMember(
    ctx,
    tasks,
    JOSHUA_ORG_ID,
    args.primaryKey,
  );
  const primaryFiles = await filterPipelineRowsForMember(
    ctx,
    files,
    JOSHUA_ORG_ID,
    args.primaryKey,
  );
  const task = primaryTasks[0];
  const file = primaryFiles[0];
  const { task: secondaryTask, file: secondaryFile } = await ensureCertOwnedPair(
    ctx,
    args.secondaryKey,
    "secondary",
  );
  const { task: tertiaryTask, file: tertiaryFile } = await ensureCertOwnedPair(
    ctx,
    args.tertiaryKey,
    "tertiary",
  );
  if (!task || !file) {
    throw new Error("Primary account needs at least one owned task and pipeline file.");
  }

  const cleanup = async () => {
    for (const key of [args.secondaryKey, args.tertiaryKey, args.primaryKey]) {
      await removeResourceShare(ctx, {
        resourceType: "task",
        resourceId: String(task._id),
        sharedUserId: key,
      });
      await removeResourceShare(ctx, {
        resourceType: "pipeline",
        resourceId: String(file._id),
        sharedUserId: key,
      });
      if (secondaryTask) {
        await removeResourceShare(ctx, {
          resourceType: "task",
          resourceId: String(secondaryTask._id),
          sharedUserId: key,
        });
      }
      if (secondaryFile) {
        await removeResourceShare(ctx, {
          resourceType: "pipeline",
          resourceId: String(secondaryFile._id),
          sharedUserId: key,
        });
      }
    }
  };
  await cleanup();

  const sharePair = async (
    name: string,
    fromKey: string,
    toEmail: string,
    toKey: string,
  ) => {
    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "task",
      resourceId: String(task._id),
      sharedUserId: toKey,
      permission: "view",
      createdByUserId: fromKey,
    });
    const taskLevel = await resolveTaskAccessLevel(ctx, task, toKey);
    const taskOk = taskLevel === "view";

    await shareFileImpl(ctx, {
      fileId: file._id,
      targetLoginOrEmail: toEmail,
      permission: "view",
      memberUserKey: fromKey,
    });
    const fileLevel = await resolvePipelineAccessLevel(ctx, file, toKey);
    const fileOk = fileLevel === "view";

    return taskOk && fileOk;
  };

  steps.push({
    name: "A→B task+file",
    pass: await sharePair(
      "primary_to_secondary",
      args.primaryKey,
      args.secondaryEmail,
      args.secondaryKey,
    ),
  });
  await upsertResourceShare(ctx, {
    organizationId: JOSHUA_ORG_ID,
    resourceType: "task",
    resourceId: String(secondaryTask._id),
    sharedUserId: args.primaryKey,
    permission: "view",
    createdByUserId: args.secondaryKey,
  });
  await shareFileImpl(ctx, {
    fileId: secondaryFile._id,
    targetLoginOrEmail: args.primaryEmail,
    permission: "view",
    memberUserKey: args.secondaryKey,
  });
  const bToA =
    (await resolveTaskAccessLevel(ctx, secondaryTask, args.primaryKey)) ===
      "view" &&
    (await resolvePipelineAccessLevel(ctx, secondaryFile, args.primaryKey)) ===
      "view";
  steps.push({ name: "B→A task+file", pass: bToA });
  steps.push({
    name: "A→C task+file",
    pass: await sharePair(
      "primary_to_tertiary",
      args.primaryKey,
      args.tertiaryEmail,
      args.tertiaryKey,
    ),
  });
  await upsertResourceShare(ctx, {
    organizationId: JOSHUA_ORG_ID,
    resourceType: "task",
    resourceId: String(tertiaryTask._id),
    sharedUserId: args.primaryKey,
    permission: "view",
    createdByUserId: args.tertiaryKey,
  });
  await shareFileImpl(ctx, {
    fileId: tertiaryFile._id,
    targetLoginOrEmail: args.primaryEmail,
    permission: "view",
    memberUserKey: args.tertiaryKey,
  });
  const cToA =
    (await resolveTaskAccessLevel(ctx, tertiaryTask, args.primaryKey)) ===
      "view" &&
    (await resolvePipelineAccessLevel(ctx, tertiaryFile, args.primaryKey)) ===
      "view";
  steps.push({ name: "C→A task+file", pass: cToA });

  await upsertResourceShare(ctx, {
    organizationId: JOSHUA_ORG_ID,
    resourceType: "task",
    resourceId: String(task._id),
    sharedUserId: args.secondaryKey,
    permission: "edit",
    createdByUserId: args.primaryKey,
  });
  const editAllowed =
    (await resolveTaskAccessLevel(ctx, task, args.secondaryKey)) === "edit";
  let editMutateOk = false;
  try {
    await assertCanMutateTaskRow(ctx, task, args.secondaryKey, "cert");
    editMutateOk = true;
  } catch {
    editMutateOk = false;
  }
  steps.push({
    name: "upgrade secondary task to edit (co-owner edit)",
    pass: editAllowed && editMutateOk,
    detail: { editAllowed, editMutateOk },
  });

  await upsertResourceShare(ctx, {
    organizationId: JOSHUA_ORG_ID,
    resourceType: "task",
    resourceId: String(task._id),
    sharedUserId: args.secondaryKey,
    permission: "view",
    createdByUserId: args.primaryKey,
  });
  const downgraded = (await resolveTaskAccessLevel(ctx, task, args.secondaryKey)) === "view";
  steps.push({ name: "downgrade secondary task to view", pass: downgraded });

  await shareFileImpl(ctx, {
    fileId: file._id,
    targetLoginOrEmail: args.secondaryEmail,
    permission: "edit",
    memberUserKey: args.primaryKey,
  });
  const fileEdit = (await resolvePipelineAccessLevel(ctx, file, args.secondaryKey)) === "edit";
  steps.push({ name: "upgrade secondary file to edit", pass: fileEdit });

  const primaryLabel = await resolveDisplayUsernameForUserKey(
    ctx,
    args.primaryKey,
  );
  const certLabel = "CERT_SHARE_NOTIFY_TASK";
  await notifyResourceShareEvent(ctx, {
    recipientUserKey: args.secondaryKey,
    actorUserKey: args.primaryKey,
    resourceType: "task",
    resourceId: String(task._id),
    taskId: task._id,
    event: "shared",
    resourceLabel: certLabel,
  });

  const recent = await ctx.db
    .query("userNotifications")
    .withIndex("by_user_created", (q) => q.eq("userKey", args.secondaryKey))
    .order("desc")
    .take(12);
  const hit = recent.find(
    (n) =>
      n.actorUserKey === args.primaryKey &&
      n.taskId === task._id &&
      n.summary.includes(certLabel) &&
      n.summary.includes(primaryLabel),
  );
  const notifOk = Boolean(hit) && !/\borg\b/i.test(hit!.summary);
  steps.push({
    name: "notification canonical actor label",
    pass: notifOk,
    detail: {
      summary: hit?.summary,
      primaryLabel,
      actorUserKey: hit?.actorUserKey,
    },
  });

  const priorOwner = resolveRowOwnerUserId(task);
  await ctx.db.patch(task._id, {
    ownerUserId: args.secondaryKey,
  });
  const taskAfterTransfer = await ctx.db.get(task._id);
  const transferred =
    taskAfterTransfer != null &&
    resolveRowOwnerUserId(taskAfterTransfer) === args.secondaryKey;
  const secondaryOwns =
    taskAfterTransfer != null &&
    (await resolveTaskAccessLevel(ctx, taskAfterTransfer, args.secondaryKey)) ===
      "edit";
  steps.push({
    name: "ownership transfer task",
    pass: transferred && secondaryOwns,
    detail: { priorOwner, newOwner: args.secondaryKey },
  });
  if (priorOwner) {
    await ctx.db.patch(task._id, { ownerUserId: priorOwner });
  }

  await removeResourceShare(ctx, {
    resourceType: "task",
    resourceId: String(task._id),
    sharedUserId: args.tertiaryKey,
  });
  const revoked = (await resolveTaskAccessLevel(ctx, task, args.tertiaryKey)) === "none";
  steps.push({ name: "revoke tertiary task share", pass: revoked });

  await cleanup();

  const pass = steps.every((s) => s.pass);
  return {
    pass,
    taskId: String(task._id),
    fileId: String(file._id),
    steps,
    propagationNote:
      "Convex mutations commit atomically — resourceShares visible on next query subscription tick.",
  };
}
