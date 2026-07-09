import { readHostMappedOrganizationIdFromDocument } from "@/lib/hostOrgCookie";

/**
 * Safe, client-only snapshot for diagnosing org RBAC / Convex mismatches.
 * No secrets — only public env and browser-visible scope hints.
 */
export function getOrgRbacRuntimeSnapshot(viewerOrgId: string | null | undefined): {
  origin: string | null;
  pathname: string | null;
  nextPublicConvexUrl: string | null;
  convexHost: string | null;
  hostMappedOrgId: string | null;
  storedActiveOrganizationId: string | null;
  viewerOrgId: string | null;
  orgRbacDebug: boolean;
} {
  const nextPublicConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? null;
  let convexHost: string | null = null;
  if (nextPublicConvexUrl) {
    try {
      convexHost = new URL(nextPublicConvexUrl).host;
    } catch {
      convexHost = null;
    }
  }

  let origin: string | null = null;
  let pathname: string | null = null;
  let storedActiveOrganizationId: string | null = null;
  if (typeof window !== "undefined") {
    origin = window.location.origin;
    pathname = window.location.pathname;
    try {
      storedActiveOrganizationId =
        window.localStorage.getItem("lender.activeOrganizationId")?.trim() || null;
    } catch {
      storedActiveOrganizationId = null;
    }
  }

  return {
    origin,
    pathname,
    nextPublicConvexUrl,
    convexHost,
    hostMappedOrgId: readHostMappedOrganizationIdFromDocument(),
    storedActiveOrganizationId,
    viewerOrgId: viewerOrgId ?? null,
    orgRbacDebug: process.env.NEXT_PUBLIC_ORG_RBAC_DEBUG === "1",
  };
}

/** `window` helper for manual troubleshooting (only when debug flag is on). */
export function installOrgRbacDebugWindowApi(): void {
  if (typeof window === "undefined") return;
  if (process.env.NEXT_PUBLIC_ORG_RBAC_DEBUG !== "1") return;
  const w = window as Window & {
    __lenderOrgRbacDebug?: {
      snapshot: (viewerOrgId?: string | null) => ReturnType<
        typeof getOrgRbacRuntimeSnapshot
      >;
      clearStoredActiveOrg: () => void;
    };
  };
  w.__lenderOrgRbacDebug = {
    snapshot: (oid) => getOrgRbacRuntimeSnapshot(oid ?? null),
    clearStoredActiveOrg: () => {
      try {
        window.localStorage.removeItem("lender.activeOrganizationId");
        window.dispatchEvent(new CustomEvent("lender-active-org-changed"));
      } catch {
        /* ignore */
      }
    },
  };
}
