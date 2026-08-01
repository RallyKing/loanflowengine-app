"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { APP_DISPLAY_NAME, APP_MONOGRAM, APP_TAGLINE } from "@/lib/brandIdentity";
import { ChevronLeft } from "lucide-react";
import { useColorScheme } from "@/lib/colorScheme";
import { ColorSchemeToggle } from "@/components/ColorSchemeToggle";
import { UserNotificationsBell } from "@/components/UserNotificationsBell";
import { ProductUpdatesBellSafe } from "@/components/ProductUpdatesBell";
import { SettingsLink } from "@/components/SettingsLink";
import { ConvexConnectionStatus } from "@/components/ConvexConnectionStatus";
import { LiveConnectionPill } from "@/components/LiveConnectionPill";
import { MainNav } from "@/components/MainNav";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { MobileBottomNavScrollSpacer } from "@/components/layout/MobileBottomNavScrollSpacer";
import { OfflineSyncBanner } from "@/components/OfflineSyncBanner";
import { SuperuserImpersonationBanner } from "@/components/SuperuserImpersonationBanner";
import { OrgScopeRecoveryBanner } from "@/components/OrgScopeRecoveryBanner";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import {
  AuthRetryBoundary,
  authRecoverKeyFromState,
} from "@/components/auth/AuthRetryBoundary";
import { useAuthStateOptional } from "@/lib/auth/authStateContext";
import { GlobalSearchPalette } from "@/components/GlobalSearchPalette";
import { HelpHubTrigger } from "@/components/HelpHubTrigger";
import { HelpKnowledgeShellMount } from "@/components/HelpKnowledgeShellMount";
import { cn } from "@/lib/cn";
import type { ColorScheme } from "@/lib/colorScheme";
import {
  mobileChromePaddingExpandedY,
  mobileContentBottomPadTransition,
} from "@/lib/mobileCompactChrome";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useAuth, UserButton } from "@/lib/sessionUiClient";
import { UserOnboardingChecklist } from "@/components/UserOnboardingChecklist";
import {
  MobileChromeProvider,
  useMobileChrome,
} from "@/components/MobileChromeController";
import { AdaptiveNavigationController } from "@/components/navigation/AdaptiveNavigationController";
import { TabletContextNav } from "@/components/navigation/TabletContextNav";
import { useResponsiveNav } from "@/components/navigation/ResponsiveNavProvider";
import { MasterHeaderShell } from "@/components/layout/MasterHeaderShell";
import { ShellMotionReadyProvider } from "@/components/layout/ShellMotionReadyContext";
import { MobileTopNav } from "@/components/layout/MobileTopNav";
import { UnifiedSidebarRail } from "@/components/layout/UnifiedSidebarRail";
import { useMasterScrollCompression } from "@/hooks/useMasterScrollCompression";
import { useShellMotionReady } from "@/components/layout/ShellMotionReadyContext";
import { OperationalToastHost } from "@/components/ui/OperationalToast";
import { shellZIndexStyle } from "@/lib/ui/layerTokens";
import { shellMotionTw } from "@/lib/ui/motionTokens";
import { resolvePipelineSurfaceRoute } from "@/lib/navigation/isPipelineSurfaceRoute";
import { resolveRegistryRoute } from "@/lib/navigation/isRegistryRoute";
import { PHASE_24_4P_MASTER_LAYOUT_LOCKDOWN } from "@/lib/debug/phase24-4P-master-layout-lockdown";
import { PipelineChromeDebugMount } from "@/components/debug/PipelineChromeDebugMount";
import { PipelineProgrammingPurgeMount } from "@/components/debug/PipelineProgrammingPurgeMount";
import { HardRefreshButton } from "@/components/HardRefreshButton";

const SAAS_SIDEBAR_EXPANDED_KEY = "dlc-saas-sidebar-expanded";

const skipToMainClass = cn(
  "sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:[z-index:var(--dlc-shell-z-skip-focus,100)]",
  "focus:rounded-md focus:border focus:border-border focus:bg-background",
  "focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring",
);

function SkipToMainLink() {
  return (
    <a href="#app-main-scroll" className={skipToMainClass}>
      Skip to main content
    </a>
  );
}

function readSaasSidebarDesktopExpanded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SAAS_SIDEBAR_EXPANDED_KEY) !== "0";
  } catch {
    return true;
  }
}

const PIPELINE_NON_FILE_SEGMENTS = new Set([
  "library",
  "licenses",
  "intake",
  "file",
  "client",
]);

/** `/pipeline/[convexFileId]` — not hub, library, licenses, legacy intake, `/file/...`, etc. */
function isPipelineConvexFileRoute(pathname: string | null): boolean {
  if (!pathname?.startsWith("/pipeline/")) return false;
  const seg = pathname.slice("/pipeline/".length).split("/")[0] ?? "";
  if (!seg || PIPELINE_NON_FILE_SEGMENTS.has(seg)) return false;
  // First path segment is an opaque Convex document id — do not restrict charset
  // (ids are url-safe strings; a strict [a-z0-9]+ check incorrectly fell through to the padded hub shell).
  return true;
}

/** Wide content shell for `/pipeline/[fileId]` (full-page file workspace). */
function isPipelineWideShellRoute(pathname: string | null): boolean {
  return isPipelineConvexFileRoute(pathname);
}

type AppChromeBodyProps = {
  children: ReactNode;
  pathname: string | null;
  isClientPortal: boolean;
  scheme: ColorScheme;
  notifyUserKey: string;
  saasMenuOpen: boolean;
  setSaasMenuOpen: Dispatch<SetStateAction<boolean>>;
  saasDesktopSidebarOpen: boolean;
  setSaasDesktopSidebarOpenPersist: (open: boolean) => void;
};

function AppChromeBody({
  children,
  pathname,
  isClientPortal,
  scheme,
  notifyUserKey,
  saasMenuOpen,
  setSaasMenuOpen,
  saasDesktopSidebarOpen,
  setSaasDesktopSidebarOpenPersist,
}: AppChromeBodyProps) {
  const shellMotionReady = useShellMotionReady();
  const {
    mobileMasterpageState,
    registerMainScrollContainer,
    isMobileFocusMode,
  } = useMobileChrome();
  const { layout } = useResponsiveNav();
  const auth = useAuthStateOptional();
  const authRecoverKey = auth ? authRecoverKeyFromState(auth.state) : "none";

  const pageShell = (
    <AuthRetryBoundary
      recoverKey={pathname ?? ""}
      authRecoverKey={authRecoverKey}
    >
      <PageErrorBoundary recoverKey={pathname ?? ""}>
        {children}
      </PageErrorBoundary>
    </AuthRetryBoundary>
  );
  const isPipelineSurface = resolvePipelineSurfaceRoute(pathname);
  const pipelineStaticChrome = isPipelineSurface;
  const pipelineLayoutLocked =
    pipelineStaticChrome &&
    PHASE_24_4P_MASTER_LAYOUT_LOCKDOWN.lockTopHeader;
  const pipelineSafeAreaFrozen =
    pipelineStaticChrome &&
    PHASE_24_4P_MASTER_LAYOUT_LOCKDOWN.freezeSafeAreaInsets;
  const focus = pipelineStaticChrome ? false : isMobileFocusMode;
  const masterpageState = pipelineStaticChrome ? "expanded" : mobileMasterpageState;
  /** Convex file route: workspace sheet owns scroll; `<main>` is a fixed flex shell only. */
  const isPipelineFileWorkspace = isPipelineWideShellRoute(pathname);
  /** Contacts workspace: `[data-contacts-workspace-scroll]` owns vertical scroll. */
  const isRegistryWorkspace = resolveRegistryRoute(pathname);
  const isDelegatedWorkspaceScroll =
    isPipelineFileWorkspace || isRegistryWorkspace;
  const showBottomNav = layout.useBottomNavigation;
  /** Global routes: spacer inside `<main>` scroll + nav sibling. File workspace: shell scroll spacer only. */
  const showGlobalBottomNav = showBottomNav && !isPipelineFileWorkspace;
  const showFileBottomNav = showBottomNav && isPipelineFileWorkspace;
  const masterCompression = useMasterScrollCompression({
    shell: layout.shell,
    scrollDelegatedToWorkspace: isPipelineFileWorkspace,
    prefersReducedMotion: layout.prefersReducedMotion,
    enabled: !isClientPortal && !isPipelineSurface,
  });

  useEffect(() => {
    if (!saasMenuOpen || scheme !== "saas") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSaasMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saasMenuOpen, scheme, setSaasMenuOpen]);

  const shellConnectivityStrip =
    !isClientPortal ? (
      <div
        className="overflow-hidden border-b border-border/35 bg-muted/[0.02]"
        style={
          pipelineLayoutLocked
            ? { opacity: 1, pointerEvents: "auto" }
            : {
                opacity: shellMotionReady
                  ? 1 - 0.38 * masterCompression.compression
                  : 1,
                pointerEvents:
                  masterCompression.compression > 0.88 ? "none" : "auto",
              }
        }
      >
        <div className="mx-auto max-w-7xl px-4 py-1.5 sm:px-6">
          <OrgScopeRecoveryBanner />
          <SuperuserImpersonationBanner />
          <ConvexConnectionStatus />
          <OfflineSyncBanner />
        </div>
      </div>
    ) : null;

  if (isClientPortal) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground antialiased">
        <SkipToMainLink />
        <main
          id="app-main-scroll"
          ref={registerMainScrollContainer}
          data-testid="app-main-scroll"
          data-app-main-scroll
          data-scroll-owner="app-main"
          className="flex min-h-0 flex-1 flex-col touch-scroll-y overflow-y-auto overflow-x-clip overscroll-contain"
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {pageShell}
          </div>
        </main>
      </div>
    );
  }

  if (scheme === "saas" && isPipelineFileWorkspace) {
    return (
      <div
        data-app-shell-root
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden bg-background"
        data-pipeline-file-workspace-chrome="minimal"
      >
        <SkipToMainLink />
        <main
          id="app-main-scroll"
          ref={registerMainScrollContainer}
          data-testid="app-main-scroll"
          data-app-main-scroll
          data-scroll-owner="app-main"
          data-mobile-focus-mode={focus ? "on" : "off"}
          data-main-scroll-mode="workspace-delegated"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden"
        >
          <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col">
            {pageShell}
          </div>
        </main>
        {showFileBottomNav ? <MobileBottomNav /> : null}
      </div>
    );
  }

  if (scheme === "saas") {
    const saasMainPad =
      isPipelineFileWorkspace || isRegistryWorkspace
      ? "flex min-h-0 min-w-0 flex-1 flex-col max-w-none overflow-hidden px-0 pt-0 pb-0"
      : cn(
          "mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-8",
          layout.shell === "mobile" && "max-md:py-3",
          !layout.useBottomNavigation && "md:pb-8",
        );

    return (
      <div
        data-app-shell-root
        className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden overflow-x-hidden"
      >
        <SkipToMainLink />
        {saasMenuOpen ? (
          <button
            type="button"
            className="fixed inset-0 bg-black/50 md:hidden"
            style={shellZIndexStyle("overlay")}
            aria-label="Close menu"
            onClick={() => setSaasMenuOpen(false)}
          />
        ) : null}
        <UnifiedSidebarRail
          saasDesktopSidebarOpen={saasDesktopSidebarOpen}
          saasMenuOpen={saasMenuOpen}
          setSaasDesktopSidebarOpenPersist={setSaasDesktopSidebarOpenPersist}
          setSaasMenuOpen={setSaasMenuOpen}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header
            data-testid="app-masterpage-chrome"
            data-mobile-masterpage={masterpageState}
            data-pipeline-static-top-chrome={pipelineStaticChrome ? "visible" : undefined}
            data-pipeline-layout-locked={pipelineLayoutLocked ? "true" : undefined}
            className={cn(
              "shrink-0 flex-shrink-0 border-b border-border/80 shadow-dlc-2 supports-[overflow-anchor:auto]:[overflow-anchor:none]",
              "bg-background",
              pipelineLayoutLocked
                ? "h-16 min-h-16 max-h-16 overflow-hidden max-md:h-16 max-md:min-h-16 max-md:max-h-16"
                : "max-md:max-h-14 max-md:overflow-hidden",
              (pipelineStaticChrome || pipelineLayoutLocked) &&
                "max-md:!transition-none",
              !pipelineLayoutLocked &&
                !pipelineStaticChrome &&
                masterCompression.compression > 0.06 &&
                "max-md:border-border/55 max-md:shadow-dlc-1",
            )}
            style={shellZIndexStyle("header")}
          >
            <MasterHeaderShell
              compression={masterCompression}
              prefersReducedMotion={
                layout.prefersReducedMotion || pipelineStaticChrome
              }
              layoutLocked={pipelineLayoutLocked}
              className={cn(
                "w-full min-w-0 shrink-0 flex-shrink-0",
                pipelineLayoutLocked
                  ? "h-16 max-h-16 min-h-16 overflow-hidden"
                  : "max-md:max-h-14 max-md:overflow-hidden",
              )}
            >
              <MobileTopNav
                saasMenuOpen={saasMenuOpen}
                setSaasMenuOpen={setSaasMenuOpen}
                compactBrand={layout.shell === "mobile"}
                layoutLocked={pipelineLayoutLocked}
                trailing={
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-1 overflow-x-hidden sm:gap-2 md:w-full md:max-w-none md:flex-initial md:gap-3 md:overflow-visible md:ps-2",
                      layout.shell === "mobile" && "max-md:gap-0.5",
                    )}
                  >
                    <GlobalSearchPalette />
                    <HelpHubTrigger iconOnly className="inline-flex shrink-0" />
                    <HardRefreshButton className="inline-flex shrink-0" />
                    <ColorSchemeToggle
                      className={cn(
                        layout.shell === "mobile" && "hidden md:inline-flex",
                      )}
                    />
                    <SettingsLink
                      section="appearance"
                      iconOnly
                      className={cn(
                        "h-9 w-9 shrink-0",
                        layout.shell === "mobile" && "hidden md:inline-flex",
                      )}
                      ariaLabel="Open settings: appearance and theme"
                    />
                    <LiveConnectionPill />
                    {notifyUserKey ? (
                      <>
                        <ProductUpdatesBellSafe userKey={notifyUserKey} />
                        <UserNotificationsBell userKey={notifyUserKey} />
                      </>
                    ) : null}
                    <UserButton afterSignOutUrl="/sign-in" />
                  </div>
                }
              />
            </MasterHeaderShell>
          </header>
          {shellConnectivityStrip}
          <main
            id="app-main-scroll"
            ref={registerMainScrollContainer}
            data-testid="app-main-scroll"
            data-app-main-scroll
            data-scroll-owner="app-main"
            data-mobile-focus-mode={focus ? "on" : "off"}
            data-main-scroll-mode={
              isDelegatedWorkspaceScroll ? "workspace-delegated" : "primary"
            }
            className={cn(
              "flex min-h-0 flex-1 flex-col touch-scroll-y overflow-x-clip overscroll-contain",
              isDelegatedWorkspaceScroll
                ? "overflow-y-hidden"
                : "overflow-y-auto",
            )}
          >
            <div
              className={cn(
                "flex min-h-0 min-w-0 w-full flex-1 flex-col",
                mobileContentBottomPadTransition,
                saasMainPad,
              )}
            >
              {pageShell}
              {showGlobalBottomNav ? (
                <MobileBottomNavScrollSpacer variant="global" />
              ) : null}
            </div>
          </main>
          {showGlobalBottomNav ? <MobileBottomNav /> : null}
          <UserOnboardingChecklist layout="saas" />
        </div>
      </div>
    );
  }

  if (isPipelineFileWorkspace) {
    return (
      <div
        data-app-shell-root
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden bg-background"
        data-pipeline-file-workspace-chrome="minimal"
      >
        <SkipToMainLink />
        <main
          id="app-main-scroll"
          ref={registerMainScrollContainer}
          data-testid="app-main-scroll"
          data-app-main-scroll
          data-scroll-owner="app-main"
          data-mobile-focus-mode={focus ? "on" : "off"}
          data-main-scroll-mode="workspace-delegated"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden"
        >
          <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col">
            {pageShell}
          </div>
        </main>
        {showFileBottomNav ? <MobileBottomNav /> : null}
      </div>
    );
  }

  const classicMainPad = cn(
    !isRegistryWorkspace && "mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-8",
    isRegistryWorkspace && "flex min-h-0 flex-1 flex-col px-0 pt-0",
    layout.shell === "mobile" && !isRegistryWorkspace && "max-md:pt-3",
    !layout.useBottomNavigation &&
      (pipelineSafeAreaFrozen
        ? "max-md:pb-[calc(4.25rem+24px)] md:pb-8"
        : "pb-[max(5.5rem,calc(4.25rem+env(safe-area-inset-bottom)))] md:pb-8"),
  );

  return (
    <div
      data-app-shell-root
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden"
    >
      <SkipToMainLink />
      <header
        data-testid="app-masterpage-chrome"
        data-mobile-masterpage={masterpageState}
        data-pipeline-static-top-chrome={pipelineStaticChrome ? "visible" : undefined}
        data-pipeline-layout-locked={pipelineLayoutLocked ? "true" : undefined}
        className={cn(
          "shrink-0 flex-shrink-0 border-b border-border/80 shadow-dlc-2 supports-[overflow-anchor:auto]:[overflow-anchor:none]",
          pipelineLayoutLocked
            ? "h-16 min-h-16 max-h-16 overflow-hidden bg-background max-md:h-16 max-md:min-h-16 max-md:max-h-16"
            : "bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/88",
          (pipelineStaticChrome || pipelineLayoutLocked) &&
            "max-md:!transition-none",
          !pipelineLayoutLocked &&
            !pipelineStaticChrome &&
            masterCompression.compression > 0.06 &&
            "max-md:border-border/55 max-md:shadow-dlc-1",
        )}
        style={shellZIndexStyle("header")}
      >
        <MasterHeaderShell
          compression={masterCompression}
          prefersReducedMotion={
            layout.prefersReducedMotion || pipelineStaticChrome
          }
          layoutLocked={pipelineLayoutLocked}
          className={cn(
            "flex w-full min-w-0 flex-col items-stretch shrink-0 flex-shrink-0",
            pipelineLayoutLocked && "h-16 max-h-16 min-h-16 overflow-hidden",
          )}
        >
          <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-nowrap items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-6 sm:py-3">
            <div className="flex min-w-0 shrink items-center gap-2 sm:gap-2.5">
              {isPipelineWideShellRoute(pathname) ? (
                <Link
                  href="/pipeline"
                  className={cn(
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-dlc-sm border border-border/90 bg-background p-0 text-muted-foreground shadow-dlc-1 active:opacity-90",
                    shellMotionTw.navLinkTone,
                    "hover:bg-muted hover:text-foreground",
                  )}
                  aria-label="Back to pipeline"
                >
                  <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
                </Link>
              ) : null}
              <Link
                href="/tasks"
                className="group flex min-w-0 max-w-full items-center gap-2.5"
                aria-label={`${APP_DISPLAY_NAME} home`}
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-dlc-sm bg-brand text-xs font-bold text-brand-foreground shadow-dlc-2 ring-1 ring-brand-accent/35">
                  {APP_MONOGRAM}
                </div>
                <div
                  className={cn(
                    "min-w-0 leading-tight",
                    layout.shell === "mobile" && "hidden",
                  )}
                >
                  <div className="break-words text-sm font-semibold tracking-tight sm:text-base">
                    {APP_DISPLAY_NAME}
                  </div>
                  <div className="hidden text-[11px] uppercase tracking-wider text-muted-foreground sm:block">
                    {APP_TAGLINE}
                  </div>
                </div>
              </Link>
            </div>
            <div
              className="flex min-w-0 shrink-0 flex-nowrap items-center justify-end gap-1 overflow-x-hidden sm:gap-2"
              data-testid="master-header-actions"
            >
              <GlobalSearchPalette />
              <HelpHubTrigger iconOnly className="inline-flex shrink-0" />
              <HardRefreshButton className="inline-flex shrink-0" />
              <ColorSchemeToggle />
              {notifyUserKey ? (
                <>
                  <ProductUpdatesBellSafe userKey={notifyUserKey} />
                  <UserNotificationsBell userKey={notifyUserKey} />
                </>
              ) : null}
              <div className="hidden min-w-0 overflow-x-auto md:block">
                <MainNav />
              </div>
              <LiveConnectionPill />
              <UserButton afterSignOutUrl="/sign-in" />
            </div>
          </div>
          <TabletContextNav />
        </MasterHeaderShell>
      </header>
      {shellConnectivityStrip}
      <main
        id="app-main-scroll"
        ref={registerMainScrollContainer}
        data-testid="app-main-scroll"
        data-app-main-scroll
        data-scroll-owner="app-main"
        data-mobile-focus-mode={focus ? "on" : "off"}
        data-main-scroll-mode={
          isDelegatedWorkspaceScroll ? "workspace-delegated" : "primary"
        }
        className={cn(
          "flex min-h-0 flex-1 flex-col touch-scroll-y overflow-x-clip overscroll-contain",
          isDelegatedWorkspaceScroll
            ? "overflow-y-hidden"
            : "overflow-y-auto",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 min-w-0 w-full flex-1 flex-col",
            mobileContentBottomPadTransition,
            classicMainPad,
          )}
        >
          {pageShell}
          {showGlobalBottomNav ? (
            <MobileBottomNavScrollSpacer variant="global" />
          ) : null}
        </div>
      </main>
      {showGlobalBottomNav ? <MobileBottomNav /> : null}
      <OperationalToastHost />
      <UserOnboardingChecklist layout="classic" />
    </div>
  );
}

export function AppChrome({ children }: { children: React.ReactNode }) {
  const { scheme } = useColorScheme();
  const pathname = usePathname();
  const isClientPortal =
    (pathname?.startsWith("/portal") ?? false) ||
    (pathname?.startsWith("/apply") ?? false) ||
    (pathname?.startsWith("/upload") ?? false) ||
    (pathname?.startsWith("/client-portal") ?? false) ||
    (pathname?.startsWith("/lender-delivery") ?? false);
  // `accountId` is a per-browser preferences key (NOT user identity). Gate the
  // notifications bell on a signed-in viewer `userKey` from the session.
  const { accountId } = useUserPreferences();
  const { isSignedIn, userId: sessionUserId } = useAuth();
  const notifyUserKey =
    (isSignedIn && sessionUserId ? sessionUserId.trim() : "") ||
    accountId.trim();
  const [saasMenuOpen, setSaasMenuOpen] = useState(false);
  const [saasDesktopSidebarOpen, setSaasDesktopSidebarOpen] = useState(true);

  useLayoutEffect(() => {
    if (scheme !== "saas") return;
    setSaasDesktopSidebarOpen(readSaasSidebarDesktopExpanded());
  }, [scheme]);

  const setSaasDesktopSidebarOpenPersist = useCallback((open: boolean) => {
    setSaasDesktopSidebarOpen(open);
    try {
      window.localStorage.setItem(
        SAAS_SIDEBAR_EXPANDED_KEY,
        open ? "1" : "0"
      );
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    setSaasMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) setSaasMenuOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Note: pre-Phase-2 we toggled `document.body.style.overflow` here when
  // the mobile drawer opened. With the locked shell (body is always
  // `overflow: hidden`, the SOLE scroll container is <main>) that toggle
  // is unnecessary — background scroll is already disabled by the shell.

  return (
    <AdaptiveNavigationController
      accountId={accountId.trim() || "local"}
    >
      <MobileChromeProvider
        navigationKey={pathname ?? ""}
        suspendCompact={
          resolvePipelineSurfaceRoute(pathname) ||
          (scheme === "saas" && saasMenuOpen)
        }
      >
        <div
          data-dlc-app-chrome-root
          data-dlc-build-sha={process.env.NEXT_PUBLIC_DLC_GIT_SHA ?? "unknown"}
          data-dlc-build-time={process.env.NEXT_PUBLIC_DLC_BUILD_TIME ?? "unknown"}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
        <PipelineChromeDebugMount />
        <PipelineProgrammingPurgeMount />
        <ShellMotionReadyProvider>
          <AppChromeBody
            pathname={pathname}
            isClientPortal={isClientPortal}
            scheme={scheme}
            notifyUserKey={notifyUserKey}
            saasMenuOpen={saasMenuOpen}
            setSaasMenuOpen={setSaasMenuOpen}
            saasDesktopSidebarOpen={saasDesktopSidebarOpen}
            setSaasDesktopSidebarOpenPersist={setSaasDesktopSidebarOpenPersist}
          >
            {children}
          </AppChromeBody>
          <HelpKnowledgeShellMount />
        </ShellMotionReadyProvider>
        </div>
      </MobileChromeProvider>
    </AdaptiveNavigationController>
  );
}
