export type ResourceOwnershipBadgeKind =
  | "owner"
  | "shared_view"
  | "shared_edit";

/** Client-safe mirror of `ResourceOwnershipPresentation` from Convex. */
/** Muted hierarchy ACL indicator on loan files (Phase 13.3 Step 4). */
export type PipelineHierarchyAccessLabel =
  | "Explicit Loan Share"
  | "Inherited from Project"
  | "Inherited from Client";

export type ResourceOwnershipPresentationClient = {
  ownershipLine: string;
  badge: ResourceOwnershipBadgeKind | null;
  ownerUserId: string;
  ownerDisplayUsername: string;
  viewerAccessLevel: "none" | "view" | "edit";
  isOwner: boolean;
  isSharedViewer: boolean;
  collaboratorCount: number;
  /** Set when access is via parent share / inheritance (not owner, not direct loan share). */
  hierarchyAccessLabel?: PipelineHierarchyAccessLabel | null;
};

export const RESOURCE_OWNERSHIP_BADGE_LABEL: Record<
  ResourceOwnershipBadgeKind,
  string
> = {
  owner: "Owner",
  shared_view: "Shared View",
  shared_edit: "Shared Edit",
};

export function resourceOwnershipBadgeClass(
  badge: ResourceOwnershipBadgeKind,
): string {
  switch (badge) {
    case "owner":
      return "border-border/80 bg-muted/50 text-muted-foreground";
    case "shared_view":
      return "border-muted-foreground/25 bg-muted/30 text-muted-foreground";
    case "shared_edit":
      return "border-primary/30 bg-primary/8 text-primary";
  }
}

export function viewerAccessLevelLabel(
  level: "none" | "view" | "edit",
  isOwner: boolean,
): string {
  if (isOwner) return "Owner (full access)";
  if (level === "edit") return "Edit";
  if (level === "view") return "View";
  return "No access";
}
