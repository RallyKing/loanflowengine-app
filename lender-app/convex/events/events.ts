/**
 * Phase 16.3 — Events CRUD, workspace bundles, ideas/invitations.
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { assertOrgMember } from "../organizationAccess";
import { ownerFieldsForInsert, resolveRowOwnerUserId } from "../resourceAccess";
import { resolveDisplayUsernameForUserKey } from "../auth/displayIdentity";
import { eventStatusV, eventIdeaStatusV, eventInvitationStatusV, eventSectionItemTypeV } from "./eventValidators";
import {
  assertCanMutateEventContent,
  assertCanReadEvent,
  assertIsEventOwner,
  getEventViewerPresentation,
} from "./eventPermissions";
import {
  appendEventShellActivity,
  rebuildEventSearchText,
  calendarSortAtForEvent,
} from "./eventHelpers";
import { filterRowsByEventDomainAcl } from "./eventAccess";
import {
  convertIdeaToEvent,
  convertInvitationToEvent,
  insertEventShell,
  DEFAULT_EVENT_SECTION_SEEDS,
} from "./eventFoundationImpl";
function eventListDto(
  event: Doc<"events">,
  ownerDisplayUsername: string,
  viewer: Awaited<ReturnType<typeof getEventViewerPresentation>>,
) {
  return {
    _id: event._id,
    title: event.title,
    description: event.description,
    eventType: event.eventType,
    location: event.location,
    status: event.status,
    timezone: event.timezone,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    pinnedAt: event.pinnedAt,
    listSortKey: event.listSortKey,
    calendarSortAt: event.calendarSortAt,
    sectionCount: event.sectionCount,
    itemCount: event.itemCount,
    ownerUserId: event.ownerUserId,
    ownerDisplayUsername,
    updatedAt: event.updatedAt,
    createdAt: event.createdAt,
    viewer,
  };
}

export const listWorkspace = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.string(),
    includeArchived: v.optional(v.boolean()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = args.memberUserKey.trim();
    await assertOrgMember(ctx, args.organizationId, key);

    const allEvents = await ctx.db
      .query("events")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();

    const visibleEvents = await filterRowsByEventDomainAcl(
      ctx,
      allEvents,
      key,
      "event",
    );

    const search = args.search?.trim().toLowerCase();
    const filteredEvents = visibleEvents.filter((e) => {
      if (!args.includeArchived && e.status === "archived") return false;
      if (!search) return true;
      return (e.searchText ?? e.title.toLowerCase()).includes(search);
    });

    const eventRows = [];
    for (const e of filteredEvents) {
      const ownerId = resolveRowOwnerUserId(e);
      const ownerDisplayUsername = ownerId
        ? await resolveDisplayUsernameForUserKey(ctx, ownerId)
        : "";
      const viewer = await getEventViewerPresentation(ctx, e, key);
      eventRows.push(eventListDto(e, ownerDisplayUsername, viewer));
    }

    const allIdeas = await ctx.db
      .query("eventIdeas")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();
    const visibleIdeas = await filterRowsByEventDomainAcl(
      ctx,
      allIdeas,
      key,
      "event_idea",
    );

    const allInvites = await ctx.db
      .query("eventInvitations")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();
    const visibleInvites = await filterRowsByEventDomainAcl(
      ctx,
      allInvites,
      key,
      "event_invitation",
    );

    return {
      events: eventRows,
      ideas: visibleIdeas
        .filter((r) => r.status !== "dismissed")
        .map((r) => ({
          _id: r._id,
          title: r.title,
          body: r.body,
          status: r.status,
          capturedAt: r.capturedAt,
          convertedToEventId: r.convertedToEventId,
          ownerUserId: r.ownerUserId,
          updatedAt: r.updatedAt,
          isOwner: resolveRowOwnerUserId(r) === key,
        })),
      invitations: visibleInvites
        .filter((r) => r.status !== "dismissed")
        .map((r) => ({
          _id: r._id,
          title: r.title,
          host: r.host,
          venue: r.venue,
          status: r.status,
          receivedAt: r.receivedAt,
          capturedAt: r.capturedAt,
          convertedToEventId: r.convertedToEventId,
          ownerUserId: r.ownerUserId,
          updatedAt: r.updatedAt,
          isOwner: resolveRowOwnerUserId(r) === key,
        })),
    };
  },
});

export const getDetailBundle = query({
  args: {
    eventId: v.id("events"),
    memberUserKey: v.string(),
  },
  handler: async (ctx, { eventId, memberUserKey }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    const key = memberUserKey.trim();
    const viewer = await assertCanReadEvent(ctx, event, key);
    const ownerId = resolveRowOwnerUserId(event);
    const ownerDisplayUsername = ownerId
      ? await resolveDisplayUsernameForUserKey(ctx, ownerId)
      : "";

    const sections = await ctx.db
      .query("eventSections")
      .withIndex("by_event_sort", (q) => q.eq("eventId", eventId))
      .collect();

    const items = await ctx.db
      .query("eventSectionItems")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    const links = await Promise.all(
      items.map(async (item) => {
        const rows = await ctx.db
          .query("eventItemLinks")
          .withIndex("by_item", (q) => q.eq("itemId", item._id))
          .collect();
        return [String(item._id), rows] as const;
      }),
    );

    const attachments = await Promise.all(
      items.map(async (item) => {
        const rows = await ctx.db
          .query("eventItemAttachments")
          .withIndex("by_item", (q) => q.eq("itemId", item._id))
          .collect();
        return [String(item._id), rows] as const;
      }),
    );

    const activity = await ctx.db
      .query("eventShellActivity")
      .withIndex("by_event_at", (q) => q.eq("eventId", eventId))
      .order("desc")
      .take(30);

    const collabRows = await ctx.db
      .query("eventCollaborators")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId))
      .collect();

    const collaborators = [];
    for (const c of collabRows) {
      collaborators.push({
        userId: c.userId,
        collaboratorRole: c.collaboratorRole,
        displayUsername: await resolveDisplayUsernameForUserKey(ctx, c.userId),
      });
    }

    return {
      event: {
        ...event,
        ownerDisplayUsername,
      },
      viewer,
      sections: sections.filter((s) => !s.archivedAt),
      archivedSections: sections.filter((s) => s.archivedAt),
      items: items.filter((i) => !i.archivedAt),
      archivedItems: items.filter((i) => i.archivedAt),
      linksByItemId: Object.fromEntries(links),
      attachmentsByItemId: Object.fromEntries(attachments),
      collaborators,
      activity,
    };
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.string(),
    title: v.string(),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = args.memberUserKey.trim();
    await assertOrgMember(ctx, args.organizationId, key);
    const eventId = await insertEventShell(ctx, {
      organizationId: args.organizationId,
      ownerUserKey: key,
      title: args.title,
      createdByUserKey: key,
      timezone: args.timezone,
    });
    const searchText = await rebuildEventSearchText(ctx, eventId);
    await ctx.db.patch(eventId, { searchText, updatedAt: Date.now() });
    return { eventId };
  },
});

export const patch = mutation({
  args: {
    eventId: v.id("events"),
    memberUserKey: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    eventType: v.optional(v.string()),
    location: v.optional(v.string()),
    status: v.optional(eventStatusV),
    timezone: v.optional(v.string()),
    startsAt: v.optional(v.union(v.number(), v.null())),
    endsAt: v.optional(v.union(v.number(), v.null())),
    allDay: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    pinnedAt: v.optional(v.union(v.number(), v.null())),
    listSortKey: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    await assertCanMutateEventContent(ctx, event, args.memberUserKey, "patch");

    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.eventType !== undefined) patch.eventType = args.eventType;
    if (args.location !== undefined) patch.location = args.location;
    if (args.status !== undefined) {
      patch.status = args.status;
      if (args.status === "archived") patch.archivedAt = now;
      if (args.status === "completed") patch.completedAt = now;
    }
    if (args.timezone !== undefined) patch.timezone = args.timezone;
    if (args.startsAt !== undefined) {
      patch.startsAt = args.startsAt === null ? undefined : args.startsAt;
    }
    if (args.endsAt !== undefined) {
      patch.endsAt = args.endsAt === null ? undefined : args.endsAt;
    }
    if (args.allDay !== undefined) patch.allDay = args.allDay;
    if (args.tags !== undefined) patch.tags = args.tags;
    if (args.pinnedAt !== undefined) {
      patch.pinnedAt = args.pinnedAt === null ? undefined : args.pinnedAt;
    }
    if (args.listSortKey !== undefined) patch.listSortKey = args.listSortKey;

    await ctx.db.patch(args.eventId, patch);
    const updated = await ctx.db.get(args.eventId);
    if (updated) {
      await ctx.db.patch(args.eventId, {
        calendarSortAt: calendarSortAtForEvent(updated),
        searchText: await rebuildEventSearchText(ctx, args.eventId),
      });
    }
    return { ok: true };
  },
});

export const archive = mutation({
  args: { eventId: v.id("events"), memberUserKey: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    await assertCanMutateEventContent(ctx, event, args.memberUserKey, "archive");
    const now = Date.now();
    await ctx.db.patch(args.eventId, {
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { eventId: v.id("events"), memberUserKey: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    await assertIsEventOwner(ctx, event, args.memberUserKey);

    const items = await ctx.db
      .query("eventSectionItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    for (const i of items) await ctx.db.delete(i._id);

    const sections = await ctx.db
      .query("eventSections")
      .withIndex("by_event_sort", (q) => q.eq("eventId", args.eventId))
      .collect();
    for (const s of sections) await ctx.db.delete(s._id);

    const collabs = await ctx.db
      .query("eventCollaborators")
      .withIndex("by_event_user", (q) => q.eq("eventId", args.eventId))
      .collect();
    for (const c of collabs) await ctx.db.delete(c._id);

    const shares = await ctx.db
      .query("resourceShares")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "event").eq("resourceId", String(args.eventId)),
      )
      .collect();
    for (const s of shares) await ctx.db.delete(s._id);

    const pending = await ctx.db
      .query("eventSharePendingInvites")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    for (const p of pending) await ctx.db.delete(p._id);

    const activity = await ctx.db
      .query("eventShellActivity")
      .withIndex("by_event_at", (q) => q.eq("eventId", args.eventId))
      .collect();
    for (const a of activity) await ctx.db.delete(a._id);

    await ctx.db.delete(args.eventId);
    return { ok: true };
  },
});

export const duplicate = mutation({
  args: { eventId: v.id("events"), memberUserKey: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    const pres = await assertCanReadEvent(ctx, event, args.memberUserKey);
    if (!pres.canEditContent && !pres.isOwner) {
      throw new Error("You cannot duplicate this event.");
    }

    const key = args.memberUserKey.trim();
    const now = Date.now();
    const owner = ownerFieldsForInsert(key);
    const newId = await ctx.db.insert("events", {
      organizationId: event.organizationId,
      ...owner,
      title: `${event.title} (copy)`,
      description: event.description,
      eventType: event.eventType,
      location: event.location,
      status: "draft",
      timezone: event.timezone,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
      listSortKey: now,
      calendarSortAt: calendarSortAtForEvent(event),
      clonedFromEventId: event._id,
      sectionCount: event.sectionCount,
      itemCount: 0,
      createdByUserKey: key,
      createdAt: now,
      updatedAt: now,
    });

    const sections = await ctx.db
      .query("eventSections")
      .withIndex("by_event_sort", (q) => q.eq("eventId", args.eventId))
      .collect();

    const sectionIdMap = new Map<string, Id<"eventSections">>();
    let itemCount = 0;
    for (const s of sections.filter((x) => !x.archivedAt)) {
      const newSectionId = await ctx.db.insert("eventSections", {
        eventId: newId,
        organizationId: event.organizationId,
        sectionKey: s.sectionKey,
        title: s.title,
        iconKey: s.iconKey,
        sortOrder: s.sortOrder,
        collapsedByDefault: s.collapsedByDefault,
        customLabel: s.customLabel,
        createdAt: now,
        updatedAt: now,
      });
      sectionIdMap.set(String(s._id), newSectionId);
    }

    const items = await ctx.db
      .query("eventSectionItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    for (const item of items.filter((i) => !i.archivedAt)) {
      const sectionId = sectionIdMap.get(String(item.sectionId));
      if (!sectionId) continue;
      await ctx.db.insert("eventSectionItems", {
        eventId: newId,
        sectionId,
        organizationId: event.organizationId,
        itemType: item.itemType,
        title: item.title,
        description: item.description,
        sortOrder: item.sortOrder,
        parentItemId: item.parentItemId
          ? undefined
          : undefined,
        isChecked: item.isChecked,
        priority: item.priority,
        statusKey: item.statusKey,
        dueAt: item.dueAt,
        reminderAt: item.reminderAt,
        assigneeUserKey: item.assigneeUserKey,
        printVisible: item.printVisible,
        createdByUserKey: key,
        createdAt: now,
        updatedAt: now,
      });
      itemCount += 1;
    }

    await ctx.db.patch(newId, {
      itemCount,
      searchText: await rebuildEventSearchText(ctx, newId),
    });

    return { eventId: newId };
  },
});

export const createIdea = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = args.memberUserKey.trim();
    await assertOrgMember(ctx, args.organizationId, key);
    const now = Date.now();
    const owner = ownerFieldsForInsert(key);
    const id = await ctx.db.insert("eventIdeas", {
      organizationId: args.organizationId,
      ...owner,
      title: args.title.trim(),
      body: args.body?.trim(),
      status: "open",
      capturedAt: now,
      createdByUserKey: key,
      createdAt: now,
      updatedAt: now,
    });
    return { ideaId: id };
  },
});

export const patchIdea = mutation({
  args: {
    ideaId: v.id("eventIdeas"),
    memberUserKey: v.string(),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    status: v.optional(eventIdeaStatusV),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.ideaId);
    if (!row) throw new Error("Idea not found.");
    if (args.status === "converted") {
      throw new Error("Use convertIdea instead.");
    }
    const owner = resolveRowOwnerUserId(row);
    if (owner !== args.memberUserKey.trim()) {
      throw new Error("Only the owner can edit this idea.");
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.body !== undefined) patch.body = args.body;
    if (args.status !== undefined) patch.status = args.status;
    await ctx.db.patch(args.ideaId, patch);
    return { ok: true };
  },
});

export const convertIdea = mutation({
  args: {
    ideaId: v.id("eventIdeas"),
    memberUserKey: v.string(),
    keepOriginal: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const idea = await ctx.db.get(args.ideaId);
    if (!idea) throw new Error("Idea not found.");
    const owner = resolveRowOwnerUserId(idea);
    if (owner !== args.memberUserKey.trim()) {
      throw new Error("Only the owner can convert this idea.");
    }
    const eventId = await convertIdeaToEvent(ctx, {
      ideaId: args.ideaId,
      actorUserKey: args.memberUserKey.trim(),
    });
    const searchText = await rebuildEventSearchText(ctx, eventId);
    await ctx.db.patch(eventId, { searchText, updatedAt: Date.now() });
    if (args.keepOriginal === false) {
      await ctx.db.delete(args.ideaId);
    }
    return { eventId };
  },
});

export const createInvitation = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.string(),
    title: v.string(),
    host: v.optional(v.string()),
    venue: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = args.memberUserKey.trim();
    await assertOrgMember(ctx, args.organizationId, key);
    const now = Date.now();
    const owner = ownerFieldsForInsert(key);
    const id = await ctx.db.insert("eventInvitations", {
      organizationId: args.organizationId,
      ...owner,
      title: args.title.trim(),
      host: args.host?.trim(),
      venue: args.venue?.trim(),
      status: "open",
      capturedAt: now,
      receivedAt: now,
      createdByUserKey: key,
      createdAt: now,
      updatedAt: now,
    });
    return { invitationId: id };
  },
});

export const convertInvitation = mutation({
  args: {
    invitationId: v.id("eventInvitations"),
    memberUserKey: v.string(),
    keepOriginal: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const inv = await ctx.db.get(args.invitationId);
    if (!inv) throw new Error("Invitation not found.");
    const owner = resolveRowOwnerUserId(inv);
    if (owner !== args.memberUserKey.trim()) {
      throw new Error("Only the owner can convert this invitation.");
    }
    const eventId = await convertInvitationToEvent(ctx, {
      invitationId: args.invitationId,
      actorUserKey: args.memberUserKey.trim(),
    });
    const searchText = await rebuildEventSearchText(ctx, eventId);
    await ctx.db.patch(eventId, { searchText, updatedAt: Date.now() });
    if (args.keepOriginal === false) {
      await ctx.db.delete(args.invitationId);
    }
    return { eventId };
  },
});

export const upsertSection = mutation({
  args: {
    eventId: v.id("events"),
    memberUserKey: v.string(),
    sectionId: v.optional(v.id("eventSections")),
    sectionKey: v.optional(v.string()),
    title: v.string(),
    iconKey: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    collapsedByDefault: v.optional(v.boolean()),
    customLabel: v.optional(v.string()),
    archive: v.optional(v.boolean()),
    restore: v.optional(v.boolean()),
    duplicateFromSectionId: v.optional(v.id("eventSections")),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    await assertCanMutateEventContent(ctx, event, args.memberUserKey, "section");

    const now = Date.now();
    if (args.duplicateFromSectionId) {
      const src = await ctx.db.get(args.duplicateFromSectionId);
      if (!src || src.eventId !== args.eventId) {
        throw new Error("Section not found.");
      }
      const newSectionId = await ctx.db.insert("eventSections", {
        eventId: args.eventId,
        organizationId: event.organizationId,
        sectionKey: `${src.sectionKey}_copy_${now}`,
        title: `${src.title} (copy)`,
        iconKey: src.iconKey,
        sortOrder: (src.sortOrder ?? 0) + 1,
        collapsedByDefault: src.collapsedByDefault,
        customLabel: src.customLabel,
        createdAt: now,
        updatedAt: now,
      });
      const srcItems = await ctx.db
        .query("eventSectionItems")
        .withIndex("by_section_sort", (q) => q.eq("sectionId", src._id))
        .collect();
      for (const item of srcItems) {
        await ctx.db.insert("eventSectionItems", {
          eventId: args.eventId,
          sectionId: newSectionId,
          organizationId: event.organizationId,
          itemType: item.itemType,
          title: item.title,
          description: item.description,
          sortOrder: item.sortOrder,
          printVisible: item.printVisible,
          createdByUserKey: args.memberUserKey.trim(),
          createdAt: now,
          updatedAt: now,
        });
      }
      await ctx.db.patch(args.eventId, {
        sectionCount: (await ctx.db
          .query("eventSections")
          .withIndex("by_event_sort", (q) => q.eq("eventId", args.eventId))
          .collect()).filter((s) => !s.archivedAt).length,
        searchText: await rebuildEventSearchText(ctx, args.eventId),
        updatedAt: now,
      });
      return { sectionId: newSectionId };
    }

    if (args.sectionId) {
      const patch: Record<string, unknown> = { updatedAt: now };
      if (args.title !== undefined) patch.title = args.title;
      if (args.iconKey !== undefined) patch.iconKey = args.iconKey;
      if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
      if (args.collapsedByDefault !== undefined) {
        patch.collapsedByDefault = args.collapsedByDefault;
      }
      if (args.customLabel !== undefined) patch.customLabel = args.customLabel;
      if (args.archive) patch.archivedAt = now;
      if (args.restore) patch.archivedAt = undefined;
      await ctx.db.patch(args.sectionId, patch);
      await ctx.db.patch(args.eventId, {
        searchText: await rebuildEventSearchText(ctx, args.eventId),
        updatedAt: now,
      });
      return { sectionId: args.sectionId };
    }

    const sectionId = await ctx.db.insert("eventSections", {
      eventId: args.eventId,
      organizationId: event.organizationId,
      sectionKey: args.sectionKey ?? `custom_${now}`,
      title: args.title.trim(),
      iconKey: args.iconKey ?? "layoutGrid",
      sortOrder: args.sortOrder ?? now,
      collapsedByDefault: args.collapsedByDefault ?? true,
      customLabel: args.customLabel ?? args.title.trim(),
      createdAt: now,
      updatedAt: now,
    });
    const sectionCount = (
      await ctx.db
        .query("eventSections")
        .withIndex("by_event_sort", (q) => q.eq("eventId", args.eventId))
        .collect()
    ).filter((s) => !s.archivedAt).length;
    await ctx.db.patch(args.eventId, {
      sectionCount,
      searchText: await rebuildEventSearchText(ctx, args.eventId),
      updatedAt: now,
    });
    return { sectionId };
  },
});

export const upsertItem = mutation({
  args: {
    eventId: v.id("events"),
    memberUserKey: v.string(),
    sectionId: v.id("eventSections"),
    itemId: v.optional(v.id("eventSectionItems")),
    itemType: v.optional(eventSectionItemTypeV),
    title: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    parentItemId: v.optional(v.id("eventSectionItems")),
    isChecked: v.optional(v.boolean()),
    priority: v.optional(v.number()),
    statusKey: v.optional(v.string()),
    dueAt: v.optional(v.union(v.number(), v.null())),
    reminderAt: v.optional(v.union(v.number(), v.null())),
    assigneeUserKey: v.optional(v.union(v.string(), v.null())),
    printVisible: v.optional(v.boolean()),
    linkUrl: v.optional(v.string()),
    linkLabel: v.optional(v.string()),
    archive: v.optional(v.boolean()),
    restore: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    await assertCanMutateEventContent(ctx, event, args.memberUserKey, "item");
    const now = Date.now();
    const key = args.memberUserKey.trim();

    if (args.itemId) {
      const patch: Record<string, unknown> = {
        title: args.title.trim(),
        updatedAt: now,
      };
      if (args.description !== undefined) patch.description = args.description;
      if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
      if (args.isChecked !== undefined) {
        patch.isChecked = args.isChecked;
        patch.checkedAt = args.isChecked ? now : undefined;
      }
      if (args.priority !== undefined) patch.priority = args.priority;
      if (args.statusKey !== undefined) patch.statusKey = args.statusKey;
      if (args.dueAt !== undefined) {
        patch.dueAt = args.dueAt === null ? undefined : args.dueAt;
      }
      if (args.reminderAt !== undefined) {
        patch.reminderAt =
          args.reminderAt === null ? undefined : args.reminderAt;
      }
      if (args.assigneeUserKey !== undefined) {
        patch.assigneeUserKey =
          args.assigneeUserKey === null ? undefined : args.assigneeUserKey;
      }
      if (args.printVisible !== undefined) patch.printVisible = args.printVisible;
      if (args.archive) patch.archivedAt = now;
      if (args.restore) patch.archivedAt = undefined;
      await ctx.db.patch(args.itemId, patch);

      if (args.linkUrl?.trim()) {
        const existing = await ctx.db
          .query("eventItemLinks")
          .withIndex("by_item", (q) => q.eq("itemId", args.itemId!))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, {
            url: args.linkUrl.trim(),
            label: args.linkLabel,
          });
        } else {
          await ctx.db.insert("eventItemLinks", {
            itemId: args.itemId!,
            eventId: args.eventId,
            organizationId: event.organizationId,
            url: args.linkUrl.trim(),
            label: args.linkLabel,
            createdByUserKey: key,
            createdAt: now,
          });
        }
      }
    } else {
      const itemId = await ctx.db.insert("eventSectionItems", {
        eventId: args.eventId,
        sectionId: args.sectionId,
        organizationId: event.organizationId,
        itemType: args.itemType ?? "checkbox",
        title: args.title.trim(),
        description: args.description,
        sortOrder: args.sortOrder ?? now,
        parentItemId: args.parentItemId,
        isChecked: args.isChecked ?? false,
        checkedAt: args.isChecked ? now : undefined,
        priority: args.priority,
        statusKey: args.statusKey,
        dueAt: args.dueAt ?? undefined,
        reminderAt: args.reminderAt ?? undefined,
        assigneeUserKey: args.assigneeUserKey ?? undefined,
        printVisible: args.printVisible ?? true,
        createdByUserKey: key,
        createdAt: now,
        updatedAt: now,
      });
      if (args.linkUrl?.trim()) {
        await ctx.db.insert("eventItemLinks", {
          itemId,
          eventId: args.eventId,
          organizationId: event.organizationId,
          url: args.linkUrl.trim(),
          label: args.linkLabel,
          createdByUserKey: key,
          createdAt: now,
        });
      }
      const itemCount = (
        await ctx.db
          .query("eventSectionItems")
          .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
          .collect()
      ).filter((i) => !i.archivedAt).length;
      await ctx.db.patch(args.eventId, {
        itemCount,
        searchText: await rebuildEventSearchText(ctx, args.eventId),
        updatedAt: now,
      });
      return { itemId };
    }

    const itemCount = (
      await ctx.db
        .query("eventSectionItems")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect()
    ).filter((i) => !i.archivedAt).length;
    await ctx.db.patch(args.eventId, {
      itemCount,
      searchText: await rebuildEventSearchText(ctx, args.eventId),
      updatedAt: now,
    });
    return { itemId: args.itemId };
  },
});

export const reorderSections = mutation({
  args: {
    eventId: v.id("events"),
    memberUserKey: v.string(),
    orderedSectionIds: v.array(v.id("eventSections")),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    await assertCanMutateEventContent(ctx, event, args.memberUserKey, "reorder");
    let order = 10;
    const now = Date.now();
    for (const id of args.orderedSectionIds) {
      await ctx.db.patch(id, { sortOrder: order, updatedAt: now });
      order += 10;
    }
    return { ok: true };
  },
});

export const reorderItems = mutation({
  args: {
    eventId: v.id("events"),
    memberUserKey: v.string(),
    sectionId: v.id("eventSections"),
    orderedItemIds: v.array(v.id("eventSectionItems")),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    await assertCanMutateEventContent(ctx, event, args.memberUserKey, "reorder");
    let order = 10;
    const now = Date.now();
    for (const id of args.orderedItemIds) {
      await ctx.db.patch(id, { sortOrder: order, updatedAt: now });
      order += 10;
    }
    return { ok: true };
  },
});

export const defaultSectionCatalog = query({
  args: {},
  handler: async () => DEFAULT_EVENT_SECTION_SEEDS,
});

async function deleteItemGraph(
  ctx: MutationCtx,
  itemId: Id<"eventSectionItems">,
): Promise<void> {
  const children = await ctx.db
    .query("eventSectionItems")
    .withIndex("by_parent", (q) => q.eq("parentItemId", itemId))
    .collect();
  for (const child of children) {
    await deleteItemGraph(ctx, child._id);
  }
  const links = await ctx.db
    .query("eventItemLinks")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .collect();
  for (const link of links) await ctx.db.delete(link._id);
  const attachments = await ctx.db
    .query("eventItemAttachments")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .collect();
  for (const att of attachments) await ctx.db.delete(att._id);
  await ctx.db.delete(itemId);
}

async function refreshEventCounts(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<void> {
  const sectionCount = (
    await ctx.db
      .query("eventSections")
      .withIndex("by_event_sort", (q) => q.eq("eventId", eventId))
      .collect()
  ).filter((s) => !s.archivedAt).length;
  const itemCount = (
    await ctx.db
      .query("eventSectionItems")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
  ).filter((i) => !i.archivedAt).length;
  await ctx.db.patch(eventId, {
    sectionCount,
    itemCount,
    searchText: await rebuildEventSearchText(ctx, eventId),
    updatedAt: Date.now(),
  });
}

export const deleteSection = mutation({
  args: {
    eventId: v.id("events"),
    sectionId: v.id("eventSections"),
    memberUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    await assertCanMutateEventContent(ctx, event, args.memberUserKey, "delete_section");
    const items = await ctx.db
      .query("eventSectionItems")
      .withIndex("by_section_sort", (q) => q.eq("sectionId", args.sectionId))
      .collect();
    for (const item of items) {
      await deleteItemGraph(ctx, item._id);
    }
    await ctx.db.delete(args.sectionId);
    await refreshEventCounts(ctx, args.eventId);
    return { ok: true };
  },
});

export const deleteItem = mutation({
  args: {
    eventId: v.id("events"),
    itemId: v.id("eventSectionItems"),
    memberUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    await assertCanMutateEventContent(ctx, event, args.memberUserKey, "delete_item");
    await deleteItemGraph(ctx, args.itemId);
    await refreshEventCounts(ctx, args.eventId);
    return { ok: true };
  },
});

export const deleteItemLink = mutation({
  args: {
    eventId: v.id("events"),
    linkId: v.id("eventItemLinks"),
    memberUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    await assertCanMutateEventContent(ctx, event, args.memberUserKey, "delete_link");
    const link = await ctx.db.get(args.linkId);
    if (!link) return { ok: true };
    await ctx.db.delete(args.linkId);
    return { ok: true };
  },
});

export const deleteItemAttachment = mutation({
  args: {
    eventId: v.id("events"),
    attachmentId: v.id("eventItemAttachments"),
    memberUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    await assertCanMutateEventContent(
      ctx,
      event,
      args.memberUserKey,
      "delete_attachment",
    );
    const row = await ctx.db.get(args.attachmentId);
    if (!row) return { ok: true };
    await ctx.db.delete(args.attachmentId);
    return { ok: true };
  },
});

export const deleteIdea = mutation({
  args: {
    ideaId: v.id("eventIdeas"),
    memberUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.ideaId);
    if (!row) throw new Error("Idea not found.");
    const owner = resolveRowOwnerUserId(row);
    if (owner !== args.memberUserKey.trim()) {
      throw new Error("Only the idea owner can delete this idea.");
    }
    await ctx.db.delete(args.ideaId);
    return { ok: true };
  },
});

export const deleteInvitation = mutation({
  args: {
    invitationId: v.id("eventInvitations"),
    memberUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.invitationId);
    if (!row) throw new Error("Invitation not found.");
    const owner = resolveRowOwnerUserId(row);
    if (owner !== args.memberUserKey.trim()) {
      throw new Error("Only the invitation owner can delete this invitation.");
    }
    await ctx.db.delete(args.invitationId);
    return { ok: true };
  },
});
