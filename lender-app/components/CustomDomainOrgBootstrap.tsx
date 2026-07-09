"use client";

import { ReactNode } from "react";

/**
 * Single-user mode: there is only one organization, so there is nothing to
 * "switch" when the page is loaded over a custom host. The middleware still
 * sets the host → orgId cookie used by client code that respects it. This
 * component is a passthrough kept for layout compatibility.
 */
export function CustomDomainOrgBootstrap({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
