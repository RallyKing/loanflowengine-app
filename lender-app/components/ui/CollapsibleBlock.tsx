"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import { AppWindow, ChevronDown, LayoutGrid, PanelTopClose } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FloatingWindow } from "@/components/ui/FloatingWindow";
import {
  nextFloatingBlockCascadeIndex,
  useFloatingBlockWindow,
} from "@/components/ui/FloatingBlockWindowProvider";
import { ClientAssignableBlockActions } from "@/components/library/ClientAssignableBlockActions";
import { useClientBlockAssignOptional } from "@/lib/clientBlockAssignContext";
import { cn } from "@/lib/cn";
import { isAtomicPortalBlockId } from "@/lib/atomicPortalBlockRegistry";
import { resolveClientAssignAtomicBlockId } from "@/lib/pipelineBlockClientAssign";
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
  /**
   * Show “Open in window” on shared block chrome (default true).
   * Detached panels have no scrim — workspace underneath stays interactive.
   */
  detachable?: boolean;
  /** Override localStorage key for floating geometry (defaults to block `id`). */
  detachPersistKey?: string;
  /**
   * Vault assign / fill-link chrome. When omitted, resolves from section `id`
   * via the pipeline→atomic map when a ClientBlockAssignProvider is present.
   * Pass `false` to opt out (vault builders, project/file shells, etc.).
   */
  clientAssignBlockId?: string | false;
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
  detachable = true,
  detachPersistKey,
  clientAssignBlockId,
}: CollapsibleBlockProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const controlled =
    controlledOpen !== undefined && onOpenChange !== undefined;
  const open = controlled ? controlledOpen : internalOpen;
  const statusBadgeVariant = collapsibleBadgeVariantToUi(badgeVariant);
  const showIndicator =
    indicatorCount != null && Number.isFinite(indicatorCount) && indicatorCount > 0;

  const floatingHost = useFloatingBlockWindow();
  const clientAssign = useClientBlockAssignOptional();
  const resolvedAssignBlockId = resolveClientAssignAtomicBlockId({
    sectionId: id,
    explicit: clientAssignBlockId,
  });
  const clientAssignActions =
    clientAssign &&
    resolvedAssignBlockId &&
    !clientAssign.readOnly &&
    clientAssign.memberUserKey?.trim() ? (
      <ClientAssignableBlockActions
        pipelineFileId={clientAssign.pipelineFileId}
        blockId={resolvedAssignBlockId}
        memberUserKey={clientAssign.memberUserKey}
        assignedContactId={clientAssign.assignedContactId}
        readOnly={clientAssign.readOnly}
        showFillLink={isAtomicPortalBlockId(resolvedAssignBlockId)}
      />
    ) : null;
  const composedHeaderRight =
    clientAssignActions || headerRight ? (
      <span className="inline-flex shrink-0 items-center gap-0.5">
        {clientAssignActions}
        {headerRight}
      </span>
    ) : null;

  const [localDetached, setLocalDetached] = useState(false);
  const [detachCascade, setDetachCascade] = useState(0);

  const uid = useId();
  const panelId = id ? `${id}-panel` : `${uid}-panel`;
  const headingId = id ? `${id}-heading` : `${uid}-heading`;
  const danger = variant === "danger";
  const compact = density === "compact";
  const persistKey = detachPersistKey ?? (id ? `block:${id}` : undefined);
  /** Stable key for host-scoped detach; required to survive tab unmounts. */
  const blockKey = (id ?? detachPersistKey)?.trim() || "";
  const hostDetached =
    Boolean(floatingHost && blockKey && floatingHost.isDetached(blockKey));
  const detached = hostDetached || localDetached;
  const useHostDetach = Boolean(floatingHost && blockKey);
  const pendingHostDetach = Boolean(
    floatingHost &&
      blockKey &&
      detachable &&
      floatingHost.hasPendingDetach(blockKey),
  );

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
    if (open || detached || pendingHostDetach) setLazyBodyMounted(true);
  }, [lazyMount, open, detached, pendingHostDetach]);

  /** Blur focused controls before the panel is aria-hidden / height-collapsed. */
  useEffect(() => {
    if (open || detached || typeof document === "undefined") return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    const panel = document.getElementById(panelId);
    if (panel?.contains(active)) active.blur();
  }, [open, detached, panelId]);

  const resolvedChildren =
    !lazyMount || lazyBodyMounted || detached || pendingHostDetach
      ? children
      : null;

  const compactChromeBorder = "border-gray-300 dark:border-slate-600";

  const detach = () => {
    const cascade = nextFloatingBlockCascadeIndex();
    setDetachCascade(cascade);
    if (!open) {
      if (controlled) onOpenChange!(true);
      else setInternalOpen(true);
    }
    if (useHostDetach && floatingHost) {
      floatingHost.clearPendingDetach(blockKey);
      floatingHost.detach({
        blockKey,
        title,
        persistKey,
        cascadeIndex: cascade,
        description,
        contentClassName,
        content: resolvedChildren,
        trailingExtra: composedHeaderRight,
        testId: id ? `${id}-floating-window` : "block-floating-window",
      });
      return;
    }
    setLocalDetached(true);
  };

  const reattach = () => {
    if (useHostDetach && floatingHost && blockKey) {
      floatingHost.reattach(blockKey);
      return;
    }
    setLocalDetached(false);
  };

  // Favorites / deep-links: fulfill pending detach with the same path as the
  // chrome “Open in window” control once this block is mounted.
  useLayoutEffect(() => {
    if (!pendingHostDetach || detached || !detachable) return;
    detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot on pending flag
  }, [pendingHostDetach, detached, detachable]);

  // Keep host content live while this block is mounted; host retains last
  // snapshot when the tab unmounts so the floating panel survives.
  useLayoutEffect(() => {
    if (!useHostDetach || !floatingHost || !blockKey || !hostDetached) return;
    floatingHost.sync(blockKey, {
      title,
      description,
      contentClassName,
      content: resolvedChildren,
      trailingExtra: composedHeaderRight,
      testId: id ? `${id}-floating-window` : "block-floating-window",
    });
  });

  const detachButton =
    detachable && !detached ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-10 min-h-[40px] w-10 min-w-[40px] shrink-0 p-0"
        aria-label={`Open ${title} in window`}
        title="Open in window"
        data-testid={id ? `${id}-open-in-window` : "block-open-in-window"}
        onClick={(e) => {
          e.stopPropagation();
          detach();
        }}
      >
        <AppWindow className="h-4 w-4" aria-hidden />
      </Button>
    ) : null;

  const headerActions = (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {detachButton}
      {composedHeaderRight}
    </span>
  );

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
        {...(!open ? ({ inert: true } as HTMLAttributes<HTMLDivElement>) : {})}
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

  if (detached) {
    const stub = (
      <section
        id={id}
        aria-labelledby={headingId}
        className={cn("min-w-0 scroll-mt-4", className)}
        data-testid={id}
        data-collapsible-block-detached="true"
      >
        <div
          className={cn(
            pipelineWorkspaceCardFrame(compact ? "rounded-lg" : undefined),
            compact
              ? cn(
                  "w-full min-w-0 max-w-full rounded-lg border bg-muted/20 shadow-sm",
                  compactChromeBorder,
                )
              : cn(
                  "w-full min-w-0 max-w-full rounded-dlc-lg border border-dashed border-border/80 bg-muted/15",
                ),
            "px-3 py-2.5",
          )}
          data-collapsible-block-stub
        >
          <div className="flex min-w-0 items-center gap-2">
            <AppWindow
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span
              id={headingId}
              className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {title}
            </span>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              Open in window
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 min-h-[36px] shrink-0 gap-1.5 px-2.5 text-xs"
              aria-label={`Return ${title} to file`}
              title="Return to file"
              data-testid={id ? `${id}-reattach` : "block-reattach"}
              onClick={reattach}
            >
              <PanelTopClose className="h-3.5 w-3.5" aria-hidden />
              Return
            </Button>
          </div>
        </div>
      </section>
    );

    // Host owns the FloatingWindow (survives tab switches). Local fallback
    // keeps prior in-tree behavior when no provider is present.
    if (useHostDetach && hostDetached) {
      return stub;
    }

    return (
      <>
        {stub}
        <FloatingWindow
          title={title}
          onClose={reattach}
          persistKey={persistKey}
          cascadeIndex={detachCascade}
          data-testid={id ? `${id}-floating-window` : "block-floating-window"}
          trailing={
            <span className="inline-flex items-center gap-0.5">
              {composedHeaderRight}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 min-h-[36px] gap-1 px-2 text-xs"
                aria-label={`Return ${title} to file`}
                title="Return to file"
                data-no-drag
                onClick={reattach}
              >
                <PanelTopClose className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Return</span>
              </Button>
            </span>
          }
        >
          {description ? (
            <p className="mb-3 shrink-0 px-3 pt-3 text-xs leading-relaxed text-muted-foreground sm:px-3.5 sm:pt-3.5">
              {description}
            </p>
          ) : null}
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain touch-scroll-y p-3 sm:p-3.5",
              contentClassName,
            )}
          >
            {resolvedChildren}
          </div>
        </FloatingWindow>
      </>
    );
  }

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

          <span
            className="inline-flex shrink-0 items-center"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {headerActions}
          </span>
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
