"use client";

/**
 * File-scoped credentials for CollapsibleBlock client-assign chrome.
 * Provided by PipelineFileWorkspace so every block inherits vault actions
 * without per-block prop drilling.
 */
import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { Id } from "@/convex/_generated/dataModel";

export type ClientBlockAssignContextValue = {
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  assignedContactId?: Id<"contacts"> | null;
  readOnly?: boolean;
};

const ClientBlockAssignContext =
  createContext<ClientBlockAssignContextValue | null>(null);

export function ClientBlockAssignProvider({
  value,
  children,
}: {
  value: ClientBlockAssignContextValue;
  children: ReactNode;
}) {
  return (
    <ClientBlockAssignContext.Provider value={value}>
      {children}
    </ClientBlockAssignContext.Provider>
  );
}

export function useClientBlockAssignOptional(): ClientBlockAssignContextValue | null {
  return useContext(ClientBlockAssignContext);
}
