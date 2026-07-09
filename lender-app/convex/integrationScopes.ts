/**
 * Scopes accepted on integration credentials and HTTP routes.
 */
export const INTEGRATION_SCOPES = [
  "files:read",
  "contacts:read",
  "lenders:read",
  "tasks:read",
  /** Enqueue outbound actions / sync jobs via HTTP. */
  "integrations:invoke",
  /** Reserved for future two-way sync triggers. */
  "integrations:sync",
  "*",
] as const;

export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];

const ALLOWED = new Set<string>(INTEGRATION_SCOPES);

export function sanitizeIntegrationScopes(raw: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    const t = s.trim();
    if (!ALLOWED.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function integrationScopeAllows(
  granted: readonly string[],
  required: IntegrationScope,
): boolean {
  if (granted.includes("*")) return true;
  return granted.includes(required);
}
