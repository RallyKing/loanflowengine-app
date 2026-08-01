"use client";

import { useEffect, useId, useState, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, LayoutGrid } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import {
  collapsibleBadgeVariantToUi,
  type CollapsibleBlockBadgeVariant,
} from "@/lib/pipeline/collapsibleBlockMetadata";
import {
  pipelineWorkspaceCardFrame,
  pipelineWorkspaceCardHeaderPadding,
  pipelineWorkspaceChevronTransition,
  pipelineWorkspaceCollapseGrid,
  pipelineWorkspaceCollapseClosed,
  pipelineWorkspaceCollapseInner,
  pipelineWorkspaceCollapseOpen,
} from "@/lib/pipelineWorkspaceCard";
import {
  premiumCardBodyPaddingClass,
  premiumCardClassName,
  premiumCardDividerClass,
} from "@/lib/pipeline/premiumWorkspaceUi";

export interface CollapsibleBlockProps {
  /** Section label, e.g. "DSCR Analysis". */
  title: string;
  /** Short status for the badge, e.g. "Calculated", "Pending", "Draft". */
  status: string;
  /** One-line context shown when collapsed, e.g. "DSCR: 1.25x | LTV: 70%". */
  summary: string;
  children: React.ReactNode;
  /** Small count bubble beside the title (e.g. file count, task count). */
  indicatorCount?: number;
  /** Semantic color for the status badge on the right. */
  badgeVariant?: CollapsibleBlockBadgeVariant;
  /** Optional leading icon (defaults to grid). */
  icon?: ReactNode;
  /** Anchor id + data-testid. */
  id?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Leading control (e.g. drag handle) outside the expand toggle. */
  headerLeading?: ReactNode;
  headerRight?: ReactNode;
  animated?: boolean;
  lazyMount?: boolean;
  variant?: "default" | "danger";
  /** Tighter padding and lighter chrome for nested client workspace blocks. */
  density?: "default" | "compact";
  className?: string;
  contentClassName?: string;
  /** Override inner card chrome (background, border). */
  chromeClassName?: string;
  headerRowClassName?: string;
  titleClassName?: string;
  leadingIconWrapClassName?: string;
  chevronClassName?: string;
  /** Expanded-only helper text below the header row. */
  description?: ReactNode;
}

export function CollapsibleBlock({
  title,
  status,
  summary,
  children,
  indicatorCount,
  badgeVariant = "default",
  icon,
  id,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  headerLeading,
  headerRight,
  animated = true,
  lazyMount = true,
  variant = "default",
  density = "default",
  className,
  contentClassName,
  chromeClassName,
  headerRowClassName,
  titleClassName,
  leadingIconWrapClassName,
  chevronClassName,
  description,
}: CollapsibleBlockProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const controlled =
    controlledOpen !== undefined && onOpenChange !== undefined;
  const open = controlled ? controlledOpen : internalOpen;
  const statusBadgeVariant = collapsibleBadgeVariantToUi(badgeVariant);
  const showIndicator =
    indicatorCount != null && Number.isFinite(indicatorCount) && indicatorCount > 0;

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
  const panelId = id ? `${id}-panel` : `${uid}-panel`;
  const headingId = id ? `${id}-heading` : `${uid}-heading`;
  const danger = variant === "danger";
  const compact = density === "compact";

  const compactChromeBorder = "border-gray-300 dark:border-slate-600";

  const bodyInner = (
    <div
      className={cn(
        "border-t",
        compact ? compactChromeBorder : premiumCardDividerClass,
        compact ? undefined : premiumCardBodyPaddingClass,
        contentClassName,
      )}
    >
      {resolvedChildren}
    </div>
  );

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

  const statusBadge = (
    <Badge
      variant={statusBadgeVariant}
      className="shrink-0 text-[10px] uppercase tracking-wide"
      data-testid={id ? `${id}-status-badge` : undefined}
      data-badge-variant={badgeVariant}
    >
      {status}
    </Badge>
  );

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("min-w-0 scroll-mt-4", className)}
      data-testid={id}
    >
      <div
        className={cn(
          pipelineWorkspaceCardFrame(compact ? "rounded-lg" : undefined),
          compact
            ? cn(
                "w-full min-w-0 max-w-full rounded-lg border bg-background shadow-sm",
                compactChromeBorder,
                chromeClassName,
              )
            : cn(
                premiumCardClassName,
                "w-full min-w-0 max-w-full border",
                danger
                  ? "border-destructive/30 bg-destructive/[0.07] dark:border-destructive/40 dark:bg-destructive/10"
                  : "border-[color:var(--ui-block-color)] bg-background",
              ),
        )}
        data-collapsible-block
        data-collapsible-block-open={open ? "true" : "false"}
        data-badge-variant={badgeVariant}
      >
        <div
          className={cn(
            "flex w-full min-w-0 touch-manipulation items-center gap-2",
            compact
              ? cn(
                  "border-b px-2 py-2 sm:px-2.5 sm:py-2",
                  compactChromeBorder,
                  headerRowClassName,
                )
              : pipelineWorkspaceCardHeaderPadding,
            danger
              ? "hover:bg-destructive/[0.12] dark:hover:bg-destructive/15"
              : "hover:bg-muted/25",
          )}
        >
          {headerLeading ? (
            <span
              className="inline-flex shrink-0 items-center"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {headerLeading}
            </span>
          ) : null}
          <button
            type="button"
            onClick={toggle}
            className={cn(
              "flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left touch-manipulation",
              "active:bg-muted/40 sm:min-h-0 sm:active:bg-transparent",
              danger && "active:bg-destructive/15 sm:active:bg-transparent",
            )}
            aria-expanded={open}
            aria-controls={panelId}
            data-testid={id ? `${id}-trigger` : undefined}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-dlc-sm",
                danger
                  ? "bg-destructive/10 text-destructive"
                  : "bg-dlc-surface-high text-dlc-accent",
                leadingIconWrapClassName,
              )}
              aria-hidden
            >
              {icon ?? <LayoutGrid className="h-4 w-4" />}
            </span>

            <span className="flex min-w-0 shrink items-center gap-1.5 sm:max-w-[45%]">
              <span
                id={headingId}
                className={cn(
                  "truncate text-xs font-semibold uppercase tracking-wider",
                  danger ? "text-destructive" : "text-gray-900",
                  titleClassName,
                )}
              >
                {title}
              </span>
              {showIndicator ? (
                <Badge
                  variant="secondary"
                  className="ml-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
                  data-testid={id ? `${id}-indicator-count` : undefined}
                  aria-label={`${indicatorCount} items`}
                >
                  {indicatorCount! > 999 ? "999+" : indicatorCount}
                </Badge>
              ) : null}
            </span>

            <span className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-2.5">
              <span className="hidden sm:inline-flex">{statusBadge}</span>
              {!open ? (
                <span
                  className="hidden min-w-0 truncate text-xs text-gray-500 sm:inline"
                  data-testid={id ? `${id}-summary` : undefined}
                >
                  {summary}
                </span>
              ) : null}
              <span className="sm:hidden">{statusBadge}</span>
            </span>

            <ChevronDown
              className={cn(
                "h-5 w-5 shrink-0 self-center sm:h-4 sm:w-4",
                pipelineWorkspaceChevronTransition,
                danger ? "text-destructive" : "text-muted-foreground",
                chevronClassName,
                open && "rotate-180",
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

        {!open ? (
          <div
            className={cn(
              "border-t px-2 pb-2 sm:hidden",
              compact ? compactChromeBorder : premiumCardDividerClass,
            )}
          >
            <p className="truncate text-xs text-muted-foreground">{summary}</p>
          </div>
        ) : null}

        {open && description ? (
          <div
            className={cn(
              "border-t px-2 pb-2 text-xs leading-relaxed text-muted-foreground sm:px-2.5",
              compact ? compactChromeBorder : premiumCardDividerClass,
            )}
          >
            {description}
          </div>
        ) : null}

        {animatedShell(bodyInner)}
      </div>
    </section>
  );
}
