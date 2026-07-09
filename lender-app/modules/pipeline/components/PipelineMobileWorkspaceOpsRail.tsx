"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  ListChecks,
  PanelBottom,
  ListTree,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { motionEase, motionMs, shellMotionTw } from "@/lib/ui/motionTokens";
import { shellZIndexStyle } from "@/lib/ui/layerTokens";
import { useResponsiveNav } from "@/components/navigation/ResponsiveNavProvider";
import type { PipelineDrawerSectionId } from "@/lib/pipelineDrawerLayoutStorage";
import { pipelineDrawerSectionDomId } from "@/lib/pipelineDrawerSectionDom";

type JumpFn = (sid: PipelineDrawerSectionId) => void;

const DOCK_TRACK_SECTIONS = [
  "dealWorkspace",
  "lenders",
  "tasks",
] as const satisfies readonly PipelineDrawerSectionId[];

/**
 * Fixed workspace shortcut dock — stays above the keyboard (visualViewport) and
 * does not scroll away. Mobile + tablet only (`xl:hidden`).
 */
export function PipelineMobileWorkspaceOpsRail({
  onJump,
  onOpenUtilities,
  className,
}: {
  onJump: JumpFn;
  onOpenUtilities: () => void;
  className?: string;
}) {
  const { layout } = useResponsiveNav();
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [activeSection, setActiveSection] =
    useState<(typeof DOCK_TRACK_SECTIONS)[number] | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    const sync = () => {
      if (!vv) {
        setKeyboardInset(0);
        return;
      }
      const inset = Math.max(
        0,
        window.innerHeight - vv.height - (vv.offsetTop ?? 0),
      );
      setKeyboardInset(Math.round(inset));
    };
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("orientationchange", sync);
    window.addEventListener("resize", sync);
    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("orientationchange", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  const pickActiveFromScroll = useCallback(() => {
    const root = document.querySelector<HTMLElement>(
      "[data-pipeline-workspace-scroll]",
    );
    if (!root) return;

    let best: (typeof DOCK_TRACK_SECTIONS)[number] | null = null;
    let bestScore = 0;
    const rootRect = root.getBoundingClientRect();
    const viewMid =
      rootRect.top + Math.min(root.clientHeight, window.innerHeight * 0.35);

    for (const id of DOCK_TRACK_SECTIONS) {
      const el = document.getElementById(pipelineDrawerSectionDomId(id));
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const visibleTop = Math.max(r.top, rootRect.top);
      const visibleBottom = Math.min(r.bottom, rootRect.bottom);
      const visible = Math.max(0, visibleBottom - visibleTop);
      const coverage =
        r.height > 0 ? visible / Math.min(r.height, root.clientHeight) : 0;
      const dist = Math.abs(r.top + r.height * 0.15 - viewMid);
      const score = coverage * 120 - dist * 0.02;
      if (score > bestScore && coverage > 0.08) {
        bestScore = score;
        best = id;
      }
    }
    setActiveSection((prev) => best ?? prev);
  }, []);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(
      "[data-pipeline-workspace-scroll]",
    );
    if (!root) return;

    const onScroll = () => {
      pickActiveFromScroll();
    };

    const obs = new IntersectionObserver(
      () => {
        pickActiveFromScroll();
      },
      { root, rootMargin: "-12% 0px -52% 0px", threshold: [0, 0.1, 0.35, 0.6, 1] },
    );

    for (const id of DOCK_TRACK_SECTIONS) {
      const el = document.getElementById(pipelineDrawerSectionDomId(id));
      if (el) obs.observe(el);
    }

    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    return () => {
      obs.disconnect();
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pickActiveFromScroll]);

  const chip = (isActive: boolean) =>
    cn(
      "inline-flex min-h-[44px] min-w-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border bg-background/95 px-2 text-[11px] font-semibold uppercase tracking-wide shadow-sm backdrop-blur-sm active:bg-muted/80",
      isActive
        ? "border-primary/50 text-foreground shadow-[0_2px_14px_-4px_rgba(0,0,0,0.28)] ring-1 ring-primary/25 dark:shadow-[0_2px_18px_-4px_rgba(0,0,0,0.55)]"
        : "border-border/80 text-foreground",
      shellMotionTw.workspaceDockChip,
    );

  const dockShadowY = 4;
  const dockShadowBlur = 24;
  const dockShadowAlpha = 0.12;

  const bottomNavReserve = layout.useBottomNavigation ? "4.35rem" : "0.25rem";
  const bottom = `max(0px, calc(${bottomNavReserve} + env(safe-area-inset-bottom) + ${keyboardInset}px))`;

  return (
    <div
      className={cn(
        "pointer-events-none fixed left-0 right-0 max-xl:pb-[env(safe-area-inset-bottom)] xl:hidden",
        className,
      )}
      style={{
        ...shellZIndexStyle("stickyDock"),
        bottom,
        transition: layout.prefersReducedMotion
          ? "none"
          : `bottom ${motionMs.drawer}ms ${motionEase.standard}, padding-bottom ${motionMs.drawer}ms ${motionEase.standard}`,
      }}
      role="toolbar"
      aria-label="Workspace shortcuts"
    >
      <div className="pointer-events-auto mx-auto max-w-7xl px-2 pb-1 pt-0.5">
        <div
          className={cn(
            "flex gap-1.5 rounded-2xl border border-border/60 bg-muted/30 p-1.5 transition-shadow duration-200",
            layout.prefersReducedMotion && "transition-none",
          )}
          style={{
            boxShadow: layout.prefersReducedMotion
              ? "0 -4px 24px -8px rgba(0,0,0,0.12)"
              : `0 -${dockShadowY}px ${dockShadowBlur}px -8px rgba(0,0,0,${dockShadowAlpha}), 0 1px 0 rgba(255,255,255,0.06) inset`,
          }}
        >
          <button
            type="button"
            className={chip(activeSection === "dealWorkspace")}
            onClick={() => {
              setActiveSection("dealWorkspace");
              onJump("dealWorkspace");
            }}
          >
            <ListChecks className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden min-[400px]:inline">Deal</span>
          </button>
          <button
            type="button"
            className={chip(activeSection === "lenders")}
            onClick={() => {
              setActiveSection("lenders");
              onJump("lenders");
            }}
          >
            <Building2 className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden min-[400px]:inline">Lenders</span>
          </button>
          <button
            type="button"
            className={chip(activeSection === "tasks")}
            onClick={() => {
              setActiveSection("tasks");
              onJump("tasks");
            }}
          >
            <ListTree className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden min-[400px]:inline">Tasks</span>
          </button>
          <button type="button" className={chip(false)} onClick={onOpenUtilities}>
            <PanelBottom className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden min-[400px]:inline">Tools</span>
          </button>
        </div>
      </div>
    </div>
  );
}
