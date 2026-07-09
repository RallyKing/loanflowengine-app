export type ResourceAccessBannerMode = "none" | "view" | "edit" | "co_owner";

export const VIEW_ONLY_ACCESS_TOOLTIP = "View only access";

export type ResourceAccessUxValue = {
  readOnly: boolean;
  bannerMode: ResourceAccessBannerMode;
  ownerDisplayUsername: string;
  viewOnlyTooltip: string;
};

export const DEFAULT_RESOURCE_ACCESS_UX: ResourceAccessUxValue = {
  readOnly: false,
  bannerMode: "none",
  ownerDisplayUsername: "",
  viewOnlyTooltip: VIEW_ONLY_ACCESS_TOOLTIP,
};

export function resourceAccessFromViewerAccess(
  viewer:
    | {
        bannerMode: ResourceAccessBannerMode;
        ownerDisplayUsername: string;
      }
    | null
    | undefined,
): ResourceAccessUxValue {
  if (!viewer) return DEFAULT_RESOURCE_ACCESS_UX;
  return {
    readOnly: viewer.bannerMode === "view",
    bannerMode: viewer.bannerMode ?? "none",
    ownerDisplayUsername: viewer.ownerDisplayUsername,
    viewOnlyTooltip: VIEW_ONLY_ACCESS_TOOLTIP,
  };
}
