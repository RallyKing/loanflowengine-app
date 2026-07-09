import type { NavCatalogEntry } from "@/lib/navigation/navigationCatalog";
import { hasOrgPermission, type OrgPermission } from "@/lib/orgRbac";

/**
 * Minimum org permission to surface a catalog id in navigation.
 * Omitted ids are not filtered by RBAC (still subject to preset / org policy).
 */
export const NAV_CATALOG_PERMISSION: Partial<
  Record<string, OrgPermission>
> = {
  tasks: "files.view",
  contacts: "contacts.view",
  documents: "files.view",
  activity: "files.view",
  shared: "files.view",
  operations: "files.view",
  pipeline: "files.view",
  lenders: "contacts.view",
  settings: "settings.access",
};

export function navCatalogIdAllowed(
  id: string,
  granted: readonly string[] | null | undefined,
): boolean {
  const need = NAV_CATALOG_PERMISSION[id];
  if (!need) return true;
  if (!granted) return true;
  return hasOrgPermission(granted, need);
}

export function navCatalogEntryAllowed(
  entry: NavCatalogEntry,
  granted: readonly string[] | null | undefined,
): boolean {
  return navCatalogIdAllowed(entry.id, granted);
}
