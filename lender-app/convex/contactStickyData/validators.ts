import { v } from "convex/values";

/** PFS line shapes — aligned with intake `incomeRow` / `assetRow` / `liabilityRow`. */
export const contactStickyIncomeRowV = v.object({
  borrower: v.optional(v.string()),
  source: v.optional(v.string()),
  description: v.optional(v.string()),
  monthlyAmount: v.optional(v.string()),
  notes: v.optional(v.string()),
});

export const contactStickyAssetRowV = v.object({
  description: v.optional(v.string()),
  estimatedValue: v.optional(v.string()),
  notes: v.optional(v.string()),
});

export const contactStickyLiabilityRowV = v.object({
  description: v.optional(v.string()),
  monthlyPayment: v.optional(v.string()),
  balance: v.optional(v.string()),
  notes: v.optional(v.string()),
});

/** Version log partition — sticky data domain. */
export const contactDataEntityTypeV = v.union(
  v.literal("reo"),
  v.literal("pfs"),
  v.literal("business"),
  v.literal("business_debt"),
  v.literal("business_ownership"),
  v.literal("document"),
);

/** Library link categorization for contact-scoped documents (Phase 37.1.B). */
export const libraryDocumentCategoryV = v.union(
  v.literal("id"),
  v.literal("dd214"),
  v.literal("tax_return"),
  v.literal("deal_specific"),
  v.literal("client_submitted"),
  v.literal("other"),
);

export const contactReoPropertyFieldsV = {
  propertyAddress: v.optional(v.string()),
  propertyType: v.optional(v.string()),
  usage: v.optional(v.string()),
  state: v.optional(v.string()),
  purchasedDate: v.optional(v.string()),
  marketValue: v.optional(v.string()),
  mortgageBalance: v.optional(v.string()),
  monthlyPayment: v.optional(v.string()),
  rate: v.optional(v.string()),
  position: v.optional(v.string()),
  taxes: v.optional(v.string()),
  insurance: v.optional(v.string()),
  hoa: v.optional(v.string()),
  escrow: v.optional(v.string()),
  grossRent: v.optional(v.string()),
  netRent: v.optional(v.string()),
  apn: v.optional(v.string()),
  invested: v.optional(v.string()),
  latLong: v.optional(v.string()),
};

export const contactBusinessEntityFieldsV = {
  entityName: v.string(),
  dba: v.optional(v.string()),
  ein: v.optional(v.string()),
  entityType: v.optional(v.string()),
  state: v.optional(v.string()),
  formationDate: v.optional(v.string()),
};

export const contactBusinessDebtFieldsV = {
  creditor: v.optional(v.string()),
  balance: v.optional(v.string()),
  monthlyPayment: v.optional(v.string()),
  position: v.optional(v.string()),
};
