export type WorkspaceRole = "workspace:admin" | "workspace:member";

export type ViewerSession = {
  userKey: string;
  email: string;
  fullName: string;
  organizationId: string;
  organizationName: string;
  workspaceRole: WorkspaceRole;
  issuedAt: number;
  expiresAt: number;
  /** Internal auth display handle */
  displayUsername?: string;
  /** Rotating session public id (internal auth). */
  sessionPublicId?: string;
  /** Set from Convex `authUsers` on internal session validate. */
  isGlobalAdmin?: boolean;
  /** Canonical primary login only — may start tenant impersonation. */
  canSuperuserImpersonate?: boolean;
  /** Real home org when impersonating another tenant. */
  homeOrganizationId?: string;
  homeOrganizationName?: string;
  impersonation?: {
    targetOrganizationId: string;
    targetOrganizationName: string;
    mode: "readonly" | "operator";
    expiresAt: number;
    publicId: string;
  };
};
