/** Normalize Next/router pathnames (trailing slash, whitespace). */
export function normalizeAppPathname(
  pathname: string | null | undefined,
): string | null {
  if (pathname == null) return null;
  const trimmed = pathname.trim();
  if (!trimmed) return null;
  if (trimmed === "/") return "/";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

/** Hub, file workspace, library, licenses, intake — `/pipeline` and `/pipeline/*`. */
export function isPipelineSurfaceRoute(
  pathname: string | null | undefined,
): boolean {
  const norm = normalizeAppPathname(pathname);
  if (!norm) return false;
  return norm === "/pipeline" || norm.startsWith("/pipeline/");
}

const PIPELINE_NON_FILE_SEGMENTS = new Set([
  "library",
  "licenses",
  "intake",
  "file",
  "client",
]);

/** `/pipeline/[convexFileId]` — not hub, library, licenses, legacy intake, `/file/...`, etc. */
export function isPipelineConvexFileRoute(
  pathname: string | null | undefined,
): boolean {
  const norm = normalizeAppPathname(pathname);
  if (!norm?.startsWith("/pipeline/")) return false;
  const seg = norm.slice("/pipeline/".length).split("/")[0] ?? "";
  if (!seg || PIPELINE_NON_FILE_SEGMENTS.has(seg)) return false;
  return true;
}

/**
 * Phase 24.4K — hub + pipeline sub-routes except convex file workspace
 * (file route keeps `[data-pipeline-workspace-scroll]` unless extended later).
 */
export function isPipelineHubNativeScrollTestRoute(
  pathname: string | null | undefined,
): boolean {
  if (!isPipelineSurfaceRoute(pathname)) return false;
  return !isPipelineConvexFileRoute(pathname);
}

export function resolvePipelineHubNativeScrollTestRoute(
  pathname: string | null | undefined,
): boolean {
  if (isPipelineHubNativeScrollTestRoute(pathname)) return true;
  if (typeof window === "undefined") return false;
  return isPipelineHubNativeScrollTestRoute(window.location.pathname);
}

/**
 * Client hydration guard: Next `usePathname()` can be briefly empty while
 * `window.location.pathname` is already `/pipeline…`.
 */
export function resolvePipelineSurfaceRoute(
  pathname: string | null | undefined,
): boolean {
  if (isPipelineSurfaceRoute(pathname)) return true;
  if (typeof window === "undefined") return false;
  return isPipelineSurfaceRoute(window.location.pathname);
}
