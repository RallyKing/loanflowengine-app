import { normalizeAppPathname } from "@/lib/navigation/isPipelineSurfaceRoute";

/** Unified registry explorer — `/registry` and nested paths. */
export function isRegistryRoute(
  pathname: string | null | undefined,
): boolean {
  const norm = normalizeAppPathname(pathname);
  if (!norm) return false;
  return norm === "/registry" || norm.startsWith("/registry/");
}

export function resolveRegistryRoute(
  pathname: string | null | undefined,
): boolean {
  if (isRegistryRoute(pathname)) return true;
  if (typeof window === "undefined") return false;
  return isRegistryRoute(window.location.pathname);
}
