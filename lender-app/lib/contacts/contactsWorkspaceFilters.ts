/** Filter state persisted in smart lists and the active workspace session. */
export type ContactsLinkStatusFilter = "linked" | "unlinked" | "partial";

export type ContactsWorkspaceFilters = {
  search: string;
  typeFilters: Array<"contact" | "entity" | "lender">;
  roleFilters: string[];
  linkStatusFilters: ContactsLinkStatusFilter[];
  tagFilters: string[];
  /** Inclusive start of last-activity range (epoch ms). */
  activityFrom?: number;
  /** Inclusive end of last-activity range (epoch ms). */
  activityTo?: number;
};

export const DEFAULT_CONTACTS_WORKSPACE_FILTERS: ContactsWorkspaceFilters = {
  search: "",
  typeFilters: [],
  roleFilters: [],
  linkStatusFilters: [],
  tagFilters: [],
};

export function contactsFiltersAreEqual(
  a: ContactsWorkspaceFilters,
  b: ContactsWorkspaceFilters,
): boolean {
  return (
    a.search === b.search &&
    a.typeFilters.join() === b.typeFilters.join() &&
    a.roleFilters.join() === b.roleFilters.join() &&
    a.linkStatusFilters.join() === b.linkStatusFilters.join() &&
    a.tagFilters.join() === b.tagFilters.join() &&
    a.activityFrom === b.activityFrom &&
    a.activityTo === b.activityTo
  );
}

export function countActiveContactsFilters(f: ContactsWorkspaceFilters): number {
  let n = 0;
  if (f.search.trim()) n += 1;
  if (f.typeFilters.length) n += 1;
  if (f.roleFilters.length) n += 1;
  if (f.linkStatusFilters.length) n += 1;
  if (f.tagFilters.length) n += 1;
  if (f.activityFrom != null || f.activityTo != null) n += 1;
  return n;
}
