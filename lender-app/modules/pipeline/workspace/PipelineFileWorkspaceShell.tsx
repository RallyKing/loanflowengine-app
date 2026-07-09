"use client";

import { type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { WorkspaceContentContainer } from "@/components/WorkspaceContentContainer";
import { PipelineWorkspaceSection } from "@/components/PipelineWorkspaceSection";
import {
  PipelineWorkspaceMobileVaulFrame,
  useWorkspaceSheetSnap,
  type WorkspaceSheetSnap,
} from "@/components/PipelineWorkspaceMobileVaulFrame";
import { MobileBottomNavScrollSpacer } from "@/components/layout/MobileBottomNavScrollSpacer";
import { pipelineWorkspaceSurfaceShell } from "@/lib/pipelineWorkspaceCard";

/** Vertical rhythm between major workspace regions (below file chrome). */
export const pipelineFileShellStackClass = "flex flex-col gap-4";

type PipelineFileWorkspaceShellProps = {
  isSnoozed: boolean;
  bannerAriaLabel: string;
  /** Snap header: navigation, title, status row, primary actions (non-scrolling). */
  chrome?: ReactNode | null;
  /** Sticky ACL banner (view / edit share) below file chrome header. */
  accessBanner?: ReactNode | null;
  /** Non-scrolling region between file chrome and scroll body (e.g. pinned tab nav). */
  pinnedLead?: ReactNode | null;
  /** 7-tab file workspace — sole scroll body content (Phase 38.14). */
  scrollLead?: ReactNode | null;
  /** Nested inside client workspace file card — skip Vaul + outer chrome header. */
  embedded?: boolean;
};

/**
 * Pipeline file **workspace sheet**: non-scrolling snap header + isolated scroll body.
 *
 * - **Scroll owner:** `[data-pipeline-workspace-scroll]` — not `AppChrome` `<main>`
 *   on this route (`<main>` is `overflow-y-hidden` + flex shell).
 * - **Mobile snap sheet:** `PipelineWorkspaceMobileVaulFrame` (Vaul, `direction="top"`).
 * - **Snap header:** fixed-size `shrink-0` banner above the scroller (no scroll-linked transforms).
 */
function PipelineFileWorkspaceShellInner({
  isSnoozed,
  bannerAriaLabel,
  chrome,
  accessBanner,
  pinnedLead,
  scrollLead,
  embedded = false,
}: PipelineFileWorkspaceShellProps) {
  const sheetSnap = useWorkspaceSheetSnap();
  const snapAttr: WorkspaceSheetSnap = sheetSnap?.snap ?? "expanded";
  const showChromeHeader = Boolean(chrome) && !embedded;

  const scrollBody = (
    <>
      {accessBanner ? (
        <div
          className={cn(
            "shrink-0 border-b border-transparent bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80",
            !embedded &&
              "sticky top-0 z-[calc(var(--pipeline-file-sticky-z,20)+2)]",
          )}
        >
          {accessBanner}
        </div>
      ) : null}
      {scrollLead ? (
        <div
          className={cn(
            "min-w-0",
            embedded
              ? "pb-2 pt-1"
              : "pb-[max(1rem,env(safe-area-inset-bottom))] pt-0.5 sm:pt-1",
          )}
        >
          {scrollLead}
        </div>
      ) : null}
      {embedded ? null : <MobileBottomNavScrollSpacer variant="file" />}
    </>
  );

  return (
    <div
      data-pipeline-workspace-sheet
      data-pipeline-file-workspace-shell
      data-workspace-snap={snapAttr}
      data-pipeline-file-workspace-embedded={embedded ? "true" : undefined}
      className={cn(
        "relative flex w-full min-w-0 max-w-full flex-col gap-0",
        !embedded && "min-h-0",
      )}
    >
      {showChromeHeader ? (
        <header
          className={cn(
            "z-[var(--pipeline-file-sticky-z)] box-border w-full shrink-0 border-b border-border/70 supports-[overflow-anchor:auto]:[overflow-anchor:none]",
            "max-sm:pt-[max(0.5rem,env(safe-area-inset-top))]",
            isSnoozed
              ? "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/80"
              : "bg-background",
          )}
          role="banner"
          aria-label={bannerAriaLabel}
          data-mobile-workspace-chrome="expanded"
        >
          <WorkspaceContentContainer
            width="standard"
            className="pointer-events-auto py-1 sm:py-1.5"
          >
            <PipelineWorkspaceSection
              htmlId="pipeline-ws-file-chrome"
              sectionId="file-chrome"
              sectionType="chrome"
              sectionLabel="File chrome"
              className="pointer-events-none"
              contentClassName="pointer-events-auto min-w-0"
            >
              <div className="min-w-0">{chrome}</div>
            </PipelineWorkspaceSection>
          </WorkspaceContentContainer>
        </header>
      ) : null}

      {pinnedLead && !embedded ? (
        <div
          className="shrink-0 supports-[overflow-anchor:auto]:[overflow-anchor:none]"
          data-pipeline-file-workspace-pinned-lead
          data-testid="pipeline-file-workspace-pinned-lead"
        >
          {pinnedLead}
        </div>
      ) : null}

      {embedded ? (
        <div className="w-full min-w-0 overflow-x-clip">{scrollBody}</div>
      ) : (
        <div
          data-pipeline-workspace-scroll
          data-testid="pipeline-workspace-scroll"
          data-vaul-no-drag
          className={cn(
            "min-h-0 w-full min-w-0 flex-1 overflow-x-clip overscroll-contain",
            "touch-scroll-y overflow-y-auto",
          )}
        >
          {scrollBody}
        </div>
      )}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 hidden"
        data-pipeline-workspace-overlay-layer
      />
    </div>
  );
}

export function PipelineFileWorkspaceShell(props: PipelineFileWorkspaceShellProps) {
  if (props.embedded) {
    return <PipelineFileWorkspaceShellInner {...props} />;
  }
  return (
    <PipelineWorkspaceMobileVaulFrame>
      <PipelineFileWorkspaceShellInner {...props} />
    </PipelineWorkspaceMobileVaulFrame>
  );
}

/** Shared card language for workspace regions (legacy drawer helpers). */
export function PipelineFileWorkspaceSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(pipelineWorkspaceSurfaceShell(), className)}>
      {children}
    </div>
  );
}
