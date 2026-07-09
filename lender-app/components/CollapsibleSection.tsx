"use client";

import { useEffect, useId, useState, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  pipelineWorkspaceCardFrame,
  pipelineWorkspaceCardBodyPadding,
  pipelineWorkspaceCardHeaderPadding,
  pipelineWorkspaceChevronTransition,
  pipelineWorkspaceCollapseGrid,
  pipelineWorkspaceCollapseClosed,
  pipelineWorkspaceCollapseInner,
  pipelineWorkspaceCollapseOpen,
} from "@/lib/pipelineWorkspaceCard";
import {
  premiumCardBodyPaddingClass,
  premiumCardDividerClass,
  premiumCardHeaderPaddingClass,
} from "@/lib/pipeline/premiumWorkspaceUi";

type Props = {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Extra controls in the header row (before the chevron), e.g. Add. */
  headerRight?: React.ReactNode;
  defaultOpen?: boolean;
  /** Controlled mode — when both are set, internal open state is ignored. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Animate height when expanding/collapsing (respects motion-reduce). */
  animated?: boolean;
  /**
   * When set with `animated`, body content is not mounted until the first
   * time the section opens (then stays mounted so collapse animation still works).
   * Reduces work for many collapsed drawer blocks on large files.
   */
  lazyMount?: boolean;
  variant?: "plain" | "card" | "danger";
  /** Card variant body/header padding — `premium` uses Phase 38 p-6 rhythm. */
  cardPadding?: "default" | "premium";
  className?: string;
  contentClassName?: string;
  /** Merged into card header row (padding, transitions). */
  headerClassName?: string;
  /** Merged into the title/chevron trigger button (min-height, rounding). */
  headerTriggerClassName?: string;
  /** Merged into the description block when present. */
  descriptionClassName?: string;
  children: React.ReactNode;
};

export function CollapsibleSection({
  title,
  description,
  headerRight,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  animated = false,
  lazyMount = false,
  variant = "card",
  cardPadding = "default",
  className,
  contentClassName,
  headerClassName,
  headerTriggerClassName,
  descriptionClassName,
  children,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const controlled =
    controlledOpen !== undefined && onOpenChange !== undefined;
  const open = controlled ? controlledOpen : internalOpen;
  /** Header click: flip state (functional update avoids stale closures for uncontrolled mode). */
  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    const next = !open;
    if (controlled) onOpenChange!(next);
    else setInternalOpen(next);
  };

  const [lazyBodyMounted, setLazyBodyMounted] = useState(() => {
    if (!lazyMount) return true;
    const initialOpen = controlled ? Boolean(controlledOpen) : defaultOpen;
    return initialOpen;
  });
  useEffect(() => {
    if (!lazyMount) return;
    if (open) setLazyBodyMounted(true);
  }, [lazyMount, open]);

  const resolvedChildren = !lazyMount || lazyBodyMounted ? children : null;

  const uid = useId();
  const panelId = `${uid}-panel`;

  const animatedShell = (inner: React.ReactNode) => {
    if (!animated) {
      return open ? (
        <div id={panelId} role="region" aria-hidden={false}>
          {inner}
        </div>
      ) : null;
    }
    return (
      <div
        className={cn(
          pipelineWorkspaceCollapseGrid,
          open ? pipelineWorkspaceCollapseOpen : pipelineWorkspaceCollapseClosed,
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            pipelineWorkspaceCollapseInner,
            !open && "opacity-0",
          )}
        >
          <div
            id={panelId}
            role="region"
            aria-hidden={!open}
            className={cn(!open && "pointer-events-none")}
          >
            {inner}
          </div>
        </div>
      </div>
    );
  };

  if (variant === "plain") {
    return (
      <div
        className={cn(
          "border-b border-border/60 pb-4 last:border-b-0",
          className
        )}
      >
        <div className="mb-2 flex w-full items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--ui-label)]">
              {title}
            </div>
            {description && (
              <p
                className={cn(
                  "mt-0.5 text-xs text-[color:var(--ui-label)]",
                  !open && "max-sm:hidden",
                )}
              >
                {description}
              </p>
            )}
          </div>
          {headerRight}
          <button
            type="button"
            onClick={toggle}
            className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            aria-expanded={open}
            aria-controls={panelId}
            title={open ? "Collapse" : "Expand"}
          >
            <ChevronDown
              className={cn(
                "h-5 w-5",
                pipelineWorkspaceChevronTransition,
                open && "rotate-180"
              )}
              aria-hidden
            />
          </button>
        </div>
        {animatedShell(
          <div className={cn("space-y-3", contentClassName)}>
            {resolvedChildren}
          </div>
        )}
      </div>
    );
  }

  const danger = variant === "danger";
  const titleString = typeof title === "string";
  const cardBodyPadding =
    cardPadding === "premium"
      ? premiumCardBodyPaddingClass
      : pipelineWorkspaceCardBodyPadding;
  const cardHeaderPadding =
    cardPadding === "premium"
      ? premiumCardHeaderPaddingClass
      : pipelineWorkspaceCardHeaderPadding;

  const innerCard = (
    <div
      className={cn(
        "border-t",
        cardPadding === "premium"
          ? premiumCardDividerClass
          : "border-border/60",
        cardBodyPadding,
        contentClassName,
      )}
    >
      {resolvedChildren}
    </div>
  );

  return (
    <div
      className={cn(
        pipelineWorkspaceCardFrame(),
        "w-full min-w-0 max-w-full border",
        danger
          ? "border-destructive/30 bg-destructive/[0.07] dark:border-destructive/40 dark:bg-destructive/10"
          : "border-[color:var(--ui-block-color)] bg-background",
        className,
      )}
    >
      <div
        className={cn(
          "flex w-full min-w-0 touch-manipulation gap-2 sm:items-start",
          cardHeaderPadding,
          headerClassName,
          danger
            ? "hover:bg-destructive/[0.12] dark:hover:bg-destructive/15"
            : "hover:bg-muted/25"
        )}
      >
        <div className="min-w-0 flex-1 space-y-1 sm:space-y-1.5">
          <div className="flex w-full min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              className={cn(
                "flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg text-left touch-manipulation",
                "active:bg-muted/40 sm:min-h-0 sm:items-start sm:rounded-md sm:active:bg-transparent",
                headerTriggerClassName,
                danger && "active:bg-destructive/15 sm:active:bg-transparent",
              )}
              aria-expanded={open}
              aria-controls={panelId}
            >
              <div
                className={cn(
                  "min-w-0 self-center sm:self-start sm:pt-0.5",
                  titleString &&
                    cn(
                      "text-xs font-semibold uppercase tracking-wider",
                      danger
                        ? "text-destructive"
                        : "text-[color:var(--ui-label)]",
                    ),
                )}
              >
                {title}
              </div>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 self-center sm:mt-0.5 sm:h-4 sm:w-4",
                  pipelineWorkspaceChevronTransition,
                  danger
                    ? "text-destructive"
                    : "text-[color:var(--ui-label)]",
                  open && "rotate-180"
                )}
                aria-hidden
              />
            </button>
            {headerRight ? (
              <span
                className="inline-flex shrink-0 items-center"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {headerRight}
              </span>
            ) : null}
          </div>
          {description && (
            <div
              className={cn(
                "min-w-0 break-words pr-1 text-xs font-normal normal-case leading-relaxed text-[color:var(--ui-label)] sm:pr-6",
                !open && "max-sm:hidden",
                danger && "text-destructive/95",
                descriptionClassName,
              )}
            >
              {description}
            </div>
          )}
        </div>
      </div>
      {animatedShell(innerCard)}
    </div>
  );
}

type CollapsibleCardProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Shown in the top-right of the header before the chevron. */
  headerRight?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
};

/**
 * Large page card with a rich title (e.g. hero + icon) and padding for body.
 */
export function CollapsibleCard({
  title,
  description,
  headerRight,
  defaultOpen = true,
  className,
  contentClassName,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const uid = useId();
  const panelId = `${uid}-panel`;

  return (
    <div
      className={cn(
        pipelineWorkspaceCardFrame(),
        "border border-border/60 bg-background",
        className,
      )}
    >
      <div
        className={cn(
          "flex w-full items-start justify-between gap-2 border-b border-border/60 bg-muted/10",
          pipelineWorkspaceCardHeaderPadding,
        )}
      >
        <div className="min-w-0 flex-1">
          {typeof title === "string" ? (
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          ) : (
            title
          )}
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start">
          {headerRight}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-md text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            aria-expanded={open}
            aria-controls={panelId}
            title={open ? "Collapse" : "Expand"}
          >
            <ChevronDown
              className={cn(
                "h-5 w-5",
                pipelineWorkspaceChevronTransition,
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        </div>
      </div>
      {open && (
        <div
          id={panelId}
          className={cn("space-y-4", pipelineWorkspaceCardBodyPadding, contentClassName)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
