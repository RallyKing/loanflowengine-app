import type { ViewerSession } from "@/lib/sessionAuth";
import { newViewerSessionFromProfile } from "@/lib/sessionAuth";
import {
  catalogEntryForUsername,
  orgDisplayNameForSlug,
  orgIdForCatalogEntry,
  type E2EUserCatalogEntry,
} from "@/lib/testing/e2eUserCatalog";

/**
 * When true, `/api/auth/login` may resolve additional workspace users from env
 * (`E2E_PASS_*`, `E2E_ORG_*`). Never enable on production deploys unless you
 * fully understand the blast radius.
 */
export function isE2EWorkspaceLoginEnabled(): boolean {
  return process.env.APP_AUTH_E2E_USERS_ENABLED === "true";
}

function e2eAllowedOnThisDeployment(): boolean {
  if (!isE2EWorkspaceLoginEnabled()) return false;
  if (process.env.APP_AUTH_E2E_ALLOW_IN_PRODUCTION === "true") return true;
  if (process.env.VERCEL_ENV === "production") return false;
  return true;
}

function passwordForEntry(entry: E2EUserCatalogEntry): string | undefined {
  const key = `E2E_PASS_${entry.passEnvSuffix}`;
  const v = process.env[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function viewerForEntry(entry: E2EUserCatalogEntry): ViewerSession | null {
  const organizationId = orgIdForCatalogEntry(entry);
  if (!organizationId) return null;

  const workspaceRole: ViewerSession["workspaceRole"] =
    entry.membershipRole === "owner" || entry.membershipRole === "admin"
      ? "workspace:admin"
      : "workspace:member";

  return newViewerSessionFromProfile({
    userKey: entry.userKey,
    email: entry.username,
    fullName: entry.fullName,
    organizationId,
    organizationName: orgDisplayNameForSlug(entry.orgSlug),
    workspaceRole,
  });
}

/**
 * Returns a signed-session-ready viewer when E2E auth is enabled, org ids are
 * configured, and the password matches the catalog entry's `E2E_PASS_*` var.
 */
export function tryResolveE2EWorkspaceSession(
  username: string,
  password: string,
): ViewerSession | null {
  if (!e2eAllowedOnThisDeployment()) return null;
  const entry = catalogEntryForUsername(username);
  if (!entry || entry.persona === "client_portal") return null;
  const expected = passwordForEntry(entry);
  if (!expected || expected !== password) return null;
  return viewerForEntry(entry);
}
