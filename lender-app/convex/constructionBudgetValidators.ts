import { v } from "convex/values";

export const constructionBudgetProjectTypeV = v.union(
  v.literal("Rehab"),
  v.literal("New Construction"),
  v.literal(""),
);

export const constructionBudgetRepairReplaceV = v.union(
  v.literal("Repair"),
  v.literal("Replace"),
  v.literal(""),
);

export const constructionBudgetUnitV = v.union(
  v.literal("square feet"),
  v.literal("linear feet"),
  v.literal("cubic yards"),
  v.literal("squares"),
  v.literal("tons"),
  v.literal("pounds"),
  v.literal("each"),
  v.literal("gallons"),
  v.literal(""),
);

export const constructionBudgetLegacyStatusV = v.union(
  v.literal("planned"),
  v.literal("in_progress"),
  v.literal("complete"),
  v.literal("on_hold"),
);

export const constructionBudgetHeaderV = v.object({
  applicantName: v.optional(v.string()),
  propertyAddress: v.optional(v.string()),
  contractor: v.optional(v.string()),
  projectType: v.optional(constructionBudgetProjectTypeV),
  plannedSummary: v.optional(v.string()),
  qualityOfFinishes: v.optional(v.string()),
  completionTimeframeMonths: v.optional(v.string()),
});
