"use client";

import { ReactNode, useLayoutEffect, useMemo } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { createConvexBrowserLogger } from "@/lib/convexBrowserLogger";
import {
  readConvexVerboseFlag,
  startConvexSubDiagnosticsSummary,
} from "@/lib/convexSubDiagnostics";
import { installConvexCostReportApi } from "@/lib/convexCostGovernance";
import { installWriteStormReportApi } from "@/lib/convexWriteStormGovernance";
import { useConvexSubMountTrace } from "@/lib/convexSubDiagnosticsHooks";
import { parseConvexPublicUrl } from "@/lib/convexPublicUrl";
import { LiveConnectionProvider } from "@/lib/liveConnection";
import { OfflineSyncProvider } from "@/lib/offline/OfflineSyncContext";
import { purgeLegacyAuthBrowserStorageIfNeeded } from "@/lib/storage/purgeLegacyAuthBrowserStorage";
import { ConvexConfigMissing } from "./ConvexConfigMissing";
import { CustomDomainOrgBootstrap } from "@/components/CustomDomainOrgBootstrap";
import { useConvexWorkspaceAuth } from "@/lib/useConvexWorkspaceAuth";

function ConvexClientReady({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  const client = useMemo(() => {
    const verbose = readConvexVerboseFlag();
    try {
      return new ConvexReactClient(url, {
        logger: createConvexBrowserLogger({ verbose }),
        verbose,
      });
    } catch {
      return null;
    }
  }, [url]);

  useConvexSubMountTrace("ConvexClientProvider");

  useLayoutEffect(() => {
    purgeLegacyAuthBrowserStorageIfNeeded();
  }, []);

  useLayoutEffect(() => {
    installConvexCostReportApi();
    installWriteStormReportApi();
    return startConvexSubDiagnosticsSummary(30_000);
  }, []);

  if (client === null) {
    return (
      <ConvexConfigMissing
        variant="invalid"
        detail="Could not initialize the Convex client for this URL."
      />
    );
  }

  return (
    <ConvexProviderWithAuth client={client} useAuth={useConvexWorkspaceAuth}>
      <LiveConnectionProvider>
        <OfflineSyncProvider>
          <CustomDomainOrgBootstrap>{children}</CustomDomainOrgBootstrap>
        </OfflineSyncProvider>
      </LiveConnectionProvider>
    </ConvexProviderWithAuth>
  );
}

/**
 * Wraps the app with Convex. Missing or invalid `NEXT_PUBLIC_CONVEX_URL`
 * renders a styled configuration screen instead of throwing.
 *
 * Auth: native cookie session bridged to Convex via RS256 JWT (`useConvexWorkspaceAuth`).
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const parsed = parseConvexPublicUrl(process.env.NEXT_PUBLIC_CONVEX_URL);
  if (!parsed.ok) {
    if (parsed.reason === "missing") {
      return <ConvexConfigMissing variant="missing" />;
    }
    return <ConvexConfigMissing variant="invalid" detail={parsed.detail} />;
  }
  return <ConvexClientReady url={parsed.href}>{children}</ConvexClientReady>;
}
