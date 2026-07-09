"use client";

import type { ReactNode } from "react";
import { useNavigationBreakpoint } from "@/components/navigation/useNavigationBreakpoint";

export type NavigationBreakpoint = ReturnType<
  typeof useNavigationBreakpoint
>;

/** Pure layout switch — pass branch render props; does not introduce scroll containers. */
export function ResponsiveNavigationLayout({
  mobile,
  tablet,
  desktop,
  breakpoint: breakpointProp,
}: {
  mobile: ReactNode;
  tablet: ReactNode;
  desktop: ReactNode;
  /** Optional controlled breakpoint (e.g. settings preview). */
  breakpoint?: NavigationBreakpoint;
}) {
  const detected = useNavigationBreakpoint();
  const bp = breakpointProp ?? detected;
  if (bp === "mobile") return <>{mobile}</>;
  if (bp === "tablet") return <>{tablet}</>;
  return <>{desktop}</>;
}
