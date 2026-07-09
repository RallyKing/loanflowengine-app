import { v } from "convex/values";
import type { RegistryRoleId } from "../lib/registry/universalRoles";

/**
 * Convex validator — must stay aligned with `lib/registry/universalRoles.ts`.
 */
export const registryRoleIdV = v.union(
  v.literal("primary_borrower"),
  v.literal("borrower"),
  v.literal("guarantor"),
  v.literal("coborrower"),
  v.literal("account_executive"),
  v.literal("lender_rep"),
  v.literal("authorized_signer"),
  v.literal("key_principal"),
  v.literal("referral_partner"),
  v.literal("deal_partner"),
  v.literal("client"),
  v.literal("other"),
);

export type { RegistryRoleId };

/** Optional registry role on junction rows (Phase Registry-1). */
export const optionalRegistryRoleIdV = v.optional(registryRoleIdV);
