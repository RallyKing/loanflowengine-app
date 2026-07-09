"use client";

import type { ReactNode } from "react";
import { ResponsiveNavProvider } from "@/components/navigation/ResponsiveNavProvider";
import { NavigationConfigProvider } from "@/components/navigation/NavigationConfigProvider";

const disabled =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_ADAPTIVE_NAV === "0";

/**
 * Binds Convex + local navigation preferences. Children may use `useNavigationConfig*`.
 * Set `NEXT_PUBLIC_ADAPTIVE_NAV=0` to disable syncing (catalog defaults only).
 */
export function AdaptiveNavigationController({
  accountId,
  children,
}: {
  accountId: string;
  children: ReactNode;
}) {
  if (disabled) {
    return <ResponsiveNavProvider>{children}</ResponsiveNavProvider>;
  }
  return (
    <ResponsiveNavProvider>
      <NavigationConfigProvider accountId={accountId}>
        {children}
      </NavigationConfigProvider>
    </ResponsiveNavProvider>
  );
}
