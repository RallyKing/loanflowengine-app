"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/cn";

export type WorkspaceSheetSnap = "compact" | "comfort" | "expanded";

type WorkspaceSheetSnapContextValue = {
  snap: WorkspaceSheetSnap;
  snapIndex: number;
  setSnapIndex: Dispatch<SetStateAction<number>>;
  /** While held, Vaul sheet resize drag is disabled to avoid gesture fights with inspectors/overlays. */
  acquireWorkspaceSheetDragLock: () => () => void;
};

export const WorkspaceSheetSnapContext =
  createContext<WorkspaceSheetSnapContextValue | null>(null);

/** Mobile Vaul snap surface only; null on desktop or before mount. */
export function useWorkspaceSheetSnap(): WorkspaceSheetSnapContextValue | null {
  return useContext(WorkspaceSheetSnapContext);
}

/**
 * Suspends workspace snap-handle dragging while `active` (e.g. record inspector open)
 * so vertical drags dismiss overlays instead of resizing the sheet.
 */
export function useWorkspaceSheetDragLock(active: boolean) {
  const ctx = useContext(WorkspaceSheetSnapContext);
  useEffect(() => {
    if (!active || !ctx?.acquireWorkspaceSheetDragLock) return;
    return ctx.acquireWorkspaceSheetDragLock();
  }, [active, ctx]);
}

const SNAP_POINTS = [0.22, 0.58, 1] as const;

function snapFromIndex(i: number): WorkspaceSheetSnap {
  if (i <= 0) return "compact";
  if (i === 1) return "comfort";
  return "expanded";
}

/**
 * Mobile (`max-md`): persistent top **Vaul** sheet with snap points (Material-style
 * operational workspace). Desktop: pass-through — full integrated layout, no drawer.
 *
 * Snap heights are fractions of the **embed container** (AppChrome `<main>` body).
 */
export function PipelineWorkspaceMobileVaulFrame({
  children,
}: {
  children: ReactNode;
}) {
  const [isMdUp, setIsMdUp] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsMdUp(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [snapIdx, setSnapIdx] = useState(2);
  const [sheetDragLockCount, setSheetDragLockCount] = useState(0);

  const acquireWorkspaceSheetDragLock = useCallback(() => {
    setSheetDragLockCount((c) => c + 1);
    return () => setSheetDragLockCount((c) => Math.max(0, c - 1));
  }, []);

  const snapValue = useMemo<WorkspaceSheetSnapContextValue>(
    () => ({
      snap: snapFromIndex(snapIdx),
      snapIndex: snapIdx,
      setSnapIndex: setSnapIdx,
      acquireWorkspaceSheetDragLock,
    }),
    [snapIdx, acquireWorkspaceSheetDragLock],
  );

  const activeSnapPoint = SNAP_POINTS[snapIdx] ?? SNAP_POINTS[2];

  const setActiveSnapPoint = useCallback((pt: number | string | null) => {
    if (pt === null) return;
    const n = typeof pt === "string" ? Number.parseFloat(pt) : pt;
    if (Number.isNaN(n)) return;
    const i = SNAP_POINTS.findIndex((p) => Math.abs(p - n) < 0.001 || p === pt);
    if (i >= 0) setSnapIdx(i);
  }, []);

  if (isMdUp) {
    return <>{children}</>;
  }

  const reduceMotion =
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-reduce-motion") === "true";

  return (
    <WorkspaceSheetSnapContext.Provider value={snapValue}>
      <div
        ref={setHost}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col [container-type:size]"
        data-workspace-sheet-host
        data-workspace-snap={snapFromIndex(snapIdx)}
        data-workspace-sheet-drag-locked={sheetDragLockCount > 0 || undefined}
      >
        {host ? (
          <Drawer.Root
            open
            onOpenChange={() => {}}
            container={host}
            modal={false}
            dismissible={false}
            handleOnly={!reduceMotion}
            noBodyStyles
            shouldScaleBackground={false}
            direction="top"
            snapPoints={[...SNAP_POINTS]}
            activeSnapPoint={activeSnapPoint}
            setActiveSnapPoint={setActiveSnapPoint}
            defaultOpen
            autoFocus={false}
            snapToSequentialPoint
            repositionInputs
          >
            <Drawer.Portal container={host}>
              <Drawer.Content
                className={cn(
                  "flex max-h-full max-w-full flex-col bg-background outline-none max-sm:pt-[env(safe-area-inset-top)]",
                  "shadow-[0_12px_40px_-18px_rgba(0,0,0,0.35)] dark:shadow-[0_12px_48px_-12px_rgba(0,0,0,0.65)]",
                  reduceMotion && "max-md:!transition-none",
                )}
                aria-label="Pipeline file workspace sheet"
                data-workspace-snap={snapFromIndex(snapIdx)}
              >
                {!reduceMotion ? (
                  <div className="flex shrink-0 justify-center border-b border-border/50 bg-background py-2">
                    <Drawer.Handle
                      aria-label="Drag to resize workspace (snap)"
                      className="!bg-muted-foreground/35"
                    />
                  </div>
                ) : null}
                {children}
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
        ) : (
          children
        )}
      </div>
    </WorkspaceSheetSnapContext.Provider>
  );
}
