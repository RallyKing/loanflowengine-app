/**
 * Phase 16 Step 2 — event schema foundation production proof.
 */
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  canReadEventResource,
  cloneTemplateToEvent,
  convertInvitationToEvent,
  convertIdeaToEvent,
  insertEventIdea,
  insertEventInvitation,
  insertEventShell,
  insertEventTemplate,
  insertSampleItem,
  listVisibleEventsForMember,
  resolveEventDomainAccess,
  upsertEventDomainShare,
} from "../events/eventFoundationImpl";
import { removeEventDomainShare } from "../events/eventAccess";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER = "ts7d3keadq48gay3pa8k6gdwx9878p33";

const PROOF_PREFIX = "Phase16Step2 Foundation";

type ProofStep = {
  name: string;
  pass: boolean;
  detail?: Record<string, unknown>;
};

async function cleanupProofRows(ctx: MutationCtx) {
  const events = await ctx.db
    .query("events")
    .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
    .collect();
  for (const row of events) {
    if (!row.title.startsWith(PROOF_PREFIX)) continue;
    const items = await ctx.db
      .query("eventSectionItems")
      .withIndex("by_event", (q) => q.eq("eventId", row._id))
      .collect();
    for (const item of items) await ctx.db.delete(item._id);
    const sections = await ctx.db
      .query("eventSections")
      .withIndex("by_event_sort", (q) => q.eq("eventId", row._id))
      .collect();
    for (const s of sections) await ctx.db.delete(s._id);
    const collabs = await ctx.db
      .query("eventCollaborators")
      .withIndex("by_event_user", (q) => q.eq("eventId", row._id))
      .collect();
    for (const c of collabs) await ctx.db.delete(c._id);
    const shares = await ctx.db
      .query("resourceShares")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "event").eq("resourceId", String(row._id)),
      )
      .collect();
    for (const s of shares) await ctx.db.delete(s._id);
    const history = await ctx.db
      .query("eventConversionHistory")
      .withIndex("by_target", (q) => q.eq("targetEventId", row._id))
      .collect();
    for (const h of history) await ctx.db.delete(h._id);
    await ctx.db.delete(row._id);
  }

  for (const table of ["eventIdeas", "eventInvitations", "eventTemplates"] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
      .collect();
    for (const row of rows) {
      if (!("title" in row) || typeof row.title !== "string") continue;
      if (!row.title.startsWith(PROOF_PREFIX)) continue;
      if (table === "eventTemplates") {
        const sections = await ctx.db
          .query("eventTemplateSections")
          .withIndex("by_template_sort", (q) =>
            q.eq("templateId", row._id as Id<"eventTemplates">),
          )
          .collect();
        for (const s of sections) {
          const items = await ctx.db
            .query("eventTemplateItems")
            .withIndex("by_template_section_sort", (q) =>
              q.eq("templateSectionId", s._id),
            )
            .collect();
          for (const i of items) await ctx.db.delete(i._id);
          await ctx.db.delete(s._id);
        }
      }
      await ctx.db.delete(row._id);
    }
  }
}

export const runEventFoundationProof = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);
    const steps: ProofStep[] = [];

    await cleanupProofRows(ctx);

    const ownerEventId = await insertEventShell(ctx, {
      organizationId: JOSHUA_ORG_ID,
      ownerUserKey: JOSHUA_USER,
      title: `${PROOF_PREFIX} Owner Event`,
      createdByUserKey: JOSHUA_USER,
    });

    const ownerVisible = await listVisibleEventsForMember(
      ctx,
      JOSHUA_ORG_ID,
      JOSHUA_USER,
    );
    const eballardBefore = await listVisibleEventsForMember(
      ctx,
      JOSHUA_ORG_ID,
      EBALLARD_USER,
    );
    steps.push({
      name: "owner-only visibility (no share)",
      pass:
        ownerVisible.some((e) => String(e._id) === String(ownerEventId)) &&
        !eballardBefore.some((e) => String(e._id) === String(ownerEventId)),
      detail: {
        joshuaCount: ownerVisible.length,
        eballardSeesOwnerEvent: eballardBefore.some(
          (e) => String(e._id) === String(ownerEventId),
        ),
      },
    });

    await upsertEventDomainShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "event",
      resourceId: String(ownerEventId),
      sharedUserId: EBALLARD_USER,
      collaboratorRole: "co_owner",
      createdByUserId: JOSHUA_USER,
      eventId: ownerEventId,
    });

    const coOwnerAccess = await resolveEventDomainAccess(ctx, {
      resourceType: "event",
      resourceId: String(ownerEventId),
      organizationId: JOSHUA_ORG_ID,
      ownerUserId: JOSHUA_USER,
      ownerUserKey: JOSHUA_USER,
      memberUserKey: EBALLARD_USER,
    });
    const collabRow = await ctx.db
      .query("eventCollaborators")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", ownerEventId).eq("userId", EBALLARD_USER),
      )
      .first();
    steps.push({
      name: "share visibility + co_owner role",
      pass:
        coOwnerAccess.level === "edit" &&
        coOwnerAccess.collaboratorRole === "co_owner" &&
        Boolean(collabRow),
      detail: {
        access: coOwnerAccess,
        collaboratorRole: collabRow?.collaboratorRole,
      },
    });

    const eballardAfterShare = await listVisibleEventsForMember(
      ctx,
      JOSHUA_ORG_ID,
      EBALLARD_USER,
    );
    steps.push({
      name: "shared user list visibility",
      pass: eballardAfterShare.some((e) => String(e._id) === String(ownerEventId)),
    });

    const templateId = await insertEventTemplate(ctx, {
      organizationId: JOSHUA_ORG_ID,
      ownerUserKey: JOSHUA_USER,
      title: `${PROOF_PREFIX} Template`,
      createdByUserKey: JOSHUA_USER,
    });
    const clonedEventId = await cloneTemplateToEvent(ctx, {
      templateId,
      organizationId: JOSHUA_ORG_ID,
      ownerUserKey: JOSHUA_USER,
      createdByUserKey: JOSHUA_USER,
    });
    const clonedSections = await ctx.db
      .query("eventSections")
      .withIndex("by_event_sort", (q) => q.eq("eventId", clonedEventId))
      .collect();
    const clonedItems = await ctx.db
      .query("eventSectionItems")
      .withIndex("by_event", (q) => q.eq("eventId", clonedEventId))
      .collect();
    steps.push({
      name: "template clone sections + items",
      pass: clonedSections.length >= 5 && clonedItems.length >= 5,
      detail: {
        sections: clonedSections.length,
        items: clonedItems.length,
      },
    });

    const ideaId = await insertEventIdea(ctx, {
      organizationId: JOSHUA_ORG_ID,
      ownerUserKey: JOSHUA_USER,
      title: `${PROOF_PREFIX} Idea`,
      body: "Capture body",
      createdByUserKey: JOSHUA_USER,
    });
    const ideaEventId = await convertIdeaToEvent(ctx, {
      ideaId,
      actorUserKey: JOSHUA_USER,
    });
    const ideaRow = await ctx.db.get(ideaId);
    const ideaHistory = await ctx.db
      .query("eventConversionHistory")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", "event_idea").eq("sourceId", String(ideaId)),
      )
      .first();
    steps.push({
      name: "idea conversion + lineage",
      pass:
        ideaRow?.status === "converted" &&
        String(ideaRow.convertedToEventId) === String(ideaEventId) &&
        Boolean(ideaHistory),
    });

    const invId = await insertEventInvitation(ctx, {
      organizationId: JOSHUA_ORG_ID,
      ownerUserKey: JOSHUA_USER,
      title: `${PROOF_PREFIX} Invitation`,
      host: "Host Name",
      venue: "Venue Name",
      createdByUserKey: JOSHUA_USER,
    });
    const invEventId = await convertInvitationToEvent(ctx, {
      invitationId: invId,
      actorUserKey: JOSHUA_USER,
    });
    const invHistory = await ctx.db
      .query("eventConversionHistory")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", "event_invitation").eq("sourceId", String(invId)),
      )
      .first();
    steps.push({
      name: "invitation conversion + lineage",
      pass:
        Boolean(invHistory) &&
        String(invHistory?.targetEventId) === String(invEventId),
    });

    const section = await ctx.db
      .query("eventSections")
      .withIndex("by_event_sort", (q) => q.eq("eventId", ownerEventId))
      .first();
    if (section) {
      const itemId = await insertSampleItem(ctx, {
        eventId: ownerEventId,
        sectionId: section._id,
        organizationId: JOSHUA_ORG_ID,
        createdByUserKey: JOSHUA_USER,
      });
      const linkId = await ctx.db.insert("eventItemLinks", {
        itemId,
        eventId: ownerEventId,
        organizationId: JOSHUA_ORG_ID,
        url: "https://example.com/proof",
        label: "proof",
        createdByUserKey: JOSHUA_USER,
        createdAt: Date.now(),
      });
      steps.push({
        name: "section/item integrity + item link row",
        pass: Boolean(itemId) && Boolean(linkId),
      });
    } else {
      steps.push({
        name: "section/item integrity + item link row",
        pass: false,
        detail: { error: "no_section" },
      });
    }

    const orgMemberLeakCheck = await ctx.db
      .query("events")
      .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
      .collect();
    const leakTitles = orgMemberLeakCheck
      .filter((e) => e.title.startsWith(PROOF_PREFIX))
      .filter((e) => resolveRowOwner(e) !== EBALLARD_USER);
    const eballardCanReadLeak = [];
    for (const e of leakTitles) {
      const can = await canReadEventResource(ctx, {
        resourceType: "event",
        row: e,
        memberUserKey: EBALLARD_USER,
      });
      if (can) eballardCanReadLeak.push(e.title);
    }
    steps.push({
      name: "zero org leakage without explicit share",
      pass:
        eballardCanReadLeak.length === 1 &&
        eballardCanReadLeak[0] === `${PROOF_PREFIX} Owner Event`,
      detail: { eballardCanReadLeak },
    });

    await removeEventDomainShare(ctx, {
      resourceType: "event",
      resourceId: String(ownerEventId),
      sharedUserId: EBALLARD_USER,
      eventId: ownerEventId,
    });
    const revoked = await resolveEventDomainAccess(ctx, {
      resourceType: "event",
      resourceId: String(ownerEventId),
      organizationId: JOSHUA_ORG_ID,
      ownerUserId: JOSHUA_USER,
      ownerUserKey: JOSHUA_USER,
      memberUserKey: EBALLARD_USER,
    });
    steps.push({
      name: "revoke share removes access",
      pass: revoked.level === "none",
    });

    await cleanupProofRows(ctx);

    const pass = steps.every((s) => s.pass);
    return {
      pass,
      phase: 16,
      step: 2,
      steps,
      proofPrefix: PROOF_PREFIX,
      organizationId: String(JOSHUA_ORG_ID),
    };
  },
});

function resolveRowOwner(row: { ownerUserId: string; ownerUserKey: string }) {
  return row.ownerUserId?.trim() || row.ownerUserKey?.trim() || "";
}
