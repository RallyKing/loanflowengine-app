"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  pipelineChromeDebugRegisterIntersectionObserver,
  pipelineChromeDebugRegisterScrollListener,
} from "@/lib/debug/pipelineChromeDebug";
import { isPipelineSurfaceRoute } from "@/lib/navigation/isPipelineSurfaceRoute";
import { PHASE_24_4L_DOM_MOUNT_LOCK } from "@/lib/debug/phase24-4L-dom-mount-lock";

/** State A — top of page: full chrome. State B — scrolling: compact chrome (`md+` always expanded). */
export type MobileMasterpageState = "expanded" | "compact";

type MobileChromeContextValue = {
  /** True when State A (expanded); false on mobile State B (compact). */
  mobileMasterExpanded: boolean;
  /** `true` on small viewports while scrolled (compact masterpage + workspace). Always `false` on `md+`. */
  isMobileCompactMode: boolean;
  /**
   * Scroll-away “productivity focus” on small screens — minimal chrome, content-first.
   * Currently mirrors `isMobileCompactMode` (enters after scrolling down; exits near top or on scroll up).
   */
  isMobileFocusMode: boolean;
  mobileMasterpageState: MobileMasterpageState;
  /** @deprecated Use `isMobileFocusMode` / `isMobileCompactMode` / `mobileMasterpageState === "compact"`. */
  focusMode: boolean;
  registerMainScrollContainer: (el: HTMLElement | null) => void;
  /**
   * Pipeline file workspace: isolated vertical scrollport (`[data-pipeline-workspace-scroll]`).
   * When set, compact/focus IO + scroll listeners attach here instead of `<main>`.
   */
  registerPipelineWorkspaceScroll: (el: HTMLElement | null) => void;
  /**
   * Optional sentinel **inside** the effective scrollport (pipeline workspace or `<main>`).
   * When set on mobile, compact mode uses `IntersectionObserver` instead of `scroll` listeners.
   */
  registerMainCompactSentinel: (el: HTMLElement | null) => void;
};

const MobileChromeContext = createContext<MobileChromeContextValue | null>(
  null,
);

/**
 * Focus mode drives bottom-nav visibility (translate off-screen). It mirrors
 * compact chrome on `<md`. Subscribing via {@link useMobileBottomNavFocusMode}
 * avoids re-rendering the nav on unrelated context consumers; only the snapshot
 * boolean changes trigger `MobileBottomNav` updates.
 */
let mobileFocusModeSnapshot = false;
const mobileFocusModeListeners = new Set<() => void>();

function subscribeMobileFocusMode(onChange: () => void) {
  mobileFocusModeListeners.add(onChange);
  return () => mobileFocusModeListeners.delete(onChange);
}

function getMobileFocusModeSnapshot() {
  return mobileFocusModeSnapshot;
}

function getServerMobileFocusModeSnapshot() {
  return false;
}

function publishMobileFocusMode(next: boolean) {
  if (mobileFocusModeSnapshot === next) return;
  mobileFocusModeSnapshot = next;
  for (const cb of mobileFocusModeListeners) cb();
}

/** Narrow subscription for `MobileBottomNav` — does not invalidate on pathname-only parent updates. */
export function useMobileBottomNavFocusMode(): boolean {
  return useSyncExternalStore(
    subscribeMobileFocusMode,
    getMobileFocusModeSnapshot,
    getServerMobileFocusModeSnapshot,
  );
}

const SCROLL_DOWN_DELTA = 14;
const SCROLL_UP_DELTA = -14;
const TOP_EXPAND_PX = 48;

type MobileChromeProviderProps = {
  children: ReactNode;
  navigationKey: string;
  suspendCompact?: boolean;
};

/**
 * Scroll-aware mobile masterpage: State A at top, State B after scrolling down.
 * State B enables **focus mode** (`isMobileFocusMode`): minimal chrome and the
 * bottom nav slides off via **transform** only. **Main scroll padding stays fixed**
 * (Phase 4) so scroll geometry does not change when focus toggles.
 *
 * - **Pipeline file** registers a one-pixel sentinel; on `<md` we drive compact
 *   mode with `IntersectionObserver` against `<main>` (no `scroll` listener).
 *   Observer updates are **debounced** (48 ms) with **immediate** initial sync to
 *   reduce boundary flicker during momentum scroll.
 * - **Other routes** use `scroll` + `requestAnimationFrame` + `startTransition`
 *   (14 px scroll delta hysteresis).
 *
 * Pipeline file workspace: **`[data-pipeline-workspace-scroll]`** owns vertical scroll;
 * `<main>` stays `overflow: hidden` on that route. Other routes: `<main>` scrolls as before.
 */
export function MobileChromeProvider({
  children,
  navigationKey,
  suspendCompact = false,
}: MobileChromeProviderProps) {
  const [mainScrollEl, setMainScrollEl] = useState<HTMLElement | null>(null);
  const [workspaceScrollEl, setWorkspaceScrollEl] =
    useState<HTMLElement | null>(null);
  const [compactSentinelEl, setCompactSentinelEl] =
    useState<HTMLElement | null>(null);
  const effectiveScrollEl = workspaceScrollEl ?? mainScrollEl;
  /** When true, mobile is in State B (compact). On `md+` scroll keeps this false. */
  const [compactChrome, setCompactChrome] = useState(false);
  const [isMdUp, setIsMdUp] = useState(false);
  const pipelineRouteFrozen =
    suspendCompact ||
    (PHASE_24_4L_DOM_MOUNT_LOCK &&
      (isPipelineSurfaceRoute(navigationKey) ||
        (typeof window !== "undefined" &&
          isPipelineSurfaceRoute(window.location.pathname))));
  const lastScrollTop = useRef(0);
  const rafId = useRef<number | null>(null);
  /** Coalesce rapid IntersectionObserver flips at the sentinel boundary (momentum + subpixel). */
  const ioDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ioPendingCompactRef = useRef<boolean | null>(null);

  const registerMainScrollContainer = useCallback((el: HTMLElement | null) => {
    setMainScrollEl(el);
  }, []);

  const registerPipelineWorkspaceScroll = useCallback(
    (el: HTMLElement | null) => {
      setWorkspaceScrollEl(el);
    },
    [],
  );

  const registerMainCompactSentinel = useCallback((el: HTMLElement | null) => {
    setCompactSentinelEl(el);
  }, []);

  useEffect(() => {
    setCompactChrome(false);
  }, [navigationKey]);

  /** Phase 24.4J/24.4L — sync before paint: pipeline routes never enter focus/compact. */
  useLayoutEffect(() => {
    const onPipeline =
      isPipelineSurfaceRoute(navigationKey) ||
      (typeof window !== "undefined" &&
        isPipelineSurfaceRoute(window.location.pathname));
    if (!onPipeline) return;
    setCompactChrome(false);
    publishMobileFocusMode(false);
    document.documentElement.removeAttribute("data-dlc-mobile-compact");
    document.documentElement.removeAttribute("data-dlc-mobile-focus");
  }, [navigationKey]);

  useLayoutEffect(() => {
    if (!suspendCompact && !pipelineRouteFrozen) return;
    setCompactChrome(false);
    publishMobileFocusMode(false);
    document.documentElement.removeAttribute("data-dlc-mobile-compact");
    document.documentElement.removeAttribute("data-dlc-mobile-focus");
  }, [suspendCompact, pipelineRouteFrozen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onMq = () => setIsMdUp(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  useEffect(() => {
    if (!isMdUp && !pipelineRouteFrozen) return;
    startTransition(() => setCompactChrome((prev) => (prev ? false : prev)));
  }, [isMdUp, pipelineRouteFrozen]);

  useEffect(() => {
    lastScrollTop.current = effectiveScrollEl?.scrollTop ?? 0;
  }, [effectiveScrollEl]);

  /** Pipeline file & similar: IntersectionObserver — avoids scroll-linked setState jitter on mobile. */
  useEffect(() => {
    if (!effectiveScrollEl || !compactSentinelEl || pipelineRouteFrozen) return;
    if (typeof IntersectionObserver === "undefined") return;

    const mq = window.matchMedia("(min-width: 768px)");
    if (mq.matches) return;

    const flushIoCompact = (wantCompact: boolean, immediate: boolean) => {
      if (immediate) {
        if (ioDebounceRef.current != null) {
          clearTimeout(ioDebounceRef.current);
          ioDebounceRef.current = null;
        }
        ioPendingCompactRef.current = null;
        startTransition(() => setCompactChrome(wantCompact));
        return;
      }
      ioPendingCompactRef.current = wantCompact;
      if (ioDebounceRef.current != null) clearTimeout(ioDebounceRef.current);
      ioDebounceRef.current = setTimeout(() => {
        ioDebounceRef.current = null;
        const v = ioPendingCompactRef.current;
        ioPendingCompactRef.current = null;
        if (v === null) return;
        startTransition(() => setCompactChrome(v));
      }, 48);
    };

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries[0]?.isIntersecting ?? true;
        flushIoCompact(!hit, false);
      },
      { root: effectiveScrollEl, threshold: 0, rootMargin: "0px" },
    );
    io.observe(compactSentinelEl);
    pipelineChromeDebugRegisterIntersectionObserver(1);
    const initial = io.takeRecords();
    if (initial.length > 0) {
      const hit0 = initial[0]?.isIntersecting ?? true;
      flushIoCompact(!hit0, true);
    }
    return () => {
      io.disconnect();
      pipelineChromeDebugRegisterIntersectionObserver(-1);
      if (ioDebounceRef.current != null) {
        clearTimeout(ioDebounceRef.current);
        ioDebounceRef.current = null;
      }
      ioPendingCompactRef.current = null;
    };
  }, [effectiveScrollEl, compactSentinelEl, pipelineRouteFrozen, navigationKey]);

  useEffect(() => {
    if (!effectiveScrollEl || compactSentinelEl != null || pipelineRouteFrozen) return;

    const mq = window.matchMedia("(min-width: 768px)");
    const flush = () => {
      rafId.current = null;
      const y = effectiveScrollEl.scrollTop;
      if (mq.matches || pipelineRouteFrozen) {
        startTransition(() => {
          setCompactChrome((prev) => (prev ? false : prev));
        });
        lastScrollTop.current = y;
        return;
      }
      const delta = y - lastScrollTop.current;
      startTransition(() => {
        setCompactChrome((prev) => {
          if (y < TOP_EXPAND_PX) return false;
          if (delta > SCROLL_DOWN_DELTA) return true;
          if (delta < SCROLL_UP_DELTA) return false;
          return prev;
        });
      });
      lastScrollTop.current = y;
    };

    const onScroll = () => {
      if (rafId.current != null) return;
      rafId.current = window.requestAnimationFrame(flush);
    };

    /* Passive: do not call preventDefault — avoids fighting native scroll/sticky. */
    lastScrollTop.current = effectiveScrollEl.scrollTop;
    mq.addEventListener("change", onScroll);
    effectiveScrollEl.addEventListener("scroll", onScroll, { passive: true });
    pipelineChromeDebugRegisterScrollListener(1);
    return () => {
      mq.removeEventListener("change", onScroll);
      effectiveScrollEl.removeEventListener("scroll", onScroll);
      pipelineChromeDebugRegisterScrollListener(-1);
      if (rafId.current != null) window.cancelAnimationFrame(rafId.current);
    };
  }, [effectiveScrollEl, compactSentinelEl, pipelineRouteFrozen]);

  const isMobileCompactMode = pipelineRouteFrozen ? false : !isMdUp && compactChrome;
  const isMobileFocusMode = pipelineRouteFrozen ? false : isMobileCompactMode;

  useEffect(() => {
    if (pipelineRouteFrozen) {
      publishMobileFocusMode(false);
      return () => {
        publishMobileFocusMode(false);
      };
    }
    publishMobileFocusMode(isMobileFocusMode);
    return () => {
      publishMobileFocusMode(false);
    };
  }, [isMobileFocusMode, pipelineRouteFrozen]);

  useEffect(() => {
    if (pipelineRouteFrozen) {
      document.documentElement.removeAttribute("data-dlc-mobile-compact");
      document.documentElement.removeAttribute("data-dlc-mobile-focus");
      return;
    }
    document.documentElement.toggleAttribute(
      "data-dlc-mobile-compact",
      isMobileCompactMode,
    );
    document.documentElement.toggleAttribute(
      "data-dlc-mobile-focus",
      isMobileFocusMode,
    );
    return () => {
      document.documentElement.removeAttribute("data-dlc-mobile-compact");
      document.documentElement.removeAttribute("data-dlc-mobile-focus");
    };
  }, [isMobileCompactMode, isMobileFocusMode, pipelineRouteFrozen]);

  const value = useMemo((): MobileChromeContextValue => {
    const mobileMasterExpanded = pipelineRouteFrozen ? true : !compactChrome;
    return {
      mobileMasterExpanded,
      isMobileCompactMode,
      isMobileFocusMode,
      mobileMasterpageState: mobileMasterExpanded ? "expanded" : "compact",
      focusMode: pipelineRouteFrozen ? false : compactChrome,
      registerMainScrollContainer,
      registerPipelineWorkspaceScroll,
      registerMainCompactSentinel,
    };
  }, [
    compactChrome,
    isMobileCompactMode,
    isMobileFocusMode,
    pipelineRouteFrozen,
    registerMainScrollContainer,
    registerPipelineWorkspaceScroll,
    registerMainCompactSentinel,
  ]);

  return (
    <MobileChromeContext.Provider value={value}>
      {children}
    </MobileChromeContext.Provider>
  );
}

export function useMobileChrome(): MobileChromeContextValue {
  const ctx = useContext(MobileChromeContext);
  if (!ctx) {
    return {
      mobileMasterExpanded: true,
      isMobileCompactMode: false,
      isMobileFocusMode: false,
      mobileMasterpageState: "expanded",
      focusMode: false,
      registerMainScrollContainer: () => {},
      registerPipelineWorkspaceScroll: () => {},
      registerMainCompactSentinel: () => {},
    };
  }
  return ctx;
}
