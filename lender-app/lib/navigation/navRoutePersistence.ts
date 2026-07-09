import { LS_LAST_NAV_ROUTE } from "@/lib/navigation/responsiveNavConstants";

export function recordNavRoute(pathname: string) {
  if (typeof window === "undefined" || !pathname) return;
  try {
    window.sessionStorage.setItem(LS_LAST_NAV_ROUTE, pathname);
  } catch {
    /* private mode */
  }
}

export function readLastNavRoute(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(LS_LAST_NAV_ROUTE);
  } catch {
    return null;
  }
}
