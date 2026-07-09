import type { Doc } from "./_generated/dataModel";

/**
 * When multiple rows match `by_org_user` (data races / legacy duplicates),
 * `.unique()` throws a Convex server error. Prefer the newest document.
 */
export function pickCanonicalOrgMember(
  rows: Doc<"organizationMembers">[],
): Doc<"organizationMembers"> | null {
  if (rows.length === 0) return null;
  let best = rows[0]!;
  for (let i = 1; i < rows.length; i++) {
    const cur = rows[i]!;
    if (cur._creationTime > best._creationTime) best = cur;
  }
  return best;
}

/** Same pattern for duplicate preset rows (`by_organization_key`). */
export function pickCanonicalOrgRole(
  rows: Doc<"organizationRoles">[],
): Doc<"organizationRoles"> | null {
  if (rows.length === 0) return null;
  let best = rows[0]!;
  for (let i = 1; i < rows.length; i++) {
    const cur = rows[i]!;
    if (cur._creationTime > best._creationTime) best = cur;
  }
  return best;
}
