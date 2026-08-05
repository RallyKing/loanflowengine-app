"use client";

/**
 * Non-modal floating panel for detached pipeline blocks (window-in-window).
 * No scrim — background stays fully interactive. Bounded internal scroll only.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AppWindow, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { layerZIndex, layerZIndexStyle } from "@/lib/ui/layering";
import {
  clampFloatingWindowGeometry,
  defaultFloatingWindowGeometry,
  loadFloatingWindowGeometry,
  saveFloatingWindowGeometry,
  type FloatingWindowGeometry,
} from "@/lib/ui/floatingWindowGeometry";

type ResizeEdge =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

let floatingWindowFocusSeq = 0;
let topFloatingWindowId: string | null = null;

const RESIZE_HANDLE_CLASS: Record<ResizeEdge, string> = {
  n: "absolute inset-x-3 top-0 z-[2] h-1.5 cursor-ns-resize touch-none",
  s: "absolute inset-x-3 bottom-0 z-[2] h-1.5 cursor-ns-resize touch-none",
  e: "absolute inset-y-3 right-0 z-[2] w-1.5 cursor-ew-resize touch-none",
  w: "absolute inset-y-3 left-0 z-[2] w-1.5 cursor-ew-resize touch-none",
  ne: "absolute right-0 top-0 z-[2] h-3 w-3 cursor-nesw-resize touch-none",
  nw: "absolute left-0 top-0 z-[2] h-3 w-3 cursor-nwse-resize touch-none",
  se: "absolute bottom-0 right-0 z-[2] h-3 w-3 cursor-nwse-resize touch-none",
  sw: "absolute bottom-0 left-0 z-[2] h-3 w-3 cursor-nesw-resize touch-none",
};

export type FloatingWindowProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Extra controls in the title bar (before close). */
  trailing?: ReactNode;
  /** localStorage key for position/size (omit to skip persist). */
  persistKey?: string;
  /** Cascade offset when no saved geometry exists. */
  cascadeIndex?: number;
  className?: string;
  "data-testid"?: string;
};

export function FloatingWindow({
  title,
  onClose,
  children,
  trailing,
  persistKey,
  cascadeIndex = 0,
  className,
  "data-testid": testId,
}: FloatingWindowProps) {
  const reactId = useId();
  const windowId = `fw-${reactId}`;
  const titleId = `${windowId}-title`;
  const [mounted, setMounted] = useState(false);
  const [geometry, setGeometry] = useState<FloatingWindowGeometry>(() =>
    defaultFloatingWindowGeometry(cascadeIndex),
  );
  const [zBoost, setZBoost] = useState(0);
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const dragRef = useRef<{
    mode: "move" | ResizeEdge;
    startX: number;
    startY: number;
    origin: FloatingWindowGeometry;
  } | null>(null);

  const bringToFront = useCallback(() => {
    floatingWindowFocusSeq += 1;
    topFloatingWindowId = windowId;
    setZBoost(floatingWindowFocusSeq);
  }, [windowId]);

  useEffect(() => {
    setMounted(true);
    floatingWindowFocusSeq += 1;
    topFloatingWindowId = windowId;
    setZBoost(floatingWindowFocusSeq);
    return () => {
      if (topFloatingWindowId === windowId) topFloatingWindowId = null;
    };
  }, [windowId]);

  useEffect(() => {
    if (!persistKey) {
      setGeometry(defaultFloatingWindowGeometry(cascadeIndex));
      return;
    }
    const saved = loadFloatingWindowGeometry(persistKey);
    setGeometry(saved ?? defaultFloatingWindowGeometry(cascadeIndex));
  }, [persistKey, cascadeIndex]);

  useEffect(() => {
    const onResize = () => {
      setGeometry((g) => clampFloatingWindowGeometry(g));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (topFloatingWindowId !== windowId) return;
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [windowId]);

  const persist = useCallback(
    (next: FloatingWindowGeometry) => {
      const clamped = clampFloatingWindowGeometry(next);
      setGeometry(clamped);
      if (persistKey) saveFloatingWindowGeometry(persistKey, clamped);
    },
    [persistKey],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const o = drag.origin;
      let next: FloatingWindowGeometry = { ...o };

      if (drag.mode === "move") {
        next = { ...o, x: o.x + dx, y: o.y + dy };
      } else {
        const edge = drag.mode;
        if (edge.includes("e")) next.w = o.w + dx;
        if (edge.includes("s")) next.h = o.h + dy;
        if (edge.includes("w")) {
          next.w = o.w - dx;
          next.x = o.x + dx;
        }
        if (edge.includes("n")) {
          next.h = o.h - dy;
          next.y = o.y + dy;
        }
      }
      persist(next);
    },
    [persist],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }, [onPointerMove]);

  const beginDrag = useCallback(
    (mode: "move" | ResizeEdge, e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      bringToFront();
      dragRef.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        origin: { ...geometryRef.current },
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    },
    [bringToFront, endDrag, onPointerMove],
  );

  if (!mounted) return null;

  const baseZ = layerZIndex("FLOATING_WINDOW");
  const style = {
    ...layerZIndexStyle("FLOATING_WINDOW"),
    zIndex: baseZ + Math.min(zBoost, 20),
    left: geometry.x,
    top: geometry.y,
    width: geometry.w,
    height: geometry.h,
  };

  const panel = (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-floating-window
      data-testid={testId ?? "floating-window"}
      className={cn(
        "fixed flex flex-col overflow-hidden rounded-dlc-lg border border-border bg-dlc-surface shadow-dlc-4",
        "[background-color:var(--dlc-surface-container-highest)]",
        className,
      )}
      style={style}
      onPointerDown={bringToFront}
    >
      {(Object.keys(RESIZE_HANDLE_CLASS) as ResizeEdge[]).map((edge) => (
        <div
          key={edge}
          role="presentation"
          className={RESIZE_HANDLE_CLASS[edge]}
          onPointerDown={(e) => beginDrag(edge, e)}
        />
      ))}

      <header
        className="flex shrink-0 cursor-grab items-center gap-2 border-b border-border/70 bg-dlc-surface-high px-2 py-1.5 active:cursor-grabbing sm:px-2.5"
        onPointerDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("button, a, input, [data-no-drag]")) return;
          beginDrag("move", e);
        }}
      >
        <AppWindow
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <h2
          id={titleId}
          className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-foreground"
        >
          {title}
        </h2>
        {trailing ? (
          <span
            className="inline-flex shrink-0 items-center gap-0.5"
            data-no-drag
            onPointerDown={(e) => e.stopPropagation()}
          >
            {trailing}
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 min-h-[36px] w-9 min-w-[36px] shrink-0 p-0"
          aria-label={`Close ${title} window`}
          title="Close window"
          data-testid="floating-window-close"
          data-no-drag
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-scroll-y p-3 sm:p-3.5"
        data-floating-window-body
      >
        {children}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
