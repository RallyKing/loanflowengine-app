/**
 * Phase 16 Step 2 — internal foundation helpers (operator proof + future mutations).
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ownerFieldsForInsert } from "../resourceAccess";
import {
  filterRowsByEventDomainAcl,
  resolveEventDomainAccess,
  upsertEventDomainShare,
} from "./eventAccess";
import type { EventShareResourceType } from "./eventTypes";

export const DEFAULT_EVENT_SECTION_SEEDS = [
  { key: "overview", title: "Overview", iconKey: "layoutGrid", sortOrder: 10 },
  { key: "goals", title: "Goals", iconKey: "target", sortOrder: 20 },
  { key: "timeline", title: "Timeline", iconKey: "clock", sortOrder: 30 },
  { key: "tasks", title: "Tasks", iconKey: "checkSquare", sortOrder: 40 },
  { key: "guests", title: "Guests", iconKey: "users", sortOrder: 50 },
  { key: "vendors", title: "Vendors", iconKey: "briefcase", sortOrder: 60 },
  { key: "budget", title: "Budget", iconKey: "wallet", sortOrder: 70 },
  { key: "travel", title: "Travel", iconKey: "plane", sortOrder: 80 },
  { key: "packing", title: "Packing", iconKey: "package", sortOrder: 90 },
  { key: "documents", title: "Documents", iconKey: "fileText", sortOrder: 100 },
  { key: "communication", title: "Communication", iconKey: "mail", sortOrder: 110 },
  { key: "checklist", title: "Checklist", iconKey: "listChecks", sortOrder: 120 },
  { key: "custom", title: "Custom", iconKey: "plus", sortOrder: 130 },
] as const;

const DEFAULT_SECTION_SEEDS = DEFAULT_EVENT_SECTION_SEEDS;

export async function insertEventShell(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    ownerUserKey: string;
    title: string;
    createdByUserKey: string;
    templateId?: Id<"eventTemplates">;
    timezone?: string;
    skipDefaultSections?: boolean;
  },
): Promise<Id<"events">> {
  const now = Date.now();
  const owner = ownerFieldsForInsert(args.ownerUserKey);
  const eventId = await ctx.db.insert("events", {
    organizationId: args.organizationId,
    ...owner,
    title: args.title.trim(),
    status: "draft",
    timezone: args.timezone ?? "America/Chicago",
    allDay: false,
    listSortKey: now,
    calendarSortAt: now,
    templateId: args.templateId,
    sectionCount: args.skipDefaultSections ? 0 : DEFAULT_SECTION_SEEDS.length,
    itemCount: 0,
    createdAt: now,
    updatedAt: now,
    createdByUserKey: args.createdByUserKey,
  });

  if (args.skipDefaultSections) return eventId;

  for (const seed of DEFAULT_SECTION_SEEDS) {
    await ctx.db.insert("eventSections", {
      eventId,
      organizationId: args.organizationId,
      sectionKey: seed.key,
      title: seed.title,
      iconKey: seed.iconKey,
      sortOrder: seed.sortOrder,
      collapsedByDefault: true,
      customLabel: seed.title,
      createdAt: now,
      updatedAt: now,
    });
  }

  return eventId;
}

export async function insertEventIdea(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    ownerUserKey: string;
    title: string;
    body?: string;
    createdByUserKey: string;
  },
): Promise<Id<"eventIdeas">> {
  const now = Date.now();
  const owner = ownerFieldsForInsert(args.ownerUserKey);
  return await ctx.db.insert("eventIdeas", {
    organizationId: args.organizationId,
    ...owner,
    title: args.title.trim(),
    body: args.body?.trim(),
    status: "open",
    capturedAt: now,
    createdAt: now,
    updatedAt: now,
    createdByUserKey: args.createdByUserKey,
  });
}

export async function insertEventInvitation(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    ownerUserKey: string;
    title: string;
    host?: string;
    venue?: string;
    createdByUserKey: string;
  },
): Promise<Id<"eventInvitations">> {
  const now = Date.now();
  const owner = ownerFieldsForInsert(args.ownerUserKey);
  return await ctx.db.insert("eventInvitations", {
    organizationId: args.organizationId,
    ...owner,
    title: args.title.trim(),
    status: "open",
    host: args.host?.trim(),
    venue: args.venue?.trim(),
    receivedAt: now,
    capturedAt: now,
    createdAt: now,
    updatedAt: now,
    createdByUserKey: args.createdByUserKey,
  });
}

export async function insertEventTemplate(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    ownerUserKey: string;
    title: string;
    createdByUserKey: string;
  },
): Promise<Id<"eventTemplates">> {
  const now = Date.now();
  const owner = ownerFieldsForInsert(args.ownerUserKey);
  const templateId = await ctx.db.insert("eventTemplates", {
    organizationId: args.organizationId,
    ...owner,
    title: args.title.trim(),
    version: 1,
    isPublished: true,
    createdAt: now,
    updatedAt: now,
    createdByUserKey: args.createdByUserKey,
  });

  for (const seed of DEFAULT_SECTION_SEEDS) {
    const sectionId = await ctx.db.insert("eventTemplateSections", {
      templateId,
      organizationId: args.organizationId,
      sectionKey: seed.key,
      title: seed.title,
      iconKey: seed.iconKey,
      sortOrder: seed.sortOrder,
      collapsedByDefault: true,
      customLabel: seed.title,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("eventTemplateItems", {
      templateId,
      templateSectionId: sectionId,
      organizationId: args.organizationId,
      itemType: "checkbox",
      title: `${seed.title} starter item`,
      sortOrder: 10,
      printVisible: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  return templateId;
}

export async function cloneTemplateToEvent(
  ctx: MutationCtx,
  args: {
    templateId: Id<"eventTemplates">;
    organizationId: Id<"organizations">;
    ownerUserKey: string;
    createdByUserKey: string;
  },
): Promise<Id<"events">> {
  const template = await ctx.db.get(args.templateId);
  if (!template) throw new Error("Template not found.");
  const eventId = await insertEventShell(ctx, {
    organizationId: args.organizationId,
    ownerUserKey: args.ownerUserKey,
    title: `${template.title} (copy)`,
    createdByUserKey: args.createdByUserKey,
    templateId: args.templateId,
    timezone: "America/Chicago",
    skipDefaultSections: true,
  });

  const templateSections = await ctx.db
    .query("eventTemplateSections")
    .withIndex("by_template_sort", (q) => q.eq("templateId", args.templateId))
    .collect();

  const now = Date.now();
  let itemCount = 0;
  for (const ts of templateSections) {
    const sectionId = await ctx.db.insert("eventSections", {
      eventId,
      organizationId: args.organizationId,
      sectionKey: ts.sectionKey,
      title: ts.title,
      iconKey: ts.iconKey,
      sortOrder: ts.sortOrder,
      collapsedByDefault: ts.collapsedByDefault,
      customLabel: ts.customLabel,
      sourceTemplateSectionId: ts._id,
      createdAt: now,
      updatedAt: now,
    });

    const templateItems = await ctx.db
      .query("eventTemplateItems")
      .withIndex("by_template_section_sort", (q) =>
        q.eq("templateSectionId", ts._id),
      )
      .collect();

    for (const ti of templateItems) {
      await ctx.db.insert("eventSectionItems", {
        eventId,
        sectionId,
        organizationId: args.organizationId,
        itemType: ti.itemType,
        title: ti.title,
        description: ti.description,
        sortOrder: ti.sortOrder,
        priority: ti.priority,
        statusKey: ti.statusKey,
        printVisible: ti.printVisible,
        sourceLineage: {
          kind: "event_template",
          sourceId: String(args.templateId),
          sourceItemId: String(ti._id),
          templateId: args.templateId,
          templateVersion: template.version,
        },
        createdAt: now,
        updatedAt: now,
        createdByUserKey: args.createdByUserKey,
      });
      itemCount += 1;
    }
  }

  await ctx.db.patch(eventId, {
    sectionCount: templateSections.length,
    itemCount,
    updatedAt: now,
  });

  return eventId;
}

export async function convertIdeaToEvent(
  ctx: MutationCtx,
  args: {
    ideaId: Id<"eventIdeas">;
    actorUserKey: string;
  },
): Promise<Id<"events">> {
  const idea = await ctx.db.get(args.ideaId);
  if (!idea) throw new Error("Idea not found.");
  if (idea.status === "converted") {
    throw new Error("Idea already converted.");
  }

  const eventId = await insertEventShell(ctx, {
    organizationId: idea.organizationId,
    ownerUserKey: idea.ownerUserId,
    title: idea.title,
    createdByUserKey: args.actorUserKey,
  });

  const now = Date.now();
  if (idea.body?.trim()) {
    const notesSection = await ctx.db
      .query("eventSections")
      .withIndex("by_event_key", (q) =>
        q.eq("eventId", eventId).eq("sectionKey", "notes"),
      )
      .first();
    const sectionId =
      notesSection?._id ??
      (await ctx.db.insert("eventSections", {
        eventId,
        organizationId: idea.organizationId,
        sectionKey: "notes",
        title: "Notes & capture",
        iconKey: "stickyNote",
        sortOrder: 999,
        collapsedByDefault: true,
        customLabel: "Notes & capture",
        createdAt: now,
        updatedAt: now,
      }));

    await ctx.db.insert("eventSectionItems", {
      eventId,
      sectionId,
      organizationId: idea.organizationId,
      itemType: "note",
      title: "Idea notes",
      description: idea.body.trim(),
      sortOrder: 10,
      printVisible: true,
      sourceLineage: {
        kind: "event_idea",
        sourceId: String(idea._id),
      },
      createdAt: now,
      updatedAt: now,
      createdByUserKey: args.actorUserKey,
    });
  }

  await ctx.db.insert("eventConversionHistory", {
    organizationId: idea.organizationId,
    sourceType: "event_idea",
    sourceId: String(idea._id),
    targetEventId: eventId,
    convertedByUserKey: args.actorUserKey,
    convertedAt: now,
    snapshot: { title: idea.title },
  });

  await ctx.db.patch(idea._id, {
    status: "converted",
    convertedToEventId: eventId,
    convertedAt: now,
    updatedAt: now,
  });

  return eventId;
}

export async function convertInvitationToEvent(
  ctx: MutationCtx,
  args: {
    invitationId: Id<"eventInvitations">;
    actorUserKey: string;
  },
): Promise<Id<"events">> {
  const inv = await ctx.db.get(args.invitationId);
  if (!inv) throw new Error("Invitation not found.");
  if (inv.status === "converted") {
    throw new Error("Invitation already converted.");
  }

  const eventId = await insertEventShell(ctx, {
    organizationId: inv.organizationId,
    ownerUserKey: inv.ownerUserId,
    title: inv.title,
    createdByUserKey: args.actorUserKey,
  });

  const now = Date.now();
  await ctx.db.insert("eventConversionHistory", {
    organizationId: inv.organizationId,
    sourceType: "event_invitation",
    sourceId: String(inv._id),
    targetEventId: eventId,
    convertedByUserKey: args.actorUserKey,
    convertedAt: now,
    snapshot: {
      title: inv.title,
      host: inv.host,
      venue: inv.venue,
    },
  });

  await ctx.db.patch(inv._id, {
    status: "converted",
    convertedToEventId: eventId,
    convertedAt: now,
    updatedAt: now,
  });

  return eventId;
}

export async function insertSampleItem(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    sectionId: Id<"eventSections">;
    organizationId: Id<"organizations">;
    createdByUserKey: string;
  },
): Promise<Id<"eventSectionItems">> {
  const now = Date.now();
  const itemId = await ctx.db.insert("eventSectionItems", {
    eventId: args.eventId,
    sectionId: args.sectionId,
    organizationId: args.organizationId,
    itemType: "checkbox",
    title: "Proof checklist item",
    sortOrder: 10,
    isChecked: false,
    printVisible: true,
    createdAt: now,
    updatedAt: now,
    createdByUserKey: args.createdByUserKey,
  });
  const itemCount = await countItems(ctx, args.eventId);
  await ctx.db.patch(args.eventId, { itemCount, updatedAt: now });
  return itemId;
}

async function countItems(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<number> {
  const rows = await ctx.db
    .query("eventSectionItems")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  return rows.filter((r) => !r.archivedAt).length;
}

export async function listVisibleEventsForMember(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
): Promise<Doc<"events">[]> {
  const orgEvents = await ctx.db
    .query("events")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  return filterRowsByEventDomainAcl(ctx, orgEvents, memberUserKey, "event");
}

export async function canReadEventResource(
  ctx: MutationCtx,
  args: {
    resourceType: EventShareResourceType;
    row: {
      _id: string;
      organizationId: Id<"organizations">;
      ownerUserId: string;
      ownerUserKey: string;
    };
    memberUserKey: string;
  },
): Promise<boolean> {
  const access = await resolveEventDomainAccess(ctx, {
    resourceType: args.resourceType,
    resourceId: String(args.row._id),
    organizationId: args.row.organizationId,
    ownerUserId: args.row.ownerUserId,
    ownerUserKey: args.row.ownerUserKey,
    memberUserKey: args.memberUserKey,
  });
  return access.level !== "none";
}

export { upsertEventDomainShare, resolveEventDomainAccess, filterRowsByEventDomainAcl };
