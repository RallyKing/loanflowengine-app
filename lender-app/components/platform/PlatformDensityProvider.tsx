"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { PlatformDensity } from "@/lib/platform-framework";

const DensityContext = createContext<PlatformDensity>("comfortable");

export function PlatformDensityProvider({
  value,
  children,
}: {
  value: PlatformDensity;
  children: ReactNode;
}) {
  return (
    <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
  );
}

export function usePlatformDensity(): PlatformDensity {
  return useContext(DensityContext);
}
