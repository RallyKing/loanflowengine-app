import type { ContactsWorkspaceFilters } from "@/lib/contacts/contactsWorkspaceFilters";
import { DEFAULT_CONTACTS_WORKSPACE_FILTERS } from "@/lib/contacts/contactsWorkspaceFilters";

export type ContactsSmartList = {
  id: string;
  label: string;
  filters: ContactsWorkspaceFilters;
};

const STORAGE_KEY = "dlc-contacts-smart-lists-v1";

const BUILTIN_LISTS: ContactsSmartList[] = [
  {
    id: "all",
    label: "All Contacts",
    filters: { ...DEFAULT_CONTACTS_WORKSPACE_FILTERS },
  },
  {
    id: "linked",
    label: "Linked to Files",
    filters: {
      ...DEFAULT_CONTACTS_WORKSPACE_FILTERS,
      linkStatusFilters: ["linked"],
    },
  },
  {
    id: "recent",
    label: "Recently Active",
    filters: {
      ...DEFAULT_CONTACTS_WORKSPACE_FILTERS,
      activityFrom: Date.now() - 30 * 24 * 60 * 60 * 1000,
    },
  },
];

type StoredPayload = {
  orgId: string;
  lists: ContactsSmartList[];
  activeListId: string;
};

function readRaw(): StoredPayload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredPayload[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(payload: StoredPayload[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode */
  }
}

export function loadContactsSmartLists(
  organizationId: string,
): { lists: ContactsSmartList[]; activeListId: string } {
  const stored = readRaw().find((p) => p.orgId === organizationId);
  if (!stored) {
    return { lists: BUILTIN_LISTS, activeListId: "all" };
  }
  const merged = [
    ...BUILTIN_LISTS,
    ...stored.lists.filter((l) => !BUILTIN_LISTS.some((b) => b.id === l.id)),
  ];
  return {
    lists: merged,
    activeListId: stored.activeListId || "all",
  };
}

export function saveContactsSmartLists(
  organizationId: string,
  lists: ContactsSmartList[],
  activeListId: string,
): void {
  const custom = lists.filter((l) => !BUILTIN_LISTS.some((b) => b.id === l.id));
  const all = readRaw().filter((p) => p.orgId !== organizationId);
  all.push({ orgId: organizationId, lists: custom, activeListId });
  writeRaw(all);
}

export function createSmartListFromFilters(
  label: string,
  filters: ContactsWorkspaceFilters,
): ContactsSmartList {
  return {
    id: `custom-${Date.now()}`,
    label: label.trim() || "Custom list",
    filters: { ...filters },
  };
}
