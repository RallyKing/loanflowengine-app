"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { layerZIndexStyle } from "@/lib/ui/layering";
import { useNarrowViewport } from "@/lib/useNarrowViewport";
import { useVisualViewportMaxHeightStyle } from "@/lib/useVisualViewportMaxHeightStyle";

/**
 * Enterprise record inspector: one contextual editing language for task, lender,
 * and future contact / document / activity inspectors.
 *
 * Contract:
 * - **Single scroll owner** inside `RecordInspectorBody` (not the route `<main>`).
 * - **Header / footer** are `shrink-0`; body flexes with `min-h-0 overflow-y-auto`.
 * - **Escape**: unified here (skips editable fields; optional `consumeEscape` stack).
 * - **Focus**: restores the element that opened the inspector on unmount.
 * - **Mobile**: bottom-anchored sheet + safe-area; **desktop**: right side sheet.
 *
 * @see lender-app/AGENTS.md (RecordInspectorShell)
 * @see `@/lib/platform-framework` — overlay tiers, inspector scroll contract
 */
export type RecordInspectorKind =
  | "task"
  | "lender"
  | "contact"
  | "document"
  | "activity"
  | "automation"
  | "event";

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

function targetIgnoresEscape(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.closest("[data-record-inspector-ignore-escape]")) return true;
  return !!target.closest(EDITABLE_SELECTOR);
}

const INSPECTOR_WIDTH_LS = "dlc-record-inspector-width-v1";
const INSPECTOR_WIDTH_MIN = 360;
const INSPECTOR_WIDTH_MAX = 720;
const INSPECTOR_WIDTH_DEFAULT = 480;

export function RecordInspectorShell({
  children,
  onClose,
  scrimCloseEnabled = true,
  /** When false, Escape does not dismiss (e.g. during a blocking save). Defaults to `scrimCloseEnabled`. */
  escapeCloseEnabled: escapeCloseEnabledProp,
  /** Return true if Escape was consumed (e.g. exited full-screen) and the shell should stay open. */
  consumeEscape,
  fullScreen = false,
  ariaLabel,
  panelClassName,
  recordKind,
  /** Desktop only: drag left edge to resize; width persisted in localStorage. */
  resizable = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  scrimCloseEnabled?: boolean;
  escapeCloseEnabled?: boolean;
  consumeEscape?: () => boolean;
  fullScreen?: boolean;
  ariaLabel: string;
  panelClassName?: string;
  recordKind?: RecordInspectorKind;
  resizable?: boolean;
}) {
  const escapeCloseEnabled = escapeCloseEnabledProp ?? scrimCloseEnabled;
  const narrow = useNarrowViewport();
  const vvMax = useVisualViewportMaxHeightStyle(narrow);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [deskWidth, setDeskWidth] = useState<number | null>(null);
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(INSPECTOR_WIDTH_DEFAULT);
  const liveW = useRef(INSPECTOR_WIDTH_DEFAULT);

  useLayoutEffect(() => {
    if (!resizable || narrow) return;
    try {
      const raw = localStorage.getItem(INSPECTOR_WIDTH_LS);
      const n = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(n)) {
        const clamped = Math.min(
          INSPECTOR_WIDTH_MAX,
          Math.max(INSPECTOR_WIDTH_MIN, n),
        );
        setDeskWidth(clamped);
        liveW.current = clamped;
      }
    } catch {
      /* private mode */
    }
  }, [resizable, narrow]);

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!resizable || narrow) return;
      e.preventDefault();
      dragging.current = true;
      dragStartX.current = e.clientX;
      dragStartW.current = deskWidth ?? INSPECTOR_WIDTH_DEFAULT;
      liveW.current = dragStartW.current;
    },
    [resizable, narrow, deskWidth],
  );

  useEffect(() => {
    if (!resizable || narrow) return;
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = dragStartX.current - e.clientX;
      const next = Math.min(
        INSPECTOR_WIDTH_MAX,
        Math.max(INSPECTOR_WIDTH_MIN, dragStartW.current + dx),
      );
      liveW.current = next;
      setDeskWidth(next);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      try {
        localStorage.setItem(INSPECTOR_WIDTH_LS, String(liveW.current));
      } catch {
        /* private mode */
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [resizable, narrow]);

  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = panelRef.current;
    if (node) {
      queueMicrotask(() => {
        if (!node.isConnected) return;
        node.focus({ preventScroll: true });
      });
    }
    return () => {
      if (previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!escapeCloseEnabled) return;
      if (targetIgnoresEscape(e.target)) return;
      if (consumeEscape?.()) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose, escapeCloseEnabled, consumeEscape]);

  if (!mounted) return null;

  if (fullScreen) {
    return createPortal(
      <div
        ref={panelRef}
        tabIndex={-1}
        data-record-inspector-shell
        data-record-inspector-mode="fullscreen"
        {...(recordKind ? { "data-record-inspector-kind": recordKind } : {})}
        className={cn(
          "fixed inset-0 flex max-h-dvh min-h-0 flex-col overflow-hidden bg-background shadow-[var(--dlc-elevation-4)] outline-none",
          panelClassName,
        )}
        style={{
          ...layerZIndexStyle("INSPECTOR"),
          ...(vvMax.maxHeight ? { maxHeight: vvMax.maxHeight } : {}),
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label={ariaLabel}
      >
        {children}
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 flex max-h-dvh flex-col md:flex-row"
      data-record-inspector-portal
      style={layerZIndexStyle("INSPECTOR")}
    >
      <div
        className={cn(
          "min-h-0 flex-1 bg-dlc-scrim",
          scrimCloseEnabled ? "cursor-pointer" : "cursor-default",
        )}
        onClick={() => {
          if (scrimCloseEnabled) onClose();
        }}
        aria-hidden
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        data-record-inspector-shell
        data-record-inspector-mode="sheet"
        data-record-inspector-resizable={resizable && !narrow ? "on" : "off"}
        {...(recordKind ? { "data-record-inspector-kind": recordKind } : {})}
        className={cn(
          "flex max-h-[min(94dvh,100dvh)] w-full min-h-0 shrink-0 flex-col overflow-hidden border-border bg-background shadow-[var(--dlc-elevation-4)] outline-none",
          "max-md:rounded-t-2xl max-md:border-l-0 max-md:border-t max-md:animate-slide-in-up",
          "max-md:pb-[env(safe-area-inset-bottom,0px)] max-md:pt-[max(0.25rem,env(safe-area-inset-top,0px))]",
          "md:h-dvh md:max-h-dvh md:border-l md:border-t-0 md:animate-slide-in-right",
          resizable && !narrow && "md:relative md:max-w-none",
          !resizable && "md:max-w-2xl",
          panelClassName,
        )}
        style={{
          ...(narrow && vvMax.maxHeight ? { maxHeight: vvMax.maxHeight } : {}),
          ...(!narrow && resizable
            ? {
                width: deskWidth ?? INSPECTOR_WIDTH_DEFAULT,
                maxWidth: "min(90vw, 720px)",
              }
            : {}),
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label={ariaLabel}
      >
        {resizable && !narrow ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            tabIndex={0}
            onPointerDown={onResizePointerDown}
            className="absolute left-0 top-0 z-10 hidden h-full w-3 max-w-[12px] cursor-col-resize md:block"
            style={{ touchAction: "none" }}
          />
        ) : null}
        {children}
      </aside>
    </div>,
    document.body,
  );
}

/** Canonical header band — non-scrolling; pair with `RecordInspectorBody`. */
export function RecordInspectorHeader({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <header
      id={id}
      data-record-inspector-region="header"
      className={cn(
        "shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className,
      )}
    >
      <div className="px-[var(--dlc-inspector-pad-x)] py-[var(--dlc-inspector-pad-y-header)]">
        {children}
      </div>
    </header>
  );
}

/** Contextual subtitle / meta line (trust + orientation); keep calm, one line when possible. */
export function RecordInspectorSubtitle({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <p
      id={id}
      data-record-inspector-subtitle
      className={cn(
        "mt-1 text-sm leading-snug text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Primary scrollport for inspector content — only this region scrolls. */
export function RecordInspectorBody({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      data-record-inspector-region="body"
      data-nested-scroll
      className={cn(
        "min-h-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain px-[var(--dlc-inspector-pad-x)] py-[var(--dlc-inspector-pad-y-body)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Sticky semantics for primary / secondary actions / read-only meta. Safe-area on mobile. */
export function RecordInspectorFooter({
  children,
  className,
  id,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
} & Omit<HTMLAttributes<HTMLElement>, "children">) {
  return (
    <footer
      id={id}
      data-record-inspector-region="footer"
      className={cn(
        "shrink-0 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "pb-[max(var(--dlc-inspector-footer-pad-y),env(safe-area-inset-bottom,0px))] pt-[var(--dlc-inspector-footer-pad-y)]",
        className,
      )}
      {...rest}
    >
      <div className="px-[var(--dlc-inspector-pad-x)]">{children}</div>
    </footer>
  );
}

export function RecordInspectorSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("space-y-3", className)}
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 dlc-surface-skeleton"
          aria-hidden
        />
      ))}
    </div>
  );
}
