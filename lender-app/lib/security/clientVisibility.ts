/**
 * Portal-safe visibility partitions — pure predicates for shaping outbound DTOs.
 * No Convex imports; safe for server components, Convex actions, and tests.
 */

export type ClientFieldVisibilityClass =
  | "internal_only"
  | "client_shared"
  | "client_summary_only"
  | "approval_gated";

export type DocumentVisibilityClass =
  | "team_private"
  | "client_readable"
  | "client_upload_only"
  | "redacted_preview";

export type LenderPortalRedactionLevel = "none" | "hide_contacts" | "aggregate_only";

export type PortalVisibilityContext = {
  grantApproved: boolean;
  /** When false, `approval_gated` fields are stripped. */
};

export function visibilityClassForPipelineField(key: string): ClientFieldVisibilityClass {
  const k = key.toLowerCase();
  if (
    k.includes("ssn") ||
    k.includes("taxid") ||
    k.includes("bank") ||
    k.includes("credential")
  ) {
    return "internal_only";
  }
  if (k.includes("borrower") || k.includes("property") || k.includes("loanamount")) {
    return "client_shared";
  }
  if (k.startsWith("broker") || k.includes("commission") || k.includes("split")) {
    return "approval_gated";
  }
  return "client_summary_only";
}

export function partitionForClient<T extends Record<string, unknown>>(
  row: T,
  ctx: PortalVisibilityContext,
): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(row)) {
    const cls = visibilityClassForPipelineField(key);
    if (cls === "internal_only") continue;
    if (cls === "approval_gated" && !ctx.grantApproved) continue;
    out[key as keyof T] = value as T[keyof T];
  }
  return out;
}

export function redactLenderForPortal<L extends Record<string, unknown>>(
  lender: L,
  level: LenderPortalRedactionLevel,
): Partial<L> {
  if (level === "none") return { ...lender };
  const { email, phone, notes, ...rest } = lender as L & {
    email?: unknown;
    phone?: unknown;
    notes?: unknown;
  };
  if (level === "hide_contacts") {
    return { ...rest } as Partial<L>;
  }
  if (level === "aggregate_only") {
    return {
      company: (lender as { company?: unknown }).company,
      primaryNiche: (lender as { primaryNiche?: unknown }).primaryNiche,
    } as unknown as Partial<L>;
  }
  return { ...lender };
}

export function documentAllowedForClient(cls: DocumentVisibilityClass): boolean {
  return cls === "client_readable" || cls === "client_upload_only";
}
