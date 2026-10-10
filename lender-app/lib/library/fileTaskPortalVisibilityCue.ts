/**
 * Document vault file-task card glance cue for portal visibility.
 * Matches `documentVaultFileTasks.isPortalVisible` / Visible↔Hidden micro-action.
 */
export function fileTaskPortalVisibilityDataAttr(
  isPortalVisible: boolean,
): "true" | "false" {
  return isPortalVisible ? "true" : "false";
}

/** Tailwind extras for hidden (portal-internal) cards — pair with CSS stripe ::before. */
export function fileTaskPortalHiddenBorderClass(
  isPortalVisible: boolean,
): "border-dashed" | undefined {
  return isPortalVisible ? undefined : "border-dashed";
}
