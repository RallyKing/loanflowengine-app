/**
 * Organization id validation — no dependency on membership resolution.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { parseConvexDocumentId } from "../lib/orgIdValidation";
import { orgIntegrityFail, orgIntegrityTrace } from "./orgIntegrityTelemetry";

export class OrganizationNotFoundError extends Error {
  readonly code = "ORG_NOT_FOUND" as const;
  constructor(message = "Organization not found.") {
    super(message);
    this.name = "OrganizationNotFoundError";
  }
}

export class InvalidOrganizationIdError extends Error {
  readonly code = "ORG_ID_MALFORMED" as const;
  constructor(message = "Invalid organization id.") {
    super(message);
    this.name = "InvalidOrganizationIdError";
  }
}

function normalizeOrgIdInput(raw: string | Id<"organizations">): string {
  if (typeof raw === "string") return raw.trim();
  return String(raw).trim();
}

/**
 * Validates that `raw` resolves to a live row in table `organizations`.
 * Ids for other tables will not return an organizations document.
 */
export async function assertOrganizationId(
  ctx: QueryCtx | MutationCtx,
  raw: string | Id<"organizations"> | undefined | null,
): Promise<{ id: Id<"organizations">; organization: Doc<"organizations"> }> {
  if (raw === undefined || raw === null) {
    orgIntegrityFail("assertOrganizationId.missing", {});
    throw new InvalidOrganizationIdError();
  }
  const s = normalizeOrgIdInput(raw);
  const canon = parseConvexDocumentId(s);
  if (!canon) {
    orgIntegrityFail("assertOrganizationId.malformed", {
      len: s.length,
      sample: s.slice(0, 8),
    });
    throw new InvalidOrganizationIdError();
  }
  const id = canon as Id<"organizations">;
  orgIntegrityTrace("assertOrganizationId.lookup", {
    idPrefix: s.slice(0, 8),
  });
  const organization = await ctx.db.get(id);
  if (!organization) {
    orgIntegrityFail("assertOrganizationId.not_found", {
      idPrefix: s.slice(0, 8),
    });
    throw new OrganizationNotFoundError();
  }
  return { id, organization };
}

/** Portal sentinel `none` = no workspace org; otherwise must be a live org id. */
export async function assertPortalOrgScope(
  ctx: QueryCtx | MutationCtx,
  orgScope: string,
): Promise<Id<"organizations"> | null> {
  const t = orgScope.trim();
  if (t === "" || t === "none") return null;
  const { id } = await assertOrganizationId(ctx, t as Id<"organizations">);
  return id;
}

export function assertRowBelongsToOrganization<
  T extends { organizationId?: Id<"organizations"> | null },
>(
  row: T,
  expectedOrganizationId: Id<"organizations">,
  label: string,
): void {
  const got = row.organizationId ?? null;
  if (!got || got !== expectedOrganizationId) {
    orgIntegrityFail("tenant.mismatch", {
      label,
      expected: String(expectedOrganizationId),
      got: got ? String(got) : null,
    });
    throw new Error(`Tenant isolation violation (${label}).`);
  }
}
