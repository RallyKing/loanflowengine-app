/**
 * Single-tenant recovery: bind **all** pipeline, contacts, tasks, lenders (optional),
 * library docs, file messages, attachments, and saved filters to one org + owner.
 *
 * Use when legacy rows are scattered across org ids / owners so list queries
 * (scoped by `activeOrganizationId`) miss data even for SUPER_ADMIN edge cases
 * or wrong Vercel env is fixed later.
 *
 * Gated by `DATA_MIGRATION_ADMIN_SECRET` / `ORG_INTEGRITY_ADMIN_SECRET`.
 */
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, type MutationCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { normalizeAuthEmail } from "../../lib/auth/normalizeAuthEmail";
import { normalizeUsername } from "../../lib/auth/normalizeUsername";
import { normalizeEmailKey } from "../../lib/crmRelationship";
import { primaryContactEmail } from "../../lib/contact/contactMethods";
import { pickCanonicalOrgMember } from "../orgMembership";
import { seedSystemRolesForOrganization } from "../organizationRbac";
import { assertOrganizationId } from "../organizationValidators";
import {
  refreshContactGlobalSearchText,
  refreshPipelineGlobalSearchText,
  refreshTaskGlobalSearchText,
} from "../globalSearchSync";
import { buildLenderSearchBlob } from "../lenderSearchText";

const DEFAULT_EMAIL = "joshua@directlendingconnection.com";

async function resolveCanonicalUserId(
  ctx: MutationCtx,
  email: string,
): Promise<Id<"authUsers">> {
  const normEmail = normalizeAuthEmail(email);
  if (!normEmail) throw new Error("singleTenantConsolidateAllData: invalid email.");

  const candidates: Doc<"authUsers">[] = [];
  const seen = new Set<string>();
  const push = (rows: Doc<"authUsers">[]) => {
    for (const r of rows) {
      if (seen.has(r._id as string)) continue;
      seen.add(r._id as string);
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
      `singleTenantConsolidateAllData: no authUsers for ${normEmail}.`,
    );
  }
  let best = matches[0]!;
  for (let i = 1; i < matches.length; i++) {
    const c = matches[i]!;
    if (c.createdAt > best.createdAt) best = c;
  }
  return best._id;
}

async function ensureOwnerOnOrg(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  userKey: string,
  now: number,
  dry: boolean,
): Promise<void> {
  if (dry) return;

  const seeded = await seedSystemRolesForOrganization(ctx, orgId);
  const adminId = seeded.adminId;

  const mems = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", orgId).eq("userKey", userKey),
    )
    .collect();
  const best = pickCanonicalOrgMember(mems);
  for (const m of mems) {
    if (best && m._id !== best._id) await ctx.db.delete(m._id);
  }
  if (!best) {
    await ctx.db.insert("organizationMembers", {
      organizationId: orgId,
      userKey,
      role: "owner",
      assignedRoleId: adminId,
      createdAt: now,
    });
  } else if (best.role !== "owner" || best.assignedRoleId !== adminId) {
    await ctx.db.patch(best._id, {
      role: "owner",
      assignedRoleId: adminId,
    });
  }
}

export const consolidateAllDataToPrimaryOrg = mutation({
  args: {
    adminSecret: v.string(),
    email: v.optional(v.string()),
    /** When omitted, uses `authUsers.defaultOrganizationId`. */
    organizationId: v.optional(v.id("organizations")),
    dryRun: v.optional(v.boolean()),
    /** Clear `archivedAt` / `snoozedUntil` on pipeline rows so hub defaults show them. */
    surfacePipeline: v.optional(v.boolean()),
    /**
     * When true, rows with `lenders.organizationId` set to a **different** org
     * are moved into the target org (single-tenant). Global lenders (`organizationId` unset) stay global.
     */
    rescopeOtherOrgLenders: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const dry = args.dryRun === true;
    const now = Date.now();
    const email = (args.email?.trim() || DEFAULT_EMAIL).toLowerCase();
    const userId = await resolveCanonicalUserId(ctx, email);
    const userIdStr = userId as string;
    const user = (await ctx.db.get(userId))!;

    const orgId =
      args.organizationId ??
      user.defaultOrganizationId ??
      (() => {
        throw new Error(
          "singleTenantConsolidateAllData: pass organizationId or set authUsers.defaultOrganizationId.",
        );
      })();

    await assertOrganizationId(ctx, orgId);

    const report = {
      dryRun: dry,
      targetEmail: normalizeAuthEmail(email)!,
      canonicalAuthUserId: userIdStr,
      organizationId: orgId as string,
      authUser: { defaultOrgPatched: 0, globalAdminPatched: 0 },
      pipeline: { scanned: 0, patched: 0, surfaced: 0 },
      contacts: { scanned: 0, patched: 0 },
      tasks: { scanned: 0, patched: 0 },
      lenders: { scanned: 0, rescoped: 0 },
      lenderAttachments: { patched: 0 },
      libraryDocuments: { patched: 0 },
      libraryVersions: { patched: 0 },
      signatureEnvelopes: { patched: 0 },
      fileMessages: { patched: 0 },
      savedFilterPresets: { patched: 0 },
    };

    if (!dry) {
      if (user.defaultOrganizationId !== orgId) {
        await ctx.db.patch(userId, {
          defaultOrganizationId: orgId,
          updatedAt: now,
        });
        report.authUser.defaultOrgPatched++;
      }
      if (user.isGlobalAdmin !== true || user.systemRole !== "SUPER_ADMIN") {
        await ctx.db.patch(userId, {
          isGlobalAdmin: true,
          systemRole: "SUPER_ADMIN",
          updatedAt: now,
        });
        report.authUser.globalAdminPatched++;
      }
    }

    await ensureOwnerOnOrg(ctx, orgId, userIdStr, now, dry);

    const surface = args.surfacePipeline === true;
    const rescopeLenders = args.rescopeOtherOrgLenders !== false;

    for (const p of await ctx.db.query("pipeline").collect()) {
      report.pipeline.scanned++;
      const patch: Record<string, unknown> = {};
      if (p.organizationId !== orgId) patch.organizationId = orgId;
      if ((p.ownerUserKey ?? "").trim() !== userIdStr) {
        patch.ownerUserKey = userIdStr;
      }
      const as = (p.assigneeId ?? "").trim();
      if (as && as !== userIdStr) {
        patch.assigneeId = userIdStr;
      }
      if (surface && p.archivedAt != null) {
        patch.archivedAt = undefined;
        report.pipeline.surfaced++;
      }
      if (surface && p.snoozedUntil != null) {
        patch.snoozedUntil = undefined;
        report.pipeline.surfaced++;
      }

      if (Object.keys(patch).length === 0) continue;

      patch.updatedAt = now;
      report.pipeline.patched++;
      if (!dry) {
        await ctx.db.patch(p._id, patch as Partial<Doc<"pipeline">>);
        await refreshPipelineGlobalSearchText(ctx, p._id);
      }
    }

    for (const c of await ctx.db.query("contacts").collect()) {
      report.contacts.scanned++;
      if (c.organizationId === orgId) continue;
      const emailKey = normalizeEmailKey(primaryContactEmail(c));
      report.contacts.patched++;
      if (!dry) {
        await ctx.db.patch(c._id, {
          organizationId: orgId,
          ...(emailKey ? { emailKey } : {}),
          updatedAt: now,
        });
        await refreshContactGlobalSearchText(ctx, c._id);
      }
    }

    for (const t of await ctx.db.query("tasks").collect()) {
      report.tasks.scanned++;
      if (t.organizationId === orgId) continue;
      report.tasks.patched++;
      if (!dry) {
        await ctx.db.patch(t._id, {
          organizationId: orgId,
          updatedAt: now,
        });
        await refreshTaskGlobalSearchText(ctx, t._id);
      }
    }

    if (rescopeLenders) {
      for (const l of await ctx.db.query("lenders").collect()) {
        report.lenders.scanned++;
        const lo = l.organizationId;
        if (lo == null || lo === orgId) continue;
        report.lenders.rescoped++;
        if (!dry) {
          await ctx.db.patch(l._id, {
            organizationId: orgId,
            updatedAt: now,
          });
          const merged = (await ctx.db.get(l._id))!;
          await ctx.db.patch(l._id, {
            searchText: buildLenderSearchBlob(merged),
          });
        }
      }
    }

    for (const a of await ctx.db.query("lenderAttachments").collect()) {
      const lender = await ctx.db.get(a.lenderId);
      const targetOrgOnLender = lender?.organizationId;
      const want =
        targetOrgOnLender != null ? targetOrgOnLender : a.organizationId;
      if (want == null) continue;
      if (a.organizationId === want) continue;
      report.lenderAttachments.patched++;
      if (!dry) {
        await ctx.db.patch(a._id, { organizationId: want });
      }
    }

    for (const d of await ctx.db.query("libraryDocuments").collect()) {
      if (d.organizationId === orgId && d.createdByUserKey === userIdStr) {
        continue;
      }
      const patch: Record<string, unknown> = {};
      if (d.organizationId !== orgId) patch.organizationId = orgId;
      if (d.createdByUserKey.trim() !== userIdStr) {
        patch.createdByUserKey = userIdStr;
      }
      if (Object.keys(patch).length === 0) continue;
      patch.updatedAt = now;
      report.libraryDocuments.patched++;
      if (!dry) {
        await ctx.db.patch(d._id, patch as Partial<Doc<"libraryDocuments">>);
      }
      if (!dry) {
        for (const vrow of await ctx.db
          .query("libraryDocumentVersions")
          .withIndex("by_document_version", (q) => q.eq("documentId", d._id))
          .collect()) {
          if (vrow.uploadedByUserKey.trim() === userIdStr) continue;
          await ctx.db.patch(vrow._id, { uploadedByUserKey: userIdStr });
          report.libraryVersions.patched++;
        }
      }
    }

    for (const e of await ctx.db.query("signatureEnvelopes").collect()) {
      const patch: Record<string, unknown> = {};
      if (e.organizationId !== orgId) patch.organizationId = orgId;
      if (e.createdByUserKey.trim() !== userIdStr) {
        patch.createdByUserKey = userIdStr;
      }
      if (Object.keys(patch).length === 0) continue;
      patch.updatedAt = now;
      report.signatureEnvelopes.patched++;
      if (!dry) {
        await ctx.db.patch(e._id, patch as Partial<Doc<"signatureEnvelopes">>);
      }
    }

    for (const m of await ctx.db.query("fileMessages").collect()) {
      if (m.organizationId === orgId) continue;
      report.fileMessages.patched++;
      if (!dry) {
        await ctx.db.patch(m._id, {
          organizationId: orgId,
          updatedAt: now,
        });
      }
    }

    for (const s of await ctx.db.query("savedFilterPresets").collect()) {
      if (s.organizationId === orgId || s.organizationId == null) continue;
      report.savedFilterPresets.patched++;
      if (!dry) {
        await ctx.db.patch(s._id, {
          organizationId: orgId,
          updatedAt: now,
        });
      }
    }

    return { ok: true as const, ...report };
  },
});
