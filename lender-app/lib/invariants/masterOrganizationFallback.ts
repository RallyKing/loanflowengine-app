import type { Id } from "@/convex/_generated/dataModel";
import { parseOrganizationId } from "@/lib/orgIdValidation";

/** Mirrors `convex/auth/platformGodMode.ts` — primary operator default workspace. */
export const MASTER_PLATFORM_ORGANIZATION_ID =
  "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;

export const MASTER_PLATFORM_ORGANIZATION_NAME = "Direct Lending Connection";

export const MASTER_PLATFORM_MEMBERSHIP_FALLBACK = [
  {
    organizationId: MASTER_PLATFORM_ORGANIZATION_ID,
    role: "owner" as const,
    organizationName: MASTER_PLATFORM_ORGANIZATION_NAME,
    organizationSlug: "direct-lending-connection",
  },
];

export function resolveMasterOrganizationFallback(
  sessionOrganizationId: string | null | undefined,
): Id<"organizations"> | null {
  return (
    parseOrganizationId(sessionOrganizationId ?? null) ??
    MASTER_PLATFORM_ORGANIZATION_ID
  );
}
