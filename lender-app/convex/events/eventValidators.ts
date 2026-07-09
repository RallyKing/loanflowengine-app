/**
 * Phase 16 — shared Convex validators for the Events domain.
 */
import { v } from "convex/values";

/** Canonical collaborator roles — do not overload resourceShares permission alone. */
export const eventCollaboratorRoleV = v.union(
  v.literal("co_owner"),
  v.literal("editor"),
  v.literal("viewer"),
);

/** resourceShares.resourceType values for the Events domain. */
export const eventShareResourceTypeV = v.union(
  v.literal("event"),
  v.literal("event_idea"),
  v.literal("event_invitation"),
  v.literal("event_template"),
);

export const allResourceShareTypeV = v.union(
  v.literal("client"),
  v.literal("project"),
  v.literal("task"),
  v.literal("pipeline"),
  v.literal("event"),
  v.literal("event_idea"),
  v.literal("event_invitation"),
  v.literal("event_template"),
);

export const eventStatusV = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("completed"),
  v.literal("archived"),
);

export const eventIdeaStatusV = v.union(
  v.literal("open"),
  v.literal("converted"),
  v.literal("dismissed"),
);

export const eventInvitationStatusV = v.union(
  v.literal("open"),
  v.literal("converted"),
  v.literal("dismissed"),
);

export const eventSectionItemTypeV = v.union(
  v.literal("checkbox"),
  v.literal("note"),
  v.literal("date"),
  v.literal("priority"),
  v.literal("assignee"),
  v.literal("dependency"),
  v.literal("attachment"),
  v.literal("link"),
  v.literal("status"),
  v.literal("recurrence"),
);

export const eventConversionSourceTypeV = v.union(
  v.literal("event_idea"),
  v.literal("event_invitation"),
  v.literal("event_template"),
);

export const eventPrintKindV = v.union(
  v.literal("master_plan"),
  v.literal("execution_checklist"),
  v.literal("guest_sheet"),
  v.literal("budget_sheet"),
  v.literal("timeline_sheet"),
  v.literal("vendor_sheet"),
  v.literal("packing_checklist"),
  v.literal("custom"),
);

export const eventItemActivityKindV = v.union(
  v.literal("created"),
  v.literal("updated"),
  v.literal("completed"),
  v.literal("archived"),
  v.literal("restored"),
  v.literal("linked_task"),
  v.literal("unlinked_task"),
);

export const recurrenceRuleV = v.object({
  frequency: v.optional(
    v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("yearly"),
    ),
  ),
  interval: v.optional(v.number()),
  untilAt: v.optional(v.number()),
  count: v.optional(v.number()),
  byWeekDay: v.optional(v.array(v.number())),
});

export const sourceLineageV = v.object({
  kind: v.optional(v.string()),
  sourceId: v.optional(v.string()),
  sourceItemId: v.optional(v.string()),
  templateId: v.optional(v.id("eventTemplates")),
  templateVersion: v.optional(v.number()),
});

export const eventOwnerFieldsV = {
  ownerUserId: v.string(),
  ownerUserKey: v.string(),
};

/** Maps collaboratorRole → resourceShares.permission (canonical pairing). */
export function permissionForCollaboratorRole(
  role: "co_owner" | "editor" | "viewer",
): "view" | "edit" {
  return role === "viewer" ? "view" : "edit";
}
