/**
 * Phase 16.3 — event ACL assertions (owner-scoped, no org-wide visibility).
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertOrgMember } from "../organizationAccess";
import { recordResourceAccessDenial, resolveRowOwnerUserId } from "../resourceAccess";
import {
  resolveEventDomainAccess,
  type EventAccessContext,
  type EventCollaboratorRole,
} from "./eventAccess";
import type { EventShareResourceType } from "./eventTypes";

type EventRow = Doc<"events">;
type IdeaRow = Doc<"eventIdeas">;
type InvitationRow = Doc<"eventInvitations">;

export type EventViewerPresentation = {
  access: EventAccessContext;
  bannerMode: "none" | "view" | "edit" | "co_owner";
  readOnly: boolean;
  canEditContent: boolean;
  canManageCollaborators: boolean;
  canTransferOwnership: boolean;
  isOwner: boolean;
};

export function presentationFromAccess(
  access: EventAccessContext,
): EventViewerPresentation {
  const isCoOwner = access.collaboratorRole === "co_owner";
  let bannerMode: EventViewerPresentation["bannerMode"] = "none";
  if (access.isOwner) bannerMode = "none";
  else if (isCoOwner) bannerMode = "co_owner";
  else if (access.level === "view") bannerMode = "view";
  else if (access.level === "edit") bannerMode = "edit";

  const canEditContent =
    access.isOwner ||
    (access.level === "edit" &&
      (access.collaboratorRole === "editor" ||
        access.collaboratorRole === "co_owner"));
  const canManageCollaborators = access.isOwner || isCoOwner;

  return {
    access,
    bannerMode,
    readOnly: !canEditContent,
    canEditContent,
    canManageCollaborators,
    canTransferOwnership: access.isOwner,
    isOwner: access.isOwner,
  };
}

async function loadEventAccess(
  ctx: QueryCtx | MutationCtx,
  event: EventRow,
  memberUserKey: string | undefined,
): Promise<EventAccessContext> {
  return resolveEventDomainAccess(ctx, {
    resourceType: "event",
    resourceId: String(event._id),
    organizationId: event.organizationId,
    ownerUserId: event.ownerUserId,
    ownerUserKey: event.ownerUserKey,
    memberUserKey,
  });
}

export async function getEventViewerPresentation(
  ctx: QueryCtx | MutationCtx,
  event: EventRow,
  memberUserKey: string | undefined,
): Promise<EventViewerPresentation> {
  const access = await loadEventAccess(ctx, event, memberUserKey);
  return presentationFromAccess(access);
}

export async function assertCanReadEvent(
  ctx: QueryCtx | MutationCtx,
  event: EventRow,
  memberUserKey: string | undefined,
): Promise<EventViewerPresentation> {
  const key = (memberUserKey ?? "").trim();
  if (!key) throw new Error("Member is required.");
  await assertOrgMember(ctx, event.organizationId, key);
  const pres = await getEventViewerPresentation(ctx, event, key);
  if (pres.access.level === "none") {
    throw new Error("You do not have access to this event.");
  }
  return pres;
}

export async function assertCanMutateEventContent(
  ctx: MutationCtx,
  event: EventRow,
  memberUserKey: string | undefined,
  action = "mutate",
): Promise<EventViewerPresentation> {
  const key = (memberUserKey ?? "").trim();
  if (!key) throw new Error("Member is required.");
  await assertOrgMember(ctx, event.organizationId, key);
  const pres = await getEventViewerPresentation(ctx, event, key);
  if (!pres.canEditContent) {
    await recordResourceAccessDenial(ctx, {
      actorUserId: key,
      organizationId: event.organizationId,
      resourceType: "event",
      resourceId: String(event._id),
      action,
      reason: pres.access.level === "view" ? "readonly_share" : "not_owner_or_editor",
    });
    throw new Error("You do not have permission to edit this event.");
  }
  return pres;
}

export async function assertCanManageEventCollaborators(
  ctx: MutationCtx,
  event: EventRow,
  memberUserKey: string | undefined,
): Promise<void> {
  const key = (memberUserKey ?? "").trim();
  if (!key) throw new Error("Member is required.");
  await assertOrgMember(ctx, event.organizationId, key);
  const pres = await getEventViewerPresentation(ctx, event, key);
  if (!pres.canManageCollaborators) {
    throw new Error("Only the owner or a co-owner can manage collaborators.");
  }
}

export async function assertIsEventOwner(
  ctx: MutationCtx,
  event: EventRow,
  memberUserKey: string | undefined,
): Promise<void> {
  const key = (memberUserKey ?? "").trim();
  const owner = resolveRowOwnerUserId(event);
  if (!key || owner !== key) {
    throw new Error("Only the event owner can perform this action.");
  }
  await assertOrgMember(ctx, event.organizationId, key);
}

async function assertStubAccess(
  ctx: QueryCtx | MutationCtx,
  args: {
    resourceType: Extract<EventShareResourceType, "event_idea" | "event_invitation">;
    row: IdeaRow | InvitationRow;
    memberUserKey: string | undefined;
    requireEdit?: boolean;
  },
): Promise<EventAccessContext> {
  const key = (args.memberUserKey ?? "").trim();
  if (!key) throw new Error("Member is required.");
  await assertOrgMember(ctx, args.row.organizationId, key);
  const access = await resolveEventDomainAccess(ctx, {
    resourceType: args.resourceType,
    resourceId: String(args.row._id),
    organizationId: args.row.organizationId,
    ownerUserId: args.row.ownerUserId,
    ownerUserKey: args.row.ownerUserKey,
    memberUserKey: key,
  });
  if (access.level === "none") {
    throw new Error("You do not have access to this record.");
  }
  if (args.requireEdit && access.level !== "edit" && !access.isOwner) {
    throw new Error("You do not have permission to edit this record.");
  }
  return access;
}

export async function assertCanReadIdea(
  ctx: QueryCtx | MutationCtx,
  row: IdeaRow,
  memberUserKey: string | undefined,
) {
  return assertStubAccess(ctx, {
    resourceType: "event_idea",
    row,
    memberUserKey,
  });
}

export async function assertCanMutateIdea(
  ctx: MutationCtx,
  row: IdeaRow,
  memberUserKey: string | undefined,
) {
  const access = await assertStubAccess(ctx, {
    resourceType: "event_idea",
    row,
    memberUserKey,
    requireEdit: true,
  });
  if (!access.isOwner) {
    throw new Error("Only the idea owner can edit or convert.");
  }
}

export async function assertCanReadInvitation(
  ctx: QueryCtx | MutationCtx,
  row: InvitationRow,
  memberUserKey: string | undefined,
) {
  return assertStubAccess(ctx, {
    resourceType: "event_invitation",
    row,
    memberUserKey,
  });
}

export async function assertCanMutateInvitation(
  ctx: MutationCtx,
  row: InvitationRow,
  memberUserKey: string | undefined,
) {
  const access = await assertStubAccess(ctx, {
    resourceType: "event_invitation",
    row,
    memberUserKey,
    requireEdit: true,
  });
  if (!access.isOwner) {
    throw new Error("Only the invitation owner can edit or convert.");
  }
}

export function roleAllowsManageShares(role: EventCollaboratorRole | null): boolean {
  return role === "co_owner";
}
