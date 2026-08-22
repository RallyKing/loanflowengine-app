"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useHaptics } from "@/lib/haptics/useHaptics";
import { cn } from "@/lib/cn";
import { LS_TABLET_BOTTOM_NAV } from "@/lib/navigation/responsiveNavConstants";
import { recordNavRoute } from "@/lib/navigation/navRoutePersistence";
import { navMotionTransition } from "@/lib/navigation/navMotion";
import {
  deriveResponsiveNavLayout,
  unlockViewportNavSignalsForHydration,
  useViewportNavSignals,
  type ResponsiveNavLayout,
} from "@/lib/navigation/useResponsiveNavLayout";
import { appendPriorityDebugClientLog } from "@/lib/debugClientLog";
import { shellZIndexStyle } from "@/lib/ui/layerTokens";

function responsiveLayoutFingerprint(l: ResponsiveNavLayout): string {
  return JSON.stringify({
    iw: l.innerWidth,
    ih: l.innerHeight,
    uw: l.usableWidth,
    uh: l.usableHeight,
    kb: l.keyboardInsetBottom,
    o: l.orientation,
    db: l.densityBucket,
    prm: l.prefersReducedMotion,
    sh: l.shell,
    unr: l.useNavigationRail,
    ucr: l.useCollapsibleRail,
    ubn: l.useBottomNavigation,
    utcs: l.useTabletContextStrip,
  });
}

type AuxiliaryPanelState = {
  open: boolean;
  label: string;
  children: ReactNode;
};

export type NavAuxiliaryPanelApi = {
  open: (opts: { label: string; children: ReactNode }) => void;
  close: () => void;
  isOpen: boolean;
};

export type ResponsiveNavContextValue = {
  layout: ResponsiveNavLayout;
  tabletBottomNavEnabled: boolean;
  setTabletBottomNavEnabled: (next: boolean) => void;
  prefersReducedMotion: boolean;
  triggerHaptic: ReturnType<typeof useHaptics>;
  auxiliaryPanel: NavAuxiliaryPanelApi;
};

const ResponsiveNavContext = createContext<ResponsiveNavContextValue | null>(
  null,
);

function readTabletBottomDefault(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(LS_TABLET_BOTTOM_NAV);
    if (v === "0") return false;
    if (v === "1") return true;
    return true;
  } catch {
    return true;
  }
}

function NavRouteTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) recordNavRoute(pathname);
  }, [pathname]);
  return null;
}

function NavAuxiliaryPanelPortal({
  layout,
  state,
  onClose,
}: {
  layout: ResponsiveNavLayout;
  state: AuxiliaryPanelState;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.open, onClose]);

  if (!mounted || !state.open || !state.children) return null;

  const reduced = layout.prefersReducedMotion;
  const desktop = layout.shell === "desktop";

  return createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center xl:items-stretch xl:justify-end"
      style={shellZIndexStyle("navAuxiliary")}
      role="presentation"
    >
      <button
        type="button"
        className={cn(
          "absolute inset-0 bg-black/40",
          navMotionTransition(reduced),
          !reduced && "opacity-100",
        )}
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        className={cn(
          "relative isolate flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-bottom)))] w-full flex-col border-border bg-background shadow-[var(--dlc-elevation-4)] [background-color:rgb(var(--bg))]",
          "xl:max-h-dvh xl:w-[min(420px,100dvw)] xl:border-l xl:shadow-none",
          !desktop &&
            "rounded-t-xl border-x border-t border-b-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          desktop && "h-dvh",
          navMotionTransition(reduced),
        )}
        style={{
          paddingLeft: "max(0px, env(safe-area-inset-left))",
          paddingRight: "max(0px, env(safe-area-inset-right))",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={state.label}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span id="nav-aux-title" className="text-sm font-semibold">
            {state.label}
          </span>
          <button
            type="button"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div
          className="min-h-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain px-4 py-3"
          aria-labelledby="nav-aux-title"
        >
          {state.children}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

export function ResponsiveNavProvider({ children }: { children: ReactNode }) {
  const [tabletBottomNavEnabled, setTabletBottomNavEnabledState] =
    useState(true);
  const [mountedTabletPref, setMountedTabletPref] = useState(false);

  useLayoutEffect(() => {
    unlockViewportNavSignalsForHydration();
  }, []);

  useEffect(() => {
    setTabletBottomNavEnabledState(readTabletBottomDefault());
    setMountedTabletPref(true);
  }, []);

  const setTabletBottomNavEnabled = useCallback((next: boolean) => {
    setTabletBottomNavEnabledState(next);
    try {
      window.localStorage.setItem(LS_TABLET_BOTTOM_NAV, next ? "1" : "0");
    } catch {
      /* private mode */
    }
  }, []);

  const signals = useViewportNavSignals();
  const tabletPref = mountedTabletPref ? tabletBottomNavEnabled : true;
  const layoutCandidate = useMemo(
    () => deriveResponsiveNavLayout(signals, tabletPref),
    [signals, tabletPref],
  );
  /** Avoid new `layout` object identities when derived fields match (reduces consumer effect churn / nested updates). */
  const layoutStableRef = useRef(layoutCandidate);
  const layoutFingerprint = responsiveLayoutFingerprint(layoutCandidate);
  const layoutFpPrevRef = useRef<string | null>(null);
  if (layoutFpPrevRef.current !== layoutFingerprint) {
    layoutFpPrevRef.current = layoutFingerprint;
    layoutStableRef.current = layoutCandidate;
  }
  const layout = layoutStableRef.current;

  const debugLayoutLogCountRef = useRef(0);
  useEffect(() => {
    if (debugLayoutLogCountRef.current >= 12) return;
    debugLayoutLogCountRef.current += 1;
    const payload = {
      sessionId: "f25461",
      runId: "layout-fp",
      hypothesisId: "H185_layout_churn",
      location: "ResponsiveNavProvider.tsx",
      message: "responsive layout fingerprint tick",
      data: { layoutFingerprint, n: debugLayoutLogCountRef.current },
      timestamp: Date.now(),
    };
    // #region agent log
    appendPriorityDebugClientLog(payload);
    // #endregion
  }, [layoutFingerprint]);

  const triggerHaptic = useHaptics();

  const [aux, setAux] = useState<AuxiliaryPanelState>({
    open: false,
    label: "",
    children: null,
  });

  const openAux = useCallback(
    (opts: { label: string; children: ReactNode }) => {
      setAux({ open: true, label: opts.label, children: opts.children });
    },
    [],
  );
  const closeAux = useCallback(() => {
    setAux((s) => ({ ...s, open: false, children: null }));
  }, []);

  const auxiliaryPanel: NavAuxiliaryPanelApi = useMemo(
    () => ({
      open: openAux,
      close: closeAux,
      isOpen: aux.open,
    }),
    [openAux, closeAux, aux.open],
  );

  useEffect(() => {
    document.documentElement.dataset.navShell = layout.shell;
    document.documentElement.dataset.navBottom =
      layout.useBottomNavigation ? "on" : "off";
    return () => {
      delete document.documentElement.dataset.navShell;
      delete document.documentElement.dataset.navBottom;
    };
  }, [layout.shell, layout.useBottomNavigation]);

  const value = useMemo(
    (): ResponsiveNavContextValue => ({
      layout,
      tabletBottomNavEnabled: tabletPref,
      setTabletBottomNavEnabled,
      prefersReducedMotion: layout.prefersReducedMotion,
      triggerHaptic,
      auxiliaryPanel,
    }),
    [
      layout,
      tabletPref,
      setTabletBottomNavEnabled,
      triggerHaptic,
      auxiliaryPanel,
    ],
  );

  return (
    <ResponsiveNavContext.Provider value={value}>
      <NavRouteTracker />
      {children}
      <NavAuxiliaryPanelPortal
        layout={layout}
        state={aux}
        onClose={closeAux}
      />
    </ResponsiveNavContext.Provider>
  );
}

export function useResponsiveNav(): ResponsiveNavContextValue {
  const ctx = useContext(ResponsiveNavContext);
  if (!ctx) {
    throw new Error("useResponsiveNav requires ResponsiveNavProvider");
  }
  return ctx;
}
