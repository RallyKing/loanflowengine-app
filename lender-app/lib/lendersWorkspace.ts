export const LENDER_WORKSPACE_TAB_IDS = [
  "scenario",
  "browse",
  "discover",
  "add",
  "upload",
] as const;

export type LenderWorkspaceTabId = (typeof LENDER_WORKSPACE_TAB_IDS)[number];

export const DEFAULT_LENDER_WORKSPACE_TAB: LenderWorkspaceTabId = "browse";

export function parseLenderWorkspaceTab(
  raw: string | null | undefined
): LenderWorkspaceTabId {
  if (
    raw &&
    (LENDER_WORKSPACE_TAB_IDS as readonly string[]).includes(raw)
  ) {
    return raw as LenderWorkspaceTabId;
  }
  return DEFAULT_LENDER_WORKSPACE_TAB;
}
