"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  DEFAULT_RESOURCE_ACCESS_UX,
  type ResourceAccessUxValue,
} from "@/lib/resourceAccessUx";

const ResourceAccessContext = createContext<ResourceAccessUxValue>(
  DEFAULT_RESOURCE_ACCESS_UX,
);

export function ResourceAccessProvider({
  value,
  children,
}: {
  value: ResourceAccessUxValue;
  children: ReactNode;
}) {
  return (
    <ResourceAccessContext.Provider value={value}>
      {children}
    </ResourceAccessContext.Provider>
  );
}

export function useResourceAccess(): ResourceAccessUxValue {
  return useContext(ResourceAccessContext);
}
