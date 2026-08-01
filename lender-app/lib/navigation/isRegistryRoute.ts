import { normalizeAppPathname } from "@/lib/navigation/isPipelineSurfaceRoute";

/** Unified contacts workspace — `/contacts` list and legacy `/registry` redirect target. */
export function isRegistryRoute(
  pathname: string | null | undefined,
): boolean {
  const norm = normalizeAppPathname(pathname);
  if (!norm) return false;
  if (norm === "/contacts") return true;
  if (norm === "/registry" || norm.startsWith("/registry/")) return true;
  return false;
}

export function resolveRegistryRoute(
  pathname: string | null | undefined,
): boolean {
  if (isRegistryRoute(pathname)) return true;
  if (typeof window === "undefined") return false;
  return isRegistryRoute(window.location.pathname);
}
