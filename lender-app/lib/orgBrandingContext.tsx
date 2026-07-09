"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useQueries, type RequestForQueries } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import {
  applyBrandingThemeVars,
  clearBrandingThemeVars,
} from "@/lib/brandingTheme";

import { APP_DISPLAY_NAME, APP_TAGLINE } from "@/lib/brandIdentity";

export const DEFAULT_APP_HEADER_TITLE = APP_DISPLAY_NAME;

type OrgBrandingUi = {
  headerTitle: string;
  logoUrl: string | null;
  subtitle: string;
};

const DEFAULT_UI: OrgBrandingUi = {
  headerTitle: DEFAULT_APP_HEADER_TITLE,
  logoUrl: null,
  subtitle: APP_TAGLINE,
};

const OrgBrandingContext = createContext<OrgBrandingUi>(DEFAULT_UI);

export function OrgBrandingProvider({ children }: { children: ReactNode }) {
  const orgScope = useOrgConvexQueryArgs();
  const hostname =
    typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";

  const brandingQueries = useMemo((): RequestForQueries => {
    const q: RequestForQueries = {};
    if (orgScope) {
      q.memberBranding = {
        query: api.organizations.brandingForMember,
        args: {
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
        },
      };
    }
    if (hostname) {
      q.hostBranding = {
        query: api.organizationCustomDomains.brandingForHostname,
        args: { hostname },
      };
    }
    return q;
  }, [orgScope, hostname]);

  const brandingResults = useQueries(brandingQueries);

  const memberRaw = orgScope ? brandingResults.memberBranding : undefined;
  const memberBranding =
    memberRaw instanceof Error ? null : memberRaw;

  const hostRaw = hostname ? brandingResults.hostBranding : undefined;
  const hostBranding = hostRaw instanceof Error ? null : hostRaw;

  const resolvedBranding = useMemo(() => {
    if (orgScope && memberBranding !== undefined && memberBranding !== null) {
      return memberBranding;
    }
    if (hostBranding !== undefined && hostBranding !== null) {
      return hostBranding;
    }
    return null;
  }, [orgScope, memberBranding, hostBranding]);

  const value = useMemo<OrgBrandingUi>(() => {
    if (!resolvedBranding) return DEFAULT_UI;
    return {
      headerTitle: resolvedBranding.headerTitle || DEFAULT_APP_HEADER_TITLE,
      logoUrl: resolvedBranding.logoUrl,
      subtitle: DEFAULT_UI.subtitle,
    };
  }, [resolvedBranding]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const memberLoading = Boolean(orgScope && memberRaw === undefined);
    const hostLoading = Boolean(hostname && hostRaw === undefined);
    if (memberLoading || hostLoading) {
      return;
    }
    if (!resolvedBranding) {
      clearBrandingThemeVars(root);
      return;
    }
    applyBrandingThemeVars(root, {
      primaryHex: resolvedBranding.primaryHex,
      secondaryHex: resolvedBranding.secondaryHex,
    });
    return () => {
      clearBrandingThemeVars(root);
    };
  }, [
    orgScope,
    hostname,
    memberBranding,
    hostBranding,
    memberRaw,
    hostRaw,
    resolvedBranding,
  ]);

  return (
    <OrgBrandingContext.Provider value={value}>
      {children}
    </OrgBrandingContext.Provider>
  );
}

export function useOrgBranding(): OrgBrandingUi {
  return useContext(OrgBrandingContext);
}
