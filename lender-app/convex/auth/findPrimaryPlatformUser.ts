import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  authUserIsPrimaryPlatformAdmin,
  primaryPlatformAdminUsernameKeys,
} from "./primaryPlatformAdmin";

function newestAuthUser<T extends Doc<"authUsers">>(rows: T[]): T {
  return rows.reduce((best, cur) =>
    cur.createdAt > best.createdAt ? cur : best,
  );
}

/** Resolve the elevated primary admin row by canonical username or legacy email aliases. */
export async function findPrimaryPlatformAuthUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"authUsers"> | null> {
  const seen = new Set<string>();
  const candidates: Doc<"authUsers">[] = [];
  const addRows = (rows: Doc<"authUsers">[]) => {
    for (const r of rows) {
      if (seen.has(r._id)) continue;
      seen.add(r._id);
      candidates.push(r);
    }
  };

  for (const key of primaryPlatformAdminUsernameKeys()) {
    addRows(
      await ctx.db
        .query("authUsers")
        .withIndex("by_normalizedUsername", (q) =>
          q.eq("normalizedUsername", key),
        )
        .collect(),
    );
    addRows(
      await ctx.db
        .query("authUsers")
        .withIndex("by_email", (q) => q.eq("email", key))
        .collect(),
    );
  }

  const aliasHits = candidates.filter((u) => authUserIsPrimaryPlatformAdmin(u));
  if (!aliasHits.length) return null;
  return aliasHits.length === 1 ? aliasHits[0]! : newestAuthUser(aliasHits);
}
