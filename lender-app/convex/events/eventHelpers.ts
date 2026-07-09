import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function appendEventShellActivity(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    organizationId: Id<"organizations">;
    kind: string;
    summary: string;
    actorUserKey: string;
  },
): Promise<void> {
  const now = Date.now();
  await ctx.db.insert("eventShellActivity", {
    eventId: args.eventId,
    organizationId: args.organizationId,
    kind: args.kind,
    summary: args.summary.slice(0, 500),
    actorUserKey: args.actorUserKey,
    at: now,
  });
  const rows = await ctx.db
    .query("eventShellActivity")
    .withIndex("by_event_at", (q) => q.eq("eventId", args.eventId))
    .order("desc")
    .collect();
  if (rows.length > 80) {
    for (const r of rows.slice(80)) {
      await ctx.db.delete(r._id);
    }
  }
}

export async function rebuildEventSearchText(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
): Promise<string> {
  const event = await ctx.db.get(eventId);
  if (!event) return "";
  const parts: string[] = [
    event.title,
    event.description ?? "",
    event.location ?? "",
    event.eventType ?? "",
    ...(event.tags ?? []),
  ];
  const sections = await ctx.db
    .query("eventSections")
    .withIndex("by_event_sort", (q) => q.eq("eventId", eventId))
    .collect();
  for (const s of sections) {
    if (!s.archivedAt) parts.push(s.title, s.customLabel);
  }
  const items = await ctx.db
    .query("eventSectionItems")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  for (const i of items) {
    if (!i.archivedAt) {
      parts.push(i.title, i.description ?? "");
    }
  }
  const collabs = await ctx.db
    .query("eventCollaborators")
    .withIndex("by_event_user", (q) => q.eq("eventId", eventId))
    .collect();
  for (const c of collabs) parts.push(c.userId);

  return parts.join(" ").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 8000);
}

export function calendarSortAtForEvent(event: Doc<"events">): number {
  return event.startsAt ?? event.updatedAt ?? event.createdAt;
}
