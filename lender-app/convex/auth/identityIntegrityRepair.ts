/**
 * Phase 15 Step 15 — platform-wide auth identity scan + automatic repair.
 */
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { pickCanonicalOrgMember } from "../orgMembership";
import {
  canonicalEmailKey,
  canonicalLoginKey,
  collectAuthUsersByCanonicalLogin,
  identityFieldsCanonical,
} from "./canonicalIdentity";
import { resolveShareTargetUserKey } from "../shareTargetResolve";
import { gmailMailboxKey } from "../../lib/auth/gmailCanonicalEmail";
import { normalizeAuthEmail } from "../../lib/auth/normalizeAuthEmail";
import { normalizeUsername } from "../../lib/auth/normalizeUsername";

type IntegrityIssue =
  | "duplicate_normalized_username"
  | "duplicate_email"
  | "duplicate_gmail_mailbox"
  | "non_canonical_identity_fields"
  | "orphan_org_member"
  | "duplicate_org_member"
  | "orphan_resource_share"

export const scanAuthIdentityIntegrity = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);
    return scanIntegrity(ctx);
  },
});

export const repairAuthIdentityPlatform = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { adminSecret, dryRun }) => {
    assertDataMigrationAdmin(adminSecret);
    const dry = dryRun === true;
    const before = await scanIntegrity(ctx);
    const repairs = await runRepairs(ctx, dry);
    const after = dry ? before : await scanIntegrity(ctx);
    return {
      dryRun: dry,
      before,
      repairs,
      after,
      pass: after.issues.length === 0,
    };
  },
});

export async function scanIntegrity(ctx: QueryCtx | MutationCtx) {
  const all = await ctx.db.query("authUsers").collect();
  const issues: Array<{
    type: IntegrityIssue;
    detail: Record<string, unknown>;
  }> = [];

  const byUsername = new Map<string, Id<"authUsers">[]>();
  const byEmail = new Map<string, Id<"authUsers">[]>();
  const byMailbox = new Map<string, Id<"authUsers">[]>();

  for (const u of all) {
    const nu = canonicalLoginKey(u.normalizedUsername);
    if (nu) {
      const list = byUsername.get(nu) ?? [];
      list.push(u._id);
      byUsername.set(nu, list);
    }
    const em = canonicalEmailKey(u.email);
    if (em) {
      const list = byEmail.get(em) ?? [];
      list.push(u._id);
      byEmail.set(em, list);
      const mb = gmailMailboxKey(em);
      if (mb) {
        const mList = byMailbox.get(mb) ?? [];
        mList.push(u._id);
        byMailbox.set(mb, mList);
      }
    }
    if (!identityFieldsCanonical(u)) {
      issues.push({
        type: "non_canonical_identity_fields",
        detail: { userId: String(u._id) },
      });
    }
  }

  for (const [key, ids] of byUsername) {
    if (ids.length > 1) {
      issues.push({
        type: "duplicate_normalized_username",
        detail: { normalizedUsername: key, authUserIds: ids },
      });
    }
  }
  for (const [key, ids] of byEmail) {
    if (ids.length > 1) {
      issues.push({
        type: "duplicate_email",
        detail: { email: key, authUserIds: ids },
      });
    }
  }
  for (const [key, ids] of byMailbox) {
    const unique = [...new Set(ids.map(String))];
    if (unique.length > 1) {
      issues.push({
        type: "duplicate_gmail_mailbox",
        detail: { mailboxKey: key, authUserIds: unique },
      });
    }
  }

  const authIds = new Set(all.map((u) => String(u._id)));
  const members = await ctx.db.query("organizationMembers").collect();
  const memberGroups = new Map<string, Doc<"organizationMembers">[]>();
  for (const m of members) {
    if (!authIds.has(m.userKey.trim())) {
      issues.push({
        type: "orphan_org_member",
        detail: { memberId: m._id, userKey: m.userKey },
      });
    }
    const gk = `${m.organizationId}:${m.userKey.trim()}`;
    const g = memberGroups.get(gk) ?? [];
    g.push(m);
    memberGroups.set(gk, g);
  }
  for (const [gk, rows] of memberGroups) {
    if (rows.length > 1) {
      issues.push({
        type: "duplicate_org_member",
        detail: { groupKey: gk, memberIds: rows.map((r) => r._id) },
      });
    }
  }

  const shares = await ctx.db.query("resourceShares").collect();
  for (const s of shares) {
    if (!authIds.has(s.sharedUserId.trim())) {
      issues.push({
        type: "orphan_resource_share",
        detail: { shareId: s._id, sharedUserId: s.sharedUserId },
      });
    }
  }

  return {
    authUserCount: all.length,
    issueCount: issues.length,
    issues,
  };
}

export async function runRepairs(ctx: MutationCtx, dry: boolean) {
  const summary = {
    identityFieldsPatched: 0,
    orgMembersMerged: 0,
    orgMembersDeleted: 0,
    orphanMembersDeleted: 0,
    orphanSharesDeleted: 0,
    emailMergeGroups: 0,
  };
  const now = Date.now();
  const all = await ctx.db.query("authUsers").collect();
  const authIds = new Set(all.map((u) => String(u._id)));

  for (const u of all) {
    const patch: Record<string, unknown> = {};
    const nu = normalizeUsername(u.normalizedUsername);
    if (u.normalizedUsername !== nu) patch.normalizedUsername = nu;
    if (u.usernameNormalized !== nu) patch.usernameNormalized = nu;
    const display =
      u.displayUsername?.trim() && u.displayUsername.includes("@")
        ? normalizeAuthEmail(u.displayUsername) ?? nu
        : nu;
    if (u.displayUsername !== display) patch.displayUsername = display;
    const emailNorm = normalizeAuthEmail(u.email);
    if (emailNorm !== undefined && u.email !== emailNorm) patch.email = emailNorm;
    if (emailNorm && nu !== emailNorm && u.normalizedUsername === u.email) {
      patch.normalizedUsername = emailNorm;
      patch.usernameNormalized = emailNorm;
    }
    if (Object.keys(patch).length) {
      summary.identityFieldsPatched++;
      if (!dry) {
        patch.updatedAt = now;
        await ctx.db.patch(u._id, patch);
      }
    }
  }

  const byEmail = new Map<string, Doc<"authUsers">[]>();
  const refreshed = dry ? all : await ctx.db.query("authUsers").collect();
  for (const u of refreshed) {
    const em = canonicalEmailKey(u.email);
    if (!em) continue;
    const list = byEmail.get(em) ?? [];
    list.push(u);
    byEmail.set(em, list);
  }

  for (const [, group] of byEmail) {
    if (group.length < 2) continue;
    summary.emailMergeGroups++;
    const canonical = group.reduce((best, cur) =>
      cur.createdAt > best.createdAt ? cur : best,
    );
    const dupes = group.filter((u) => u._id !== canonical._id);
    if (dry) continue;
    for (const dupe of dupes) {
      await rekeyUserReferences(ctx, String(dupe._id), String(canonical._id));
      await ctx.db.delete(dupe._id);
    }
  }

  const members = await ctx.db.query("organizationMembers").collect();
  const groups = new Map<string, Doc<"organizationMembers">[]>();
  for (const m of members) {
    const gk = `${m.organizationId}:${m.userKey.trim()}`;
    const g = groups.get(gk) ?? [];
    g.push(m);
    groups.set(gk, g);
  }
  for (const [, rows] of groups) {
    if (rows.length < 2) continue;
    const keep = pickCanonicalOrgMember(rows)!;
    for (const row of rows) {
      if (row._id === keep._id) continue;
      summary.orgMembersMerged++;
      if (!dry) await ctx.db.delete(row._id);
    }
  }

  for (const m of members) {
    if (!authIds.has(m.userKey.trim())) {
      summary.orphanMembersDeleted++;
      if (!dry) await ctx.db.delete(m._id);
      continue;
    }
  }

  const shares = await ctx.db.query("resourceShares").collect();
  for (const s of shares) {
    if (!authIds.has(s.sharedUserId.trim())) {
      summary.orphanSharesDeleted++;
      if (!dry) await ctx.db.delete(s._id);
    }
  }

  return summary;
}

async function rekeyUserReferences(
  ctx: MutationCtx,
  oldKey: string,
  newKey: string,
) {
  if (oldKey === newKey) return;
  const members = await ctx.db.query("organizationMembers").collect();
  for (const m of members) {
    if (m.userKey.trim() !== oldKey) continue;
    const dup = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", m.organizationId).eq("userKey", newKey),
      )
      .collect();
    if (pickCanonicalOrgMember(dup)) {
      await ctx.db.delete(m._id);
    } else {
      await ctx.db.patch(m._id, { userKey: newKey });
    }
  }

  for (const s of await ctx.db.query("resourceShares").collect()) {
    if (s.sharedUserId.trim() === oldKey) {
      await ctx.db.patch(s._id, { sharedUserId: newKey });
    }
    if (s.createdByUserId.trim() === oldKey) {
      await ctx.db.patch(s._id, { createdByUserId: newKey });
    }
  }

  for (const table of ["pipeline", "tasks", "clients", "projects"] as const) {
    const rows = await ctx.db.query(table).collect();
    for (const row of rows) {
      const patch: Record<string, unknown> = {};
      if (
        "ownerUserId" in row &&
        typeof row.ownerUserId === "string" &&
        row.ownerUserId.trim() === oldKey
      ) {
        patch.ownerUserId = newKey;
      }
      if (
        "ownerUserKey" in row &&
        typeof row.ownerUserKey === "string" &&
        row.ownerUserKey.trim() === oldKey
      ) {
        patch.ownerUserKey = newKey;
      }
      if (Object.keys(patch).length) await ctx.db.patch(row._id, patch);
    }
  }
}

export async function auditEmailVariantsForOrg(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  email: string,
) {
  const variants = [
    email,
    email.toUpperCase(),
    `  ${email}  `,
    email.replace("@", "+tag@"),
  ];
  const rows: Array<{
    input: string;
    authUserId: string | null;
    resolvedUserKey: string | null;
    error: string | null;
  }> = [];
  for (const input of variants) {
    try {
      const matches = await collectAuthUsersByCanonicalLogin(ctx, input);
      const authUser = matches.length === 1 ? matches[0]! : null;
      const resolved = authUser
        ? await resolveShareTargetUserKey(ctx, organizationId, input)
        : null;
      rows.push({
        input,
        authUserId: authUser ? String(authUser._id) : null,
        resolvedUserKey: resolved,
        error:
          matches.length > 1 ? "CANONICAL_AUTH_IDENTITY_CONFLICT" : null,
      });
    } catch (e) {
      rows.push({
        input,
        authUserId: null,
        resolvedUserKey: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const authIds = new Set(rows.map((r) => r.authUserId).filter(Boolean));
  const resolvedKeys = new Set(
    rows.map((r) => r.resolvedUserKey).filter(Boolean),
  );
  return {
    pass:
      authIds.size <= 1 &&
      resolvedKeys.size <= 1 &&
      rows.every((r) => !r.error),
    variants: rows,
  };
}
