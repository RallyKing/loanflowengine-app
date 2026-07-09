/**
 * Canonical auth identity resolution — single source for NFKC login/email lookup
 * and duplicate detection across signup, login, reset, team invite, operator tools.
 */
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { normalizeAuthEmail } from "../../lib/auth/normalizeAuthEmail";
import {
  gmailLookupVariants,
  gmailMailboxKey,
} from "../../lib/auth/gmailCanonicalEmail";
import { normalizeUsername } from "../../lib/auth/normalizeUsername";

export { normalizeAuthEmail, normalizeUsername };

export function canonicalLoginKey(raw: string): string {
  return normalizeUsername(raw);
}

export function canonicalEmailKey(
  raw: string | undefined | null,
): string | undefined {
  return normalizeAuthEmail(raw);
}

/** All NFKC-lowercase alias keys for one login identifier. */
export function canonicalAliasKeys(raw: string): string[] {
  const keys = new Set<string>();
  const login = canonicalLoginKey(raw);
  if (login) keys.add(login);
  const email = canonicalEmailKey(raw);
  if (email) {
    keys.add(email);
    for (const v of gmailLookupVariants(email)) keys.add(v);
  }
  return [...keys];
}

export class CanonicalAuthIdentityConflictError extends Error {
  readonly code = "CANONICAL_AUTH_IDENTITY_CONFLICT" as const;
  readonly matchedUserIds: string[];

  constructor(matchedUserIds: string[], raw: string) {
    super(
      `Multiple auth accounts match "${raw}" (${matchedUserIds.join(", ")}). Run identity integrity repair to merge duplicates.`,
    );
    this.name = "CanonicalAuthIdentityConflictError";
    this.matchedUserIds = matchedUserIds;
  }
}

function looksLikeOpaqueUserKey(raw: string): boolean {
  const t = raw.trim();
  if (!t || t.includes("@")) return false;
  return /^[a-z0-9]{16,}$/i.test(t);
}

function newestAuthUser<T extends Doc<"authUsers">>(rows: T[]): T {
  return rows.reduce((best, cur) =>
    cur.createdAt > best.createdAt ? cur : best,
  );
}

/** Resolve auth user by canonical username, email, or legacy usernameNormalized index. */
export async function collectAuthUsersByCanonicalLogin(
  ctx: QueryCtx,
  raw: string,
): Promise<Doc<"authUsers">[]> {
  const seen = new Set<string>();
  const out: Doc<"authUsers">[] = [];
  const add = (rows: Doc<"authUsers">[]) => {
    for (const r of rows) {
      const id = r._id as string;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(r);
    }
  };

  for (const key of canonicalAliasKeys(raw)) {
    add(
      await ctx.db
        .query("authUsers")
        .withIndex("by_normalizedUsername", (q) =>
          q.eq("normalizedUsername", key),
        )
        .collect(),
    );
    add(
      await ctx.db
        .query("authUsers")
        .withIndex("by_usernameNormalized", (q) =>
          q.eq("usernameNormalized", key),
        )
        .collect(),
    );
    if (key.includes("@")) {
      add(
        await ctx.db
          .query("authUsers")
          .withIndex("by_email", (q) => q.eq("email", key))
          .collect(),
      );
    }
  }

  return out;
}

/**
 * Platform share/login resolution — fails closed on duplicate canonical identities.
 */
export async function findAuthUserByCanonicalLogin(
  ctx: QueryCtx,
  raw: string,
  options?: { allowDuplicatePickNewest?: boolean },
): Promise<Doc<"authUsers"> | null> {
  const rows = await collectAuthUsersByCanonicalLogin(ctx, raw);
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0]!;

  const ids = [...new Set(rows.map((r) => String(r._id)))];
  const emailKeys = rows
    .map((r) => canonicalEmailKey(r.email))
    .filter((e): e is string => Boolean(e));
  const mailboxKeys = rows
    .map((r) => gmailMailboxKey(r.email))
    .filter((m): m is string => Boolean(m));
  const duplicateIdentity =
    (emailKeys.length > 0 && new Set(emailKeys).size === 1) ||
    (mailboxKeys.length > 0 && new Set(mailboxKeys).size === 1);

  if (!duplicateIdentity) {
    throw new CanonicalAuthIdentityConflictError(ids, raw);
  }

  if (!options?.allowDuplicatePickNewest) {
    throw new CanonicalAuthIdentityConflictError(ids, raw);
  }

  return newestAuthUser(rows);
}

/** Share targets must never silently pick the wrong duplicate account. */
export async function findAuthUserForShareResolution(
  ctx: QueryCtx,
  raw: string,
): Promise<Doc<"authUsers"> | null> {
  if (looksLikeOpaqueUserKey(raw)) {
    const direct = await ctx.db.get(raw as Doc<"authUsers">["_id"]);
    return direct ?? null;
  }
  return findAuthUserByCanonicalLogin(ctx, raw);
}

async function findByNormalizedUsername(
  ctx: QueryCtx,
  key: string,
): Promise<Doc<"authUsers"> | null> {
  return ctx.db
    .query("authUsers")
    .withIndex("by_normalizedUsername", (q) => q.eq("normalizedUsername", key))
    .first();
}

async function findByEmail(
  ctx: QueryCtx,
  key: string,
): Promise<Doc<"authUsers"> | null> {
  return ctx.db
    .query("authUsers")
    .withIndex("by_email", (q) => q.eq("email", key))
    .first();
}

/**
 * Reject when any canonical alias (username/email/cross) is already taken.
 */
export async function assertCanonicalAuthAvailable(
  ctx: QueryCtx,
  args: { loginIdentifier: string; email?: string | null },
): Promise<void> {
  const loginCanon = canonicalLoginKey(args.loginIdentifier);
  if (!loginCanon) throw new Error("Invalid username.");

  const keys = new Set<string>(canonicalAliasKeys(args.loginIdentifier));
  const explicitEmail = canonicalEmailKey(args.email);
  if (explicitEmail) {
    for (const k of canonicalAliasKeys(explicitEmail)) keys.add(k);
  }

  for (const key of keys) {
    const byUser = await findByNormalizedUsername(ctx, key);
    if (byUser) throw new Error("USERNAME_TAKEN");
    const byEmail = await findByEmail(ctx, key);
    if (byEmail) throw new Error("EMAIL_TAKEN");
  }
}

export function identityFieldsCanonical(u: Doc<"authUsers">): boolean {
  const nu = canonicalLoginKey(u.normalizedUsername);
  const un = u.usernameNormalized
    ? canonicalLoginKey(u.usernameNormalized)
    : nu;
  const emailOk =
    u.email == null || u.email === undefined
      ? true
      : u.email === canonicalEmailKey(u.email);
  return u.normalizedUsername === nu && un === nu && emailOk;
}
