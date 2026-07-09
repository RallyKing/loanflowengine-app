"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Id } from "@/convex/_generated/dataModel";

const DealWorkspaceAiContext = createContext<{
  fileId: Id<"pipeline"> | null;
}>({ fileId: null });

export function DealWorkspaceAiProvider({
  fileId,
  children,
}: {
  fileId: Id<"pipeline">;
  children: ReactNode;
}) {
  return (
    <DealWorkspaceAiContext.Provider value={{ fileId }}>
      {children}
    </DealWorkspaceAiContext.Provider>
  );
}

export function useDealWorkspaceFileId(): Id<"pipeline"> | null {
  return useContext(DealWorkspaceAiContext).fileId;
}
