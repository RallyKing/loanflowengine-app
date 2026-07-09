/**
 * Stable identities for E2E / QA workspaces. Passwords are never stored here —
 * set `E2E_PASS_<SUFFIX>` in `.env.testing` (see `docs/testing/testing-credentials.md`).
 *
 * After `npm run seed:test-data`, set `E2E_ORG_PRIMARY_ID` and `E2E_ORG_SECONDARY_ID`
 * to the printed Convex organization ids so session cookies resolve to the right tenant.
 */

export type E2EOrgSlug = "primary" | "secondary";

export type E2ETestPersona =
  | "super_admin"
  | "manager"
  | "org_owner"
  | "team_member"
  | "loan_officer"
  | "processor"
  | "referral_partner"
  | "client_portal"
  | "lender_rep"
  | "read_only"
  | "demo_sandbox";

export type E2EUserCatalogEntry = {
  persona: E2ETestPersona;
  /** Suffix for `E2E_PASS_<SUFFIX>` env var (uppercase). */
  passEnvSuffix: string;
  /** Login username sent to `/api/auth/login` (email form). */
  username: string;
  userKey: string;
  fullName: string;
  orgSlug: E2EOrgSlug;
  /** Convex `organizationMembers.role` */
  membershipRole: "owner" | "admin" | "member";
  /**
   * Which built-in product role id to assign (after seedSystemRolesForOrganization).
   * `null` = owner/admin rows use membership only (no assignedRoleId).
   */
  assignedPreset: "admin" | "manager" | "user" | null;
  /** Label for docs / AI agents only. */
  description: string;
};

export const E2E_ORG_PRIMARY_SLUG = "e2e-primary";
export const E2E_ORG_SECONDARY_SLUG = "e2e-secondary";

/** Names match seed output — keep in sync with `convex/testingSeed.ts`. */
export const E2E_USER_CATALOG: readonly E2EUserCatalogEntry[] = [
  {
    persona: "super_admin",
    passEnvSuffix: "SUPER_ADMIN",
    username: "e2e-super-admin@dlc.test",
    userKey: userKeyFor("super_admin"),
    fullName: "E2E Super Admin",
    orgSlug: "primary",
    membershipRole: "owner",
    assignedPreset: null,
    description: "Full org ownership — same capabilities as org owner for primary org.",
  },
  {
    persona: "manager",
    passEnvSuffix: "MANAGER",
    username: "e2e-manager@dlc.test",
    userKey: userKeyFor("manager"),
    fullName: "E2E Manager",
    orgSlug: "primary",
    membershipRole: "member",
    assignedPreset: "manager",
    description: "Primary manager persona for Phase 11.5 auth and workflow validation.",
  },
  {
    persona: "org_owner",
    passEnvSuffix: "ORG_OWNER",
    username: "e2e-org-owner@dlc.test",
    userKey: userKeyFor("org_owner"),
    fullName: "E2E Organization Owner",
    orgSlug: "primary",
    membershipRole: "owner",
    assignedPreset: null,
    description: "Second owner on primary org — pipeline and settings smoke tests.",
  },
  {
    persona: "team_member",
    passEnvSuffix: "TEAM_MEMBER",
    username: "e2e-team-member@dlc.test",
    userKey: userKeyFor("team_member"),
    fullName: "E2E Team Member",
    orgSlug: "primary",
    membershipRole: "member",
    assignedPreset: "user",
    description: "Baseline member with User preset permissions.",
  },
  {
    persona: "loan_officer",
    passEnvSuffix: "LOAN_OFFICER",
    username: "e2e-loan-officer@dlc.test",
    userKey: userKeyFor("loan_officer"),
    fullName: "E2E Loan Officer",
    orgSlug: "primary",
    membershipRole: "member",
    assignedPreset: "manager",
    description: "Manager preset — file edit, contacts, typical producer workflows.",
  },
  {
    persona: "processor",
    passEnvSuffix: "PROCESSOR",
    username: "e2e-processor@dlc.test",
    userKey: userKeyFor("processor"),
    fullName: "E2E Processor",
    orgSlug: "primary",
    membershipRole: "member",
    assignedPreset: "manager",
    description: "Manager preset — used for back-office workflow specs.",
  },
  {
    persona: "referral_partner",
    passEnvSuffix: "REFERRAL_PARTNER",
    username: "e2e-referral-partner@dlc.test",
    userKey: userKeyFor("referral_partner"),
    fullName: "E2E Referral Partner",
    orgSlug: "primary",
    membershipRole: "member",
    assignedPreset: "user",
    description: "External partner persona — validate shares / referral links.",
  },
  {
    persona: "lender_rep",
    passEnvSuffix: "LENDER_REP",
    username: "e2e-lender-rep@dlc.test",
    userKey: userKeyFor("lender_rep"),
    fullName: "E2E Lender Representative",
    orgSlug: "primary",
    membershipRole: "member",
    assignedPreset: "user",
    description: "Capital-side contact persona — lender ↔ contact graph.",
  },
  {
    persona: "read_only",
    passEnvSuffix: "READ_ONLY",
    username: "e2e-read-only@dlc.test",
    userKey: userKeyFor("read_only"),
    fullName: "E2E Read Only",
    orgSlug: "primary",
    membershipRole: "member",
    assignedPreset: "user",
    description: "User preset — permission-denied UI tests (no edit_all).",
  },
  {
    persona: "demo_sandbox",
    passEnvSuffix: "DEMO_SANDBOX",
    username: "e2e-demo-sandbox@dlc.test",
    userKey: userKeyFor("demo_sandbox"),
    fullName: "E2E Demo Sandbox",
    orgSlug: "secondary",
    membershipRole: "member",
    assignedPreset: "manager",
    description: "Isolated tenant for multi-org leakage tests.",
  },
  {
    persona: "client_portal",
    passEnvSuffix: "CLIENT_PORTAL",
    username: "e2e-client-portal@dlc.test",
    userKey: userKeyFor("client_portal"),
    fullName: "E2E Portal Client",
    orgSlug: "primary",
    membershipRole: "member",
    assignedPreset: "user",
    description:
      "Workspace cookie identity for labeling; portal login uses /portal/login with the same email + password (see seed).",
  },
] as const;

function userKeyFor(persona: string): string {
  return `e2e_${persona}_v1`;
}

export function catalogEntryForUsername(
  username: string,
): E2EUserCatalogEntry | undefined {
  const u = username.trim().toLowerCase();
  return E2E_USER_CATALOG.find(
    (e) => e.username.trim().toLowerCase() === u,
  );
}

export function orgIdForCatalogEntry(
  entry: E2EUserCatalogEntry,
): string | undefined {
  const primary = process.env.E2E_ORG_PRIMARY_ID?.trim();
  const secondary = process.env.E2E_ORG_SECONDARY_ID?.trim();
  if (entry.orgSlug === "primary") return primary;
  return secondary;
}

/** Display name for org — matches `testingSeed` defaults. */
export function orgDisplayNameForSlug(slug: E2EOrgSlug): string {
  return slug === "primary"
    ? "E2E Primary Organization"
    : "E2E Secondary Organization";
}
