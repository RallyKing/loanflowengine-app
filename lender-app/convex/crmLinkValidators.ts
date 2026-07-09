import { v } from "convex/values";

/**
 * @deprecated Phase Registry-1 — prefer `registryRoleId` on junction rows and
 * `REGISTRY_ROLE_IDS` from `lib/registry/universalRoles.ts`. Kept for unmigrated
 * rows and backward-compatible Convex validators.
 */
export const entityContactRelationshipRoleV = v.union(
  v.literal("client"),
  v.literal("deal_partner"),
  v.literal("referral_partner"),
  v.literal("lender_rep"),
  v.literal("lender"),
  v.literal("borrower"),
  v.literal("guarantor"),
  v.literal("other"),
);

export type EntityContactRelationshipRole =
  | "client"
  | "deal_partner"
  | "referral_partner"
  | "lender_rep"
  | "lender"
  | "borrower"
  | "guarantor"
  | "other";
