"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useMobileChrome } from "@/components/MobileChromeController";
import { ContactsScrollContext } from "@/modules/contacts/workspace/ContactsScrollContext";

type ContactsExplorerShellProps = {
  commandBar: ReactNode;
  children: ReactNode;
  sidePanel?: ReactNode;
  className?: string;
  onScrollContainerReady?: (el: HTMLDivElement | null) => void;
};

/**
 * Contacts workspace — outer shell is height-locked; table and inspector panel
 * each own independent `overflow-y-auto` scrollports on `/contacts`.
 */
export function ContactsExplorerShell({
  commandBar,
  children,
  sidePanel,
  className,
  onScrollContainerReady,
}: ContactsExplorerShellProps) {
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { registerPipelineWorkspaceScroll } = useMobileChrome();

  useEffect(() => {
    registerPipelineWorkspaceScroll(tableScrollRef.current);
    onScrollContainerReady?.(tableScrollRef.current);
    return () => {
      registerPipelineWorkspaceScroll(null);
      onScrollContainerReady?.(null);
    };
  }, [registerPipelineWorkspaceScroll, onScrollContainerReady]);

  return (
    <ContactsScrollContext.Provider value={tableScrollRef}>
      <div
        className={cn(
          "flex min-h-0 w-full flex-1 flex-col overflow-hidden",
          className,
        )}
        data-contacts-workspace-sheet
        data-registry-workspace-sheet
        data-testid="contacts-workspace-sheet"
      >
        <div className="shrink-0">{commandBar}</div>

        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div
            ref={tableScrollRef}
            data-contacts-workspace-scroll
            data-contacts-table-scroll
            data-registry-workspace-scroll
            data-testid="contacts-workspace-scroll"
            data-scroll-owner="contacts-workspace"
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overscroll-contain",
              "touch-scroll-y overflow-y-auto",
              sidePanel && "lg:min-w-0",
            )}
          >
            <div className="min-h-0 min-w-0 flex-1 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-8 sm:pt-4">
              {children}
            </div>
          </div>

          {sidePanel ? (
            <>
              <div
                className="pointer-events-none absolute inset-0 z-40 bg-dlc-scrim/40 lg:hidden"
                aria-hidden
              />
              <div
                data-testid="contacts-inspector-scroll"
                className={cn(
                  "z-50 flex min-h-0 shrink-0 flex-col overflow-hidden bg-dlc-surface",
                  "border-l border-border/60 shadow-dlc-3",
                  "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:w-[min(100vw,28rem)]",
                  "lg:relative lg:h-full lg:w-[500px] xl:w-[600px] 2xl:w-[700px]",
                )}
              >
                {sidePanel}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </ContactsScrollContext.Provider>
  );
}
