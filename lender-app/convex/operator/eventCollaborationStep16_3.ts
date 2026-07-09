/**
 * Phase 16 Step 3 — event collaboration production proof.
 */
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  assertCanMutateEventContent,
  getEventViewerPresentation,
  presentationFromAccess,
} from "../events/eventPermissions";
import {
  convertIdeaToEvent,
  convertInvitationToEvent,
  insertEventIdea,
  insertEventInvitation,
  insertEventShell,
} from "../events/eventFoundationImpl";
import {
  removeEventDomainShare,
  resolveEventDomainAccess,
  upsertEventDomainShare,
} from "../events/eventAccess";
const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER = "ts7d3keadq48gay3pa8k6gdwx9878p33";
const PREFIX = "Phase16Step3 Collaboration";

type Step = { name: string; pass: boolean; detail?: Record<string, unknown> };

async function cleanup(ctx: MutationCtx) {
  const events = await ctx.db
    .query("events")
    .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
    .collect();
  for (const e of events) {
    if (!e.title.startsWith(PREFIX)) continue;
    const items = await ctx.db
      .query("eventSectionItems")
      .withIndex("by_event", (q) => q.eq("eventId", e._id))
      .collect();
    for (const i of items) await ctx.db.delete(i._id);
    const sections = await ctx.db
      .query("eventSections")
      .withIndex("by_event_sort", (q) => q.eq("eventId", e._id))
      .collect();
    for (const s of sections) await ctx.db.delete(s._id);
    const collabs = await ctx.db
      .query("eventCollaborators")
      .withIndex("by_event_user", (q) => q.eq("eventId", e._id))
      .collect();
    for (const c of collabs) await ctx.db.delete(c._id);
    const shares = await ctx.db
      .query("resourceShares")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "event").eq("resourceId", String(e._id)),
      )
      .collect();
    for (const s of shares) await ctx.db.delete(s._id);
    await ctx.db.delete(e._id);
  }
  for (const table of ["eventIdeas", "eventInvitations"] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
      .collect();
    for (const r of rows) {
      if (r.title.startsWith(PREFIX)) await ctx.db.delete(r._id);
    }
  }
}

export const runEventCollaborationProof = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);
    const steps: Step[] = [];
    await cleanup(ctx);

    const eventId = await insertEventShell(ctx, {
      organizationId: JOSHUA_ORG_ID,
      ownerUserKey: JOSHUA_USER,
      title: `${PREFIX} Event`,
      createdByUserKey: JOSHUA_USER,
    });
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("event missing");

    const ownerPres = await getEventViewerPresentation(ctx, event, JOSHUA_USER);
    steps.push({
      name: "owner sees event",
      pass: ownerPres.access.level === "edit" && ownerPres.isOwner,
    });

    const eballardBefore = await resolveEventDomainAccess(ctx, {
      resourceType: "event",
      resourceId: String(eventId),
      organizationId: JOSHUA_ORG_ID,
      ownerUserId: JOSHUA_USER,
      ownerUserKey: JOSHUA_USER,
      memberUserKey: EBALLARD_USER,
    });
    steps.push({
      name: "viewer blocked before share",
      pass: eballardBefore.level === "none",
    });

    await upsertEventDomainShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "event",
      resourceId: String(eventId),
      sharedUserId: EBALLARD_USER,
      collaboratorRole: "viewer",
      createdByUserId: JOSHUA_USER,
      eventId,
    });

    const viewerPres = await getEventViewerPresentation(ctx, event, EBALLARD_USER);
    steps.push({
      name: "viewer sees shared event",
      pass:
        viewerPres.access.level === "view" &&
        viewerPres.readOnly &&
        !viewerPres.canManageCollaborators,
    });

    let viewerEditBlocked = true;
    try {
      await assertCanMutateEventContent(ctx, event, EBALLARD_USER, "proof");
      viewerEditBlocked = false;
    } catch {
      viewerEditBlocked = true;
    }
    steps.push({
      name: "viewer cannot edit",
      pass: viewerEditBlocked,
    });

    await removeEventDomainShare(ctx, {
      resourceType: "event",
      resourceId: String(eventId),
      sharedUserId: EBALLARD_USER,
      eventId,
    });
    await upsertEventDomainShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "event",
      resourceId: String(eventId),
      sharedUserId: EBALLARD_USER,
      collaboratorRole: "editor",
      createdByUserId: JOSHUA_USER,
      eventId,
    });
    const editorPres = await getEventViewerPresentation(ctx, event, EBALLARD_USER);
    steps.push({
      name: "editor can edit content",
      pass: editorPres.canEditContent && !editorPres.canManageCollaborators,
    });

    await removeEventDomainShare(ctx, {
      resourceType: "event",
      resourceId: String(eventId),
      sharedUserId: EBALLARD_USER,
      eventId,
    });
    await upsertEventDomainShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "event",
      resourceId: String(eventId),
      sharedUserId: EBALLARD_USER,
      collaboratorRole: "co_owner",
      createdByUserId: JOSHUA_USER,
      eventId,
    });
    const coPres = await getEventViewerPresentation(ctx, event, EBALLARD_USER);
    steps.push({
      name: "co-owner can manage collaborators",
      pass: coPres.canManageCollaborators && coPres.bannerMode === "co_owner",
    });

    const ideaId = await insertEventIdea(ctx, {
      organizationId: JOSHUA_ORG_ID,
      ownerUserKey: JOSHUA_USER,
      title: `${PREFIX} Idea`,
      body: "lineage",
      createdByUserKey: JOSHUA_USER,
    });
    const ideaEventId = await convertIdeaToEvent(ctx, {
      ideaId,
      actorUserKey: JOSHUA_USER,
    });
    const ideaHistory = await ctx.db
      .query("eventConversionHistory")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", "event_idea").eq("sourceId", String(ideaId)),
      )
      .first();
    steps.push({
      name: "idea conversion + lineage",
      pass: Boolean(ideaHistory) && String(ideaHistory?.targetEventId) === String(ideaEventId),
    });

    const invId = await insertEventInvitation(ctx, {
      organizationId: JOSHUA_ORG_ID,
      ownerUserKey: JOSHUA_USER,
      title: `${PREFIX} Invitation`,
      createdByUserKey: JOSHUA_USER,
    });
    const invEventId = await convertInvitationToEvent(ctx, {
      invitationId: invId,
      actorUserKey: JOSHUA_USER,
    });
    steps.push({
      name: "invitation conversion",
      pass: Boolean(invEventId),
    });

    await ctx.db.patch(eventId, {
      ownerUserId: EBALLARD_USER,
      ownerUserKey: EBALLARD_USER,
      updatedAt: Date.now(),
    });
    const transferred = await ctx.db.get(eventId);
    const newOwnerPres = transferred
      ? presentationFromAccess(
          await resolveEventDomainAccess(ctx, {
            resourceType: "event",
            resourceId: String(eventId),
            organizationId: JOSHUA_ORG_ID,
            ownerUserId: transferred.ownerUserId,
            ownerUserKey: transferred.ownerUserKey,
            memberUserKey: EBALLARD_USER,
          }),
        )
      : null;
    steps.push({
      name: "ownership transfer",
      pass:
        transferred?.ownerUserId === EBALLARD_USER &&
        newOwnerPres?.isOwner === true,
    });
    if (transferred) {
      await ctx.db.patch(eventId, {
        ownerUserId: JOSHUA_USER,
        ownerUserKey: JOSHUA_USER,
      });
    }

    await removeEventDomainShare(ctx, {
      resourceType: "event",
      resourceId: String(eventId),
      sharedUserId: EBALLARD_USER,
      eventId,
    });
    const revoked = await resolveEventDomainAccess(ctx, {
      resourceType: "event",
      resourceId: String(eventId),
      organizationId: JOSHUA_ORG_ID,
      ownerUserId: JOSHUA_USER,
      ownerUserKey: JOSHUA_USER,
      memberUserKey: EBALLARD_USER,
    });
    steps.push({
      name: "revoke removes access instantly",
      pass: revoked.level === "none",
    });

    const orgEvents = await ctx.db
      .query("events")
      .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
      .collect();
    const leak = orgEvents.filter((e) => e.title.startsWith(PREFIX));
    let eballardSees = 0;
    for (const e of leak) {
      const a = await resolveEventDomainAccess(ctx, {
        resourceType: "event",
        resourceId: String(e._id),
        organizationId: JOSHUA_ORG_ID,
        ownerUserId: e.ownerUserId,
        ownerUserKey: e.ownerUserKey,
        memberUserKey: EBALLARD_USER,
      });
      if (a.level !== "none") eballardSees += 1;
    }
    steps.push({
      name: "no org leakage",
      pass: eballardSees === 0,
      detail: { eballardSees, proofEvents: leak.length },
    });

    await cleanup(ctx);
    const pass = steps.every((s) => s.pass);
    return { pass, phase: 16, step: 3, steps, organizationId: String(JOSHUA_ORG_ID) };
  },
});
