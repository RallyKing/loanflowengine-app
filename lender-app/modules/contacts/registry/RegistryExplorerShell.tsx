"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useMobileChrome } from "@/components/MobileChromeController";

type RegistryExplorerShellProps = {
  /** Sticky command bar — rendered inside the sole vertical scrollport. */
  commandBar: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Global Registry workspace — `[data-registry-workspace-scroll]` is the only
 * vertical scroll owner on `/registry` (`AppChrome` `<main>` is `overflow-y-hidden`).
 */
export function RegistryExplorerShell({
  commandBar,
  children,
  className,
}: RegistryExplorerShellProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { registerPipelineWorkspaceScroll } = useMobileChrome();

  useEffect(() => {
    registerPipelineWorkspaceScroll(scrollRef.current);
    return () => registerPipelineWorkspaceScroll(null);
  }, [registerPipelineWorkspaceScroll]);

  return (
    <div
      className={cn("flex min-h-0 w-full flex-1 flex-col", className)}
      data-registry-workspace-sheet
      data-testid="registry-workspace-sheet"
    >
      <div
        ref={scrollRef}
        data-registry-workspace-scroll
        data-testid="registry-workspace-scroll"
        data-scroll-owner="registry-workspace"
        className={cn(
          "flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip overscroll-contain",
          "touch-scroll-y overflow-y-auto",
        )}
      >
        {commandBar}
        <div className="min-w-0 flex-1 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-8 sm:pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}