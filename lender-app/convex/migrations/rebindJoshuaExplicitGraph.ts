/**
 * Rebind explicit production CRM/pipeline/lender graph rows to the canonical
 * native auth user + org so org filters and pipeline visibility rules
 * (`ownerUserKey`, `organizationId`) resolve for joshua@directlendingconnection.com.
 *
 * Does not insert synthetic duplicates — only patches existing rows and refreshes
 * `globalSearchText` where helpers exist.
 */
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { normalizeAuthEmail } from "../../lib/auth/normalizeAuthEmail";
import { normalizeUsername } from "../../lib/auth/normalizeUsername";
import { normalizeEmailKey } from "../../lib/crmRelationship";
import { primaryContactEmail } from "../../lib/contact/contactMethods";
import {
  refreshContactGlobalSearchText,
  refreshPipelineGlobalSearchText,
  refreshTaskGlobalSearchText,
} from "../globalSearchSync";

const DEFAULT_TARGET_EMAIL = "joshua@directlendingconnection.com";
const DEFAULT_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;

const DEFAULT_CONTACT_IDS = [
  "ks7dhtvjaqtb5pnxds3xzb76p5866f80",
  "ks7f9f43q996vas74pcwbm2vdn862dkq",
  "ks73g7kw1et3xh282sb451pkf1863xrp",
  "ks77nny03fkjt76pjdm7rtqc0s8638qg",
  "ks75g3wdqt8zr1tz0k5v5aergs863jjx",
  "ks74xxypjh99x6vdwk1n7813258624n7",
  "ks7erq81g3a2gewfzdewbcajt98627sx",
  "ks70vcxqzfey2jw794ypqdtk058636v4",
  "ks7br22b9bbmywyj5bfctqymdd863n2m",
  "ks72mpt7nwayqbfngdqdy46gbd863hbe",
  "ks78wd9jb82m8x035hbhwqenm98628ez",
  "ks70zcm2xmy6f8kzf43ef4aab1862ahq",
  "ks7d93cajh82rr1rmv223zee89863j3v",
  "ks7cx54y8k1sqxn0vjhge6zacd863gyf",
] as const;

const DEFAULT_PIPELINE_IDS = [
  "jx70gzpwchfy3n7ctxk50xv9x1867cwh",
  "jx72qxmxh8dh19yjxkw82zc3zs85xrqx",
  "jx742qyg2q7hwt5ykacdybcc2n85w2gt",
  "jx709j694w6j5yxraqdyy77ey185tjb5",
  "jx7785w2j7h3a0dfe35fm16tcn85tvkr",
  "jx7471gnaccya97e07ft76t0p985srg8",
  "jx75ycf0avyfsmbsd20c6wy0rx85rfha",
  "jx73q1xrywyg8mfmag0hmd95g185qm11",
] as const;

const DEFAULT_LENDER_IDS = [
  "jd77s5255ecsad7xav0ks9ryfd85by75",
  "jd75z27b9g68yzryvjqqhprfgh85akar",
  "jd7btd9925hqbjjttkw70570gd85msnj",
  "jd7egyrcqxt840hc7sktjqsk0d85bewp",
  "jd751nwx56cda820ttd0tcbzdn85qr7p",
  "jd7a3yq0y183bjx520j87th97h85bv6s",
  "jd7awsj0fgtbw2c0mhkn74at7d85rq3b",
] as const;

async function resolveCanonicalAuthUserId(
  ctx: MutationCtx,
  email: string,
): Promise<Id<"authUsers">> {
  const normEmail = normalizeAuthEmail(email);
  if (!normEmail) throw new Error("rebindExplicitGraph: invalid target email.");

  const candidates: Doc<"authUsers">[] = [];
  const seen = new Set<string>();
  const push = (rows: Doc<"authUsers">[]) => {
    for (const r of rows) {
      if (seen.has(r._id)) continue;
      seen.add(r._id);
      candidates.push(r);
    }
  };

  push(
    await ctx.db
      .query("authUsers")
      .withIndex("by_normalizedUsername", (q) =>
        q.eq("normalizedUsername", normEmail),
      )
      .collect(),
  );
  push(
    await ctx.db
      .query("authUsers")
      .withIndex("by_email", (q) => q.eq("email", normEmail))
      .collect(),
  );

  const matches = candidates.filter((u) => {
    const emailHit = normalizeAuthEmail(u.email) === normEmail;
    const userHit = normalizeUsername(u.normalizedUsername) === normEmail;
    return emailHit || userHit;
  });

  if (matches.length === 0) {
    throw new Error(
      `rebindExplicitGraph: no authUsers row for ${normEmail} (normalizedUsername / email).`,
    );
  }
  let best = matches[0]!;
  for (let i = 1; i < matches.length; i++) {
    const c = matches[i]!;
    if (c.createdAt > best.createdAt) best = c;
  }
  return best._id;
}

async function expandGraph(
  ctx: MutationCtx,
  seedContacts: Set<Id<"contacts">>,
  seedPipelines: Set<Id<"pipeline">>,
  seedLenders: Set<Id<"lenders">>,
): Promise<{
  contacts: Set<Id<"contacts">>;
  pipelines: Set<Id<"pipeline">>;
  lenders: Set<Id<"lenders">>;
}> {
  const contacts = new Set(seedContacts);
  const pipelines = new Set(seedPipelines);
  const lenders = new Set(seedLenders);

  for (let round = 0; round < 3; round++) {
    for (const cid of [...contacts]) {
      for (const l of await ctx.db
        .query("contactFileLinks")
        .withIndex("by_contact", (q) => q.eq("contactId", cid))
        .collect()) {
        pipelines.add(l.fileId);
      }
      for (const l of await ctx.db
        .query("contactLenderLinks")
        .withIndex("by_contact", (q) => q.eq("contactId", cid))
        .collect()) {
        lenders.add(l.lenderId);
      }
    }

    for (const pid of [...pipelines]) {
      const p = await ctx.db.get(pid);
      if (!p) continue;
      for (const lid of p.lenders) lenders.add(lid);
      if (p.selectedLenderId) lenders.add(p.selectedLenderId);
    }

    for (const lid of [...lenders]) {
      for (const p of await ctx.db.query("pipeline").collect()) {
        if (p.selectedLenderId === lid) {
          pipelines.add(p._id);
          continue;
        }
        if (p.lenders.some((x) => x === lid)) pipelines.add(p._id);
      }
    }

    for (const pid of [...pipelines]) {
      for (const l of await ctx.db
        .query("contactFileLinks")
        .withIndex("by_file", (q) => q.eq("fileId", pid))
        .collect()) {
        contacts.add(l.contactId);
      }
    }
  }

  return { contacts, pipelines, lenders };
}

export const rebindExplicitGraph = mutation({
  args: {
    adminSecret: v.string(),
    targetEmail: v.optional(v.string()),
    organizationId: v.optional(v.id("organizations")),
    contactIds: v.optional(v.array(v.id("contacts"))),
    pipelineIds: v.optional(v.array(v.id("pipeline"))),
    lenderIds: v.optional(v.array(v.id("lenders"))),
    dryRun: v.optional(v.boolean()),
    /** Clear archivedAt + snoozedOnly on affected pipeline rows for default list visibility. */
    surfacePipelineRowsInDefaultViews: v.optional(v.boolean()),
    /**
     * When true (default), use baked-in production id lists when args arrays are empty.
     * Set false + pass explicit ids to override completely.
     */
    useProductionDefaults: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const dry = args.dryRun === true;
    const surface = args.surfacePipelineRowsInDefaultViews === true;

    const targetEmail = (args.targetEmail?.trim() || DEFAULT_TARGET_EMAIL).trim();
    const orgId = args.organizationId ?? DEFAULT_ORG_ID;

    const org = await ctx.db.get(orgId);
    if (!org) throw new Error(`rebindExplicitGraph: organization ${orgId} not found.`);

    const userId = await resolveCanonicalAuthUserId(ctx, targetEmail);
    const userIdStr = userId as string;

    const useDefaults = args.useProductionDefaults !== false;
    const contactIdsRaw: Id<"contacts">[] =
      args.contactIds && args.contactIds.length > 0
        ? args.contactIds
        : useDefaults
          ? ([...DEFAULT_CONTACT_IDS] as unknown as Id<"contacts">[])
          : [];
    const pipelineIdsRaw: Id<"pipeline">[] =
      args.pipelineIds && args.pipelineIds.length > 0
        ? args.pipelineIds
        : useDefaults
          ? ([...DEFAULT_PIPELINE_IDS] as unknown as Id<"pipeline">[])
          : [];
    const lenderIdsRaw: Id<"lenders">[] =
      args.lenderIds && args.lenderIds.length > 0
        ? args.lenderIds
        : useDefaults
          ? ([...DEFAULT_LENDER_IDS] as unknown as Id<"lenders">[])
          : [];

    const expanded = await expandGraph(
      ctx,
      new Set(contactIdsRaw),
      new Set(pipelineIdsRaw),
      new Set(lenderIdsRaw),
    );

    const report = {
      ok: true as const,
      dryRun: dry,
      targetEmail: normalizeAuthEmail(targetEmail),
      canonicalAuthUserId: userIdStr,
      organizationId: orgId as string,
      expandedCounts: {
        contacts: expanded.contacts.size,
        pipelines: expanded.pipelines.size,
        lenders: expanded.lenders.size,
      },
      contacts: {
        found: 0,
        patchedOrgOrEmailKey: 0,
        missing: [] as string[],
        skippedDuplicateEmail: [] as string[],
      },
      pipelines: {
        found: 0,
        patched: 0,
        missing: [] as string[],
        surfaceFieldsCleared: 0,
      },
      lenders: {
        found: 0,
        patchedOrg: 0,
        missing: [] as string[],
      },
      lenderAttachments: { patched: 0 },
      tasks: { patched: 0 },
      fileMessages: { patched: 0 },
      contactActivity: { patched: 0 },
      libraryDocuments: { patched: 0 },
      libraryDocumentVersions: { patched: 0 },
      libraryDocumentLinks: { patched: 0 },
      activityFeed: { patched: 0 },
      notifications: { task: 0, user: 0 },
      authUserDefaultOrgPatched: false,
      membershipInserted: false,
    };

    const authUser = await ctx.db.get(userId);
    if (
      authUser &&
      authUser.defaultOrganizationId !== orgId &&
      !dry
    ) {
      await ctx.db.patch(userId, { defaultOrganizationId: orgId });
      report.authUserDefaultOrgPatched = true;
    }

    const mem = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", orgId).eq("userKey", userIdStr),
      )
      .first();
    if (!mem && !dry) {
      await ctx.db.insert("organizationMembers", {
        organizationId: orgId,
        userKey: userIdStr,
        role: "owner",
        createdAt: Date.now(),
      });
      report.membershipInserted = true;
    }

    for (const cid of expanded.contacts) {
      const c = await ctx.db.get(cid);
      if (!c) {
        report.contacts.missing.push(cid as string);
        continue;
      }
      report.contacts.found++;
      const ek = normalizeEmailKey(primaryContactEmail(c));
      if (ek && c.organizationId !== orgId) {
        const dup = await ctx.db
          .query("contacts")
          .withIndex("by_organization_emailKey", (q) =>
            q.eq("organizationId", orgId).eq("emailKey", ek),
          )
          .first();
        if (dup && dup._id !== c._id) {
          report.contacts.skippedDuplicateEmail.push(cid as string);
          continue;
        }
      }
      const patch: Record<string, unknown> = {};
      if (c.organizationId !== orgId) patch.organizationId = orgId;
      if (ek && c.emailKey !== ek) patch.emailKey = ek;
      if (Object.keys(patch).length) {
        if (!dry) {
          await ctx.db.patch(cid, patch as Partial<Doc<"contacts">>);
          report.contacts.patchedOrgOrEmailKey++;
        }
      }
      if (!dry) await refreshContactGlobalSearchText(ctx, cid);
    }

    for (const pid of expanded.pipelines) {
      const p = await ctx.db.get(pid);
      if (!p) {
        report.pipelines.missing.push(pid as string);
        continue;
      }
      report.pipelines.found++;
      const patch: Record<string, unknown> = {};
      if (p.organizationId !== orgId) patch.organizationId = orgId;
      const own = p.ownerUserKey?.trim() ?? "";
      if (own !== userIdStr) patch.ownerUserKey = userIdStr;
      const asn = p.assigneeId?.trim() ?? "";
      if (asn && asn !== userIdStr) patch.assigneeId = userIdStr;
      if (surface) {
        if (p.archivedAt != null) {
          patch.archivedAt = undefined;
        }
        if (p.snoozedUntil != null) {
          patch.snoozedUntil = undefined;
        }
      }
      if (Object.keys(patch).length) {
        if (!dry) {
          await ctx.db.patch(pid, patch as Partial<Doc<"pipeline">>);
          report.pipelines.patched++;
          if (surface) {
            if (p.archivedAt != null) report.pipelines.surfaceFieldsCleared++;
            if (p.snoozedUntil != null) report.pipelines.surfaceFieldsCleared++;
          }
        }
      }
      if (!dry) await refreshPipelineGlobalSearchText(ctx, pid);
    }

    for (const lid of expanded.lenders) {
      const len = await ctx.db.get(lid);
      if (!len) {
        report.lenders.missing.push(lid as string);
        continue;
      }
      report.lenders.found++;
      if (len.organizationId !== orgId) {
        if (!dry) {
          await ctx.db.patch(lid, { organizationId: orgId });
          report.lenders.patchedOrg++;
        }
      }
    }

    for (const lid of expanded.lenders) {
      for (const a of await ctx.db
        .query("lenderAttachments")
        .withIndex("by_lender", (q) => q.eq("lenderId", lid))
        .collect()) {
        if (a.organizationId === orgId) continue;
        if (!dry) {
          await ctx.db.patch(a._id, { organizationId: orgId });
          report.lenderAttachments.patched++;
        }
      }
    }

    for (const pid of expanded.pipelines) {
      for (const t of await ctx.db
        .query("tasks")
        .withIndex("by_relatedFile", (q) => q.eq("relatedFileId", pid))
        .collect()) {
        const patch: Record<string, unknown> = {};
        if (t.organizationId !== orgId) patch.organizationId = orgId;
        const a = t.assigneeId?.trim() ?? "";
        if (a && a !== userIdStr) patch.assigneeId = userIdStr;
        if (Object.keys(patch).length) {
          if (!dry) {
            await ctx.db.patch(t._id, patch as Partial<Doc<"tasks">>);
            report.tasks.patched++;
          }
        }
        if (!dry) await refreshTaskGlobalSearchText(ctx, t._id);
      }
    }

    for (const cid of expanded.contacts) {
      for (const t of await ctx.db
        .query("tasks")
        .withIndex("by_relatedContact", (q) => q.eq("relatedContactId", cid))
        .collect()) {
        const patch: Record<string, unknown> = {};
        if (t.organizationId !== orgId) patch.organizationId = orgId;
        const a = t.assigneeId?.trim() ?? "";
        if (a && a !== userIdStr) patch.assigneeId = userIdStr;
        if (Object.keys(patch).length) {
          if (!dry) {
            await ctx.db.patch(t._id, patch as Partial<Doc<"tasks">>);
            report.tasks.patched++;
          }
        }
        if (!dry) await refreshTaskGlobalSearchText(ctx, t._id);
      }
    }

    for (const pid of expanded.pipelines) {
      for (const m of await ctx.db
        .query("fileMessages")
        .withIndex("by_file_audience_root_created", (q) =>
          q.eq("pipelineFileId", pid),
        )
        .collect()) {
        const patch: Record<string, unknown> = {};
        if (m.organizationId !== orgId) patch.organizationId = orgId;
        const t = m.teamUserKey?.trim() ?? "";
        if (t && t !== userIdStr) patch.teamUserKey = userIdStr;
        if (Object.keys(patch).length) {
          if (!dry) {
            await ctx.db.patch(m._id, patch as Partial<Doc<"fileMessages">>);
            report.fileMessages.patched++;
          }
        }
      }
    }

    for (const cid of expanded.contacts) {
      for (const row of await ctx.db
        .query("contactActivity")
        .withIndex("by_contact_at", (q) => q.eq("contactId", cid))
        .collect()) {
        const ak = row.actorUserKey?.trim() ?? "";
        if (!ak || ak === "__system__" || ak === userIdStr) continue;
        if (!dry) {
          await ctx.db.patch(row._id, { actorUserKey: userIdStr });
          report.contactActivity.patched++;
        }
      }
    }

    const docIds = new Set<Id<"libraryDocuments">>();
    for (const link of await ctx.db.query("libraryDocumentLinks").collect()) {
      if (
        link.pipelineFileId &&
        expanded.pipelines.has(link.pipelineFileId)
      ) {
        docIds.add(link.documentId);
      }
      if (link.contactId && expanded.contacts.has(link.contactId)) {
        docIds.add(link.documentId);
      }
    }

    for (const docId of docIds) {
      const d = await ctx.db.get(docId);
      if (!d) continue;
      const patch: Record<string, unknown> = {};
      if (d.organizationId !== orgId) patch.organizationId = orgId;
      if ((d.createdByUserKey ?? "").trim() !== userIdStr) {
        patch.createdByUserKey = userIdStr;
      }
      if (Object.keys(patch).length) {
        if (!dry) {
          await ctx.db.patch(docId, patch as Partial<Doc<"libraryDocuments">>);
          report.libraryDocuments.patched++;
        }
      }
      for (const vrow of await ctx.db
        .query("libraryDocumentVersions")
        .withIndex("by_document_version", (q) => q.eq("documentId", docId))
        .collect()) {
        if (vrow.uploadedByUserKey.trim() === userIdStr) continue;
        if (!dry) {
          await ctx.db.patch(vrow._id, { uploadedByUserKey: userIdStr });
          report.libraryDocumentVersions.patched++;
        }
      }
    }

    for (const link of await ctx.db.query("libraryDocumentLinks").collect()) {
      const touches =
        (link.pipelineFileId != null &&
          expanded.pipelines.has(link.pipelineFileId)) ||
        (link.contactId != null && expanded.contacts.has(link.contactId));
      if (!touches) continue;
      if (link.linkedByUserKey.trim() === userIdStr) continue;
      if (!dry) {
        await ctx.db.patch(link._id, { linkedByUserKey: userIdStr });
        report.libraryDocumentLinks.patched++;
      }
    }

    for (const row of await ctx.db.query("activityFeed").collect()) {
      const touchesFile =
        row.fileId != null && expanded.pipelines.has(row.fileId);
      const touchesContact =
        row.contactId != null && expanded.contacts.has(row.contactId);
      const touchesLender =
        row.lenderId != null && expanded.lenders.has(row.lenderId);
      if (!touchesFile && !touchesContact && !touchesLender) continue;
      if (row.actorKey === "__system__" || row.actorKey === userIdStr) continue;
      if (!dry) {
        await ctx.db.patch(row._id, { actorKey: userIdStr });
        report.activityFeed.patched++;
      }
    }

    for (const pid of expanded.pipelines) {
      for (const n of await ctx.db
        .query("userNotifications")
        .withIndex("by_file", (q) => q.eq("fileId", pid))
        .collect()) {
        if (n.userKey.trim() === userIdStr) continue;
        const patch: { userKey: string; actorUserKey?: string } = {
          userKey: userIdStr,
        };
        const act = n.actorUserKey?.trim();
        if (act && act !== userIdStr) patch.actorUserKey = userIdStr;
        if (!dry) {
          await ctx.db.patch(n._id, patch);
          report.notifications.user++;
        }
      }
    }

    for (const t of await ctx.db.query("tasks").collect()) {
      if (!t.relatedFileId || !expanded.pipelines.has(t.relatedFileId)) continue;
      for (const n of await ctx.db
        .query("taskNotifications")
        .withIndex("by_task", (q) => q.eq("taskId", t._id))
        .collect()) {
        if (n.userKey.trim() === userIdStr) continue;
        const patch: { userKey: string; actorUserKey?: string } = {
          userKey: userIdStr,
        };
        const act = n.actorUserKey?.trim();
        if (act && act !== userIdStr) patch.actorUserKey = userIdStr;
        if (!dry) {
          await ctx.db.patch(n._id, patch);
          report.notifications.task++;
        }
      }
    }

    return report;
  },
});
