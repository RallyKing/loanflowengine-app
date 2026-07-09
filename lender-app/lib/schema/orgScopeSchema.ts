import { parseConvexDocumentId, parseOrganizationId } from "@/lib/orgIdValidation";
import type { Id } from "@/convex/_generated/dataModel";

export type OrgScopeValidation =
  | { ok: true; organizationId: Id<"organizations"> }
  | { ok: false; code: "missing" | "wrong_type" | "malformed" };

/**
 * API / bridge boundary: validate untrusted org id strings before Convex calls.
 */
export function validateOrganizationIdInput(raw: unknown): OrgScopeValidation {
  if (raw === undefined || raw === null) return { ok: false, code: "missing" };
  if (typeof raw !== "string") return { ok: false, code: "wrong_type" };
  const id = parseOrganizationId(raw);
  if (!id) return { ok: false, code: "malformed" };
  return { ok: true, organizationId: id };
}

/** Any Convex document id table — shape-only (no membership checks). */
export function validateConvexDocumentIdInput(raw: unknown):
  | { ok: true; id: string }
  | { ok: false; code: "missing" | "wrong_type" | "malformed" } {
  if (raw === undefined || raw === null) return { ok: false, code: "missing" };
  if (typeof raw !== "string") return { ok: false, code: "wrong_type" };
  const id = parseConvexDocumentId(raw);
  if (!id) return { ok: false, code: "malformed" };
  return { ok: true, id };
}
