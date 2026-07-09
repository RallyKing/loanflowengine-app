/**
 * Virtualization contract — hubs and long lists MUST attach to the **route scroll owner**
 * (`[data-app-main-scroll]` / `AppChrome` `<main>`) unless the route delegates (pipeline file).
 *
 * @see `PipelineHubVirtualizedLists` — reference implementation.
 */

export const APP_MAIN_SCROLL_SELECTOR = "[data-app-main-scroll]" as const;
export const PIPELINE_WORKSPACE_SCROLL_SELECTOR =
  "[data-pipeline-workspace-scroll]" as const;

/** Resolve primary vertical scroll parent for @tanstack/react-virtual `getScrollElement`. */
export function getDefaultAppMainScrollElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (document.documentElement.hasAttribute("data-native-document-scroll")) {
    return document.documentElement;
  }
  return document.querySelector<HTMLElement>(APP_MAIN_SCROLL_SELECTOR);
}

export type VirtualizationAnchor =
  | "app_main"
  | "pipeline_workspace"
  | "custom";

export function getScrollElementForAnchor(
  anchor: VirtualizationAnchor,
  custom?: () => HTMLElement | null,
): () => HTMLElement | null {
  switch (anchor) {
    case "app_main":
      return getDefaultAppMainScrollElement;
    case "pipeline_workspace":
      return () =>
        typeof document === "undefined"
          ? null
          : document.querySelector<HTMLElement>(PIPELINE_WORKSPACE_SCROLL_SELECTOR);
    case "custom":
      return custom ?? getDefaultAppMainScrollElement;
    default:
      return getDefaultAppMainScrollElement;
  }
}
