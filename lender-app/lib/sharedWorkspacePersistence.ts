import { parseJsonUnknown } from "@/lib/safeJson";

/** Client-side mirror of `sharedWorkspace.listFeed` rows. */
export type SharedWorkspaceFeedRow = {
  shareId: string;
  resourceType: "task" | "pipeline";
  resourceId: string;
  title: string;
  permission: "view" | "edit";
  ownerUserId: string;
  ownerDisplayUsername: string;
  ownershipLine: string;
  ownershipBadge: "owner" | "shared_view" | "shared_edit" | null;
  sharedUserId: string;
  sharedDisplayUsername: string;
  updatedAt: number;
};

export type SharedResourceTypeFilter = "all" | "task" | "pipeline";
export type SharedPermissionFilter = "all" | "view" | "edit";

export type SharedWorkspaceFilterSnapshot = {
  v: 1;
  resourceType: SharedResourceTypeFilter;
  ownerUserId: string;
  recipientUserId: string;
  permission: SharedPermissionFilter;
  recentlyUpdatedOnly: boolean;
};

export const SHARED_WORKSPACE_FILTERS_KEY = "dlc.shared.workspace.filters.v1";

export const DEFAULT_SHARED_FILTERS: SharedWorkspaceFilterSnapshot = {
  v: 1,
  resourceType: "all",
  ownerUserId: "",
  recipientUserId: "",
  permission: "all",
  recentlyUpdatedOnly: false,
};

export function loadSharedWorkspaceFilters(): SharedWorkspaceFilterSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SHARED_WORKSPACE_FILTERS_KEY);
    if (!raw) return null;
    const parsed = parseJsonUnknown(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (o.v !== 1) return null;
    const resourceType = o.resourceType;
    const permission = o.permission;
    return {
      v: 1,
      resourceType:
        resourceType === "task" || resourceType === "pipeline"
          ? resourceType
          : "all",
      ownerUserId:
        typeof o.ownerUserId === "string" ? o.ownerUserId.trim() : "",
      recipientUserId:
        typeof o.recipientUserId === "string" ? o.recipientUserId.trim() : "",
      permission:
        permission === "view" || permission === "edit" ? permission : "all",
      recentlyUpdatedOnly: o.recentlyUpdatedOnly === true,
    };
  } catch {
    return null;
  }
}

export function saveSharedWorkspaceFilters(
  snapshot: SharedWorkspaceFilterSnapshot,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SHARED_WORKSPACE_FILTERS_KEY,
      JSON.stringify(snapshot),
    );
  } catch {
    /* ignore quota */
  }
}

export function applySharedWorkspaceFilters(
  rows: SharedWorkspaceFeedRow[],
  filters: SharedWorkspaceFilterSnapshot,
  now = Date.now(),
): SharedWorkspaceFeedRow[] {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return rows.filter((row) => {
    if (filters.resourceType !== "all" && row.resourceType !== filters.resourceType) {
      return false;
    }
    if (filters.ownerUserId && row.ownerUserId !== filters.ownerUserId) {
      return false;
    }
    if (filters.recipientUserId && row.sharedUserId !== filters.recipientUserId) {
      return false;
    }
    if (filters.permission !== "all" && row.permission !== filters.permission) {
      return false;
    }
    if (filters.recentlyUpdatedOnly && now - row.updatedAt > sevenDaysMs) {
      return false;
    }
    return true;
  });
}
