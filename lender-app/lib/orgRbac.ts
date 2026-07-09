/**
 * Organization RBAC — permission keys shared by Convex and the client.
 * Add new keys here for extensibility; seed/custom roles store these strings.
 */
export const ORG_PERMISSIONS = [
  "files.view",
  "files.edit",
  /** Read any org-scoped file without an explicit share (Managers/Admins). */
  "files.view_all",
  /** Edit any org-scoped file without being the owner (Managers/Admins). */
  "files.edit_all",
  "files.delete",
  "blocks.manage",
  "contacts.view",
  "contacts.manage",
  "settings.access",
  /** Read organization settings (Phase 12 matrix). */
  "settings.view",
  /** Change org-wide settings and dangerous configuration. */
  "settings.manage",
  /** Send tracked org emails via system (Resend). */
  "email.send",
  "org.members.invite",
  "org.roles.manage",
  /** Phase 12 — module matrix (tiered: view < comment < edit < manage). */
  "tasks.view",
  "tasks.comment",
  "tasks.edit",
  "tasks.manage",
  "lenders.view",
  "lenders.comment",
  "lenders.edit",
  "lenders.manage",
  "ledger.view",
  "ledger.comment",
  "ledger.edit",
  "ledger.manage",
  "communications.view",
  "communications.comment",
  "communications.edit",
  "communications.manage",
  "operations.view",
  "operations.edit",
  "operations.manage",
  "reporting.view",
  "reporting.comment",
  "reporting.edit",
  "reporting.manage",
  "portals.view",
  "portals.manage",
  "documents.upload",
  "documents.delete",
  "comments.view",
  "comments.manage",
  "assignment.manage",
  "export.data",
  "financial.view",
  "revenue.view",
  "commission.view",
  "audit.view",
] as const;

export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

export const ALL_ORG_PERMISSIONS: readonly OrgPermission[] = ORG_PERMISSIONS;

const TIER_SUFFIXES = ["view", "comment", "edit", "manage"] as const;
const TIER_RANK: Record<(typeof TIER_SUFFIXES)[number], number> = {
  view: 1,
  comment: 2,
  edit: 3,
  manage: 4,
};

function modulePermissionTier(
  key: string,
): { moduleKey: string; tier: number } | null {
  const lastDot = key.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const moduleKey = key.slice(0, lastDot);
  const suffix = key.slice(lastDot + 1);
  if (!(TIER_SUFFIXES as readonly string[]).includes(suffix)) return null;
  return { moduleKey, tier: TIER_RANK[suffix as (typeof TIER_SUFFIXES)[number]] };
}

export function isOrgPermission(x: string): x is OrgPermission {
  return (ORG_PERMISSIONS as readonly string[]).includes(x);
}

/** Normalize inbound role permission strings (custom roles, imports). */
export function sanitizePermissionList(raw: readonly string[]): OrgPermission[] {
  const out: OrgPermission[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    if (!isOrgPermission(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function hasOrgPermission(
  granted: Iterable<string> | null | undefined,
  required: OrgPermission,
): boolean {
  if (granted == null) return false;
  const set = new Set(granted);
  if (set.has(required)) return true;

  if (required === "settings.view" && set.has("settings.access")) return true;
  if (required === "settings.view" && set.has("settings.manage")) return true;

  if (required === "files.view" && set.has("files.edit")) return true;
  if (required === "files.view" && set.has("files.view_all")) return true;
  if (required === "files.edit" && set.has("files.edit_all")) return true;
  if (required === "contacts.view" && set.has("contacts.manage")) return true;

  const reqTier = modulePermissionTier(required);
  if (reqTier) {
    for (const g of set) {
      const gTier = modulePermissionTier(g);
      if (
        gTier &&
        gTier.moduleKey === reqTier.moduleKey &&
        gTier.tier >= reqTier.tier
      ) {
        return true;
      }
    }
  }

  if (required === "documents.upload" && set.has("documents.delete")) {
    return true;
  }
  if (required === "comments.view" && set.has("comments.manage")) return true;

  return false;
}

/** Built-in product roles (Admin / Manager / User + Phase 12 presets). */
export const SYSTEM_ORG_ROLE_KEYS = {
  admin: "admin",
  manager: "manager",
  user: "user",
  processor: "processor",
  sales: "sales",
  viewer: "viewer",
  external_partner: "external_partner",
} as const;
