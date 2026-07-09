import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { EntityContactRelationshipRoleId } from "@/lib/contacts/entityContactRoles";

/** Primary business entity resolved from entityContactLinks (CRM-4). */
export type ContactPrimaryEntity = {
  linkId: Id<"entityContactLinks">;
  entityId: Id<"clients">;
  displayName: string;
  position: string;
  relationshipRole: EntityContactRelationshipRoleId;
};

export type ContactHubRecord = Doc<"contacts"> & {
  primaryEntity: ContactPrimaryEntity | null;
};

export type EntityLinkDraft =
  | { kind: "none" }
  | {
      kind: "existing";
      entityId: Id<"clients">;
      displayName: string;
      position: string;
      relationshipRole: EntityContactRelationshipRoleId;
      linkId?: Id<"entityContactLinks">;
    }
  | {
      kind: "new";
      displayName: string;
      position: string;
      relationshipRole: EntityContactRelationshipRoleId;
    };

export function entityLinkDraftFromPrimaryEntity(
  primary: ContactPrimaryEntity | null | undefined,
): EntityLinkDraft {
  if (!primary) return { kind: "none" };
  return {
    kind: "existing",
    entityId: primary.entityId,
    displayName: primary.displayName,
    position: primary.position,
    relationshipRole: primary.relationshipRole,
    linkId: primary.linkId,
  };
}

export function entityLinkDraftsEqual(
  a: EntityLinkDraft,
  b: EntityLinkDraft,
): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "none" && b.kind === "none") return true;
  if (a.kind === "existing" && b.kind === "existing") {
    return (
      String(a.entityId) === String(b.entityId) &&
      a.position.trim() === b.position.trim() &&
      a.relationshipRole === b.relationshipRole
    );
  }
  if (a.kind === "new" && b.kind === "new") {
    return (
      a.displayName.trim() === b.displayName.trim() &&
      a.position.trim() === b.position.trim() &&
      a.relationshipRole === b.relationshipRole
    );
  }
  return false;
}

export function contactDisplayCompany(
  contact: Pick<ContactHubRecord, "primaryEntity" | "companyName">,
): string {
  return (
    contact.primaryEntity?.displayName?.trim() ||
    contact.companyName?.trim() ||
    ""
  );
}
