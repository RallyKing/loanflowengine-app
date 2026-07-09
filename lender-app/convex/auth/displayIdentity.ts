import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canonicalDisplayUsername } from "../../lib/auth/canonicalDisplayUsername";
import { tryGetAuthUserByPermissionKey } from "./globalAdmin";

export { canonicalDisplayUsername };

export function canonicalDisplayUsernameFromAuthUser(
  user: Doc<"authUsers">,
): string {
  const raw =
    user.displayUsername?.trim() ||
    user.normalizedUsername?.trim() ||
    user.email?.trim() ||
    String(user._id);
  return canonicalDisplayUsername(raw) || String(user._id);
}

export async function resolveDisplayUsernameForUserKey(
  ctx: QueryCtx | MutationCtx,
  userKey: string | undefined | null,
): Promise<string> {
  const k = userKey?.trim() ?? "";
  if (!k) return "";
  if (k === "__system__") return "System";
  const auth = await tryGetAuthUserByPermissionKey(ctx, k);
  if (auth) return canonicalDisplayUsernameFromAuthUser(auth);
  if (k.includes("@")) return canonicalDisplayUsername(k);
  return k.length > 14 ? `${k.slice(0, 12)}…` : k;
}

export async function resolveDisplayUsernameMap(
  ctx: QueryCtx | MutationCtx,
  userKeys: Iterable<string>,
): Promise<Record<string, string>> {
  const unique = [...new Set([...userKeys].map((k) => k.trim()).filter(Boolean))];
  const out: Record<string, string> = {};
  for (const k of unique) {
    out[k] = await resolveDisplayUsernameForUserKey(ctx, k);
  }
  return out;
}
