/**
 * Canonical workspace slices for {@link memberPresence} (Convex) — keep aligned with `convex/presence.ts` `workspaceSurfaceV`.
 */
export const WORKSPACE_SURFACES = [
  "pipeline_drawer",
  "file_messages",
  "lenders_panel",
  "documents",
  "comments",
  "tasks_panel",
  "financial_terms",
  "assignment",
  "hub",
] as const;

export type WorkspaceSurface = (typeof WORKSPACE_SURFACES)[number];

export function humanizeWorkspaceSurface(surface: string | undefined): string {
  if (!surface) return "";
  return surface.replace(/_/g, " ");
}
