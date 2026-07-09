"use client";

import { useEffect, type ReactNode } from "react";
import { OperationalConfirmProvider } from "@/components/ui/OperationalConfirmDialog";
import { installConfirmOverlayDebug } from "@/lib/ui/confirmOverlayDebug";

/**
 * App-wide overlay ownership — mounted outside AppChrome so confirms never
 * inherit pipeline row / workspace flex or overflow contexts.
 */
export function GlobalOverlayProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    installConfirmOverlayDebug();
  }, []);

  return <OperationalConfirmProvider>{children}</OperationalConfirmProvider>;
}
