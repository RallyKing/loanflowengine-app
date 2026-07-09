"use client";

import { useAuth } from "@/lib/sessionUiClient";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation, useQueries, type RequestForQueries } from "convex/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useViewer } from "@/lib/sessionContext";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { settingsHref } from "@/lib/settingsRegistry";
import { zIndexStyle } from "@/lib/platform-framework";
import { Check, Circle, Users } from "lucide-react";

const linkOutlineClass =
  "inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted hover:border-primary/35 active:bg-muted/80";
const linkGhostClass =
  "inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/80 active:bg-muted";

const HIDDEN_PREFIXES = [
  "/login",
  "/sign-in",
  "/signup",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/session-expired",
  "/portal",
] as const;

/** Runtime guard — silent no-ops hide refactor bugs; always warn in console. */
function runGettingStartedButtonAction(
  controlLabel: string,
  handler: (() => void | Promise<void>) | undefined,
): void {
  if (typeof handler !== "function") {
    console.warn(
      `[Getting started modal] "${controlLabel}" onClick handler is missing or not a function — check UserOnboardingChecklist refactor and imports.`,
    );
    return;
  }
  void handler();
}

function guardGettingStartedLinkClick(
  controlLabel: string,
  href: string,
  e: MouseEvent<HTMLAnchorElement>,
): void {
  if (typeof href !== "string" || !href.trim()) {
    console.warn(
      `[Getting started modal] "${controlLabel}" link has no href — navigation blocked.`,
    );
    e.preventDefault();
  }
}

function StepRow({
  done,
  title,
  description,
  children,
}: {
  done: boolean;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 rounded-lg border border-border/60 bg-background/80 p-3">
      <div className="mt-0.5 shrink-0" aria-hidden>
        {done ? (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-primary">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
        ) : (
          <span className="grid h-6 w-6 place-items-center rounded-full border border-border text-muted-foreground">
            <Circle className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
    </li>
  );
}

/**
 * Non-blocking getting-started checklist (session user + Convex persistence).
 * Does not intercept navigation or modals — users can use the app normally.
 */
export function UserOnboardingChecklist({
  layout = "saas",
}: {
  /** Classic layout reserves bottom space for `MobileBottomNav`. */
  layout?: "saas" | "classic";
}) {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, isGlobalAdmin } = useAuth();
  const viewer = useViewer();
  const { activeOrganizationId } = useOrgPermissions();
  const memberKey = useActorUserKey().trim();

  /**
   * Convex `userKey` must be the session `authUsers` id after internal auth.
   * Never persist getting-started state under a pre-login browser `accountId`
   * while `isSignedIn` (avoids “stuck” dismiss + org peek mismatches).
   */
  const sessionUserKey = viewer?.userKey?.trim() ?? "";
  const mutationMemberKey =
    isSignedIn && sessionUserKey ? sessionUserKey : memberKey;
  const onboardingMemberKey = mutationMemberKey;

  /** Signed in but viewer not hydrated yet — don’t flash modal or call mutations with a stale key. */
  const sessionNotReady = isSignedIn && !sessionUserKey;

  /** `useQuery` throws on Convex errors; `useQueries` returns `Error` per key. */
  const checklistQueries = useMemo((): RequestForQueries => {
    const q: RequestForQueries = {};
    if (isLoaded && isSignedIn && !sessionNotReady) {
      q.onboarding = {
        query: api.userOnboarding.getForViewer,
        args: onboardingMemberKey
          ? { memberUserKey: onboardingMemberKey }
          : {},
      };
    }
    if (activeOrganizationId && mutationMemberKey) {
      q.filesPeek = {
        query: api.pipeline.listLight,
        args: {
          organizationId: activeOrganizationId,
          memberUserKey: mutationMemberKey,
          maxRows: 1,
        },
      };
      q.contactsPeek = {
        query: api.contacts.list,
        args: {
          organizationId: activeOrganizationId,
          memberUserKey: mutationMemberKey,
        },
      };
    }
    return q;
  }, [
    isLoaded,
    isSignedIn,
    sessionNotReady,
    onboardingMemberKey,
    activeOrganizationId,
    mutationMemberKey,
  ]);

  const checklistResults = useQueries(checklistQueries);
  const onboardingRaw =
    isLoaded && isSignedIn && !sessionNotReady
      ? checklistResults.onboarding
      : undefined;
  const onboardingLoadError = onboardingRaw instanceof Error;
  /** Convex still loading subscription result for onboarding query. */
  const onboardingLoadPending =
    isLoaded &&
    isSignedIn &&
    !sessionNotReady &&
    onboardingRaw === undefined;
  /** Error, not yet loaded, or session key not ready — treat like dismissed; never show the modal. */
  const onboardingUnavailable =
    sessionNotReady || onboardingLoadError || onboardingLoadPending;
  const onboarding = onboardingLoadError ? null : onboardingRaw;

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (sessionNotReady) return;
    if (!onboardingLoadError) return;
    console.warn(
      "[Getting started modal] Onboarding state failed to load; modal hidden (treated as dismissed).",
      onboardingRaw instanceof Error ? onboardingRaw.message : onboardingRaw,
    );
  }, [isLoaded, isSignedIn, sessionNotReady, onboardingLoadError, onboardingRaw]);

  const filesPeekRaw =
    activeOrganizationId && mutationMemberKey
      ? checklistResults.filesPeek
      : undefined;
  const filesPeek =
    filesPeekRaw instanceof Error
      ? []
      : (filesPeekRaw as unknown[] | undefined);
  const contactsPeekRaw =
    activeOrganizationId && mutationMemberKey
      ? checklistResults.contactsPeek
      : undefined;
  const contactsPeek =
    contactsPeekRaw instanceof Error
      ? []
      : (contactsPeekRaw as unknown[] | undefined);

  const setSkipped = useMutation(api.userOnboarding.setSkipped);
  const dismissGettingStarted = useMutation(api.userOnboarding.dismissGettingStarted);
  const markGettingStartedComplete = useMutation(
    api.userOnboarding.markGettingStartedComplete,
  );
  const { confirm } = useOperationalConfirm();

  const stepOrgDone = Boolean(activeOrganizationId && viewer?.organizationId);
  const stepFileDone = Boolean(filesPeek && filesPeek.length > 0);
  const stepContactDone = Boolean(contactsPeek && contactsPeek.length > 0);

  const completedCount = [
    stepOrgDone,
    stepFileDone,
    stepContactDone,
  ].filter(Boolean).length;
  const allDone = completedCount === 3;

  const [skipBusy, setSkipBusy] = useState(false);
  const [dismissBusy, setDismissBusy] = useState(false);
  /** True until Convex confirms `gettingStartedDismissed` — avoids flash open before mutation completes. */
  const [dismissOptimistic, setDismissOptimistic] = useState(false);

  const dismissedPersisted =
    onboardingUnavailable || onboarding?.gettingStartedDismissed === true;
  useEffect(() => {
    if (!dismissedPersisted) {
      setDismissOptimistic(false);
    }
  }, [dismissedPersisted]);

  const dismissed = dismissedPersisted || dismissOptimistic;

  /** Single source of truth: `userPreferences.gettingStartedComplete` (Convex); `allDone` until sync finishes. */
  const checklistFinished =
    !onboardingUnavailable &&
    (onboarding?.gettingStartedComplete === true || allDone);

  const hideForRoute = useMemo(() => {
    if (!pathname) return true;
    return HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  }, [pathname]);

  const showPanel = useMemo(() => {
    if (!isLoaded || !isSignedIn) return false;
    if (hideForRoute) return false;
    /** Platform admins never see the getting-started gate (avoids post-migration loops). */
    if (isGlobalAdmin) return false;
    if (onboardingUnavailable) return false;
    if (dismissed) return false;
    if (onboarding?.skipped) return false;
    if (checklistFinished) return false;
    return true;
  }, [
    isLoaded,
    isSignedIn,
    hideForRoute,
    onboardingUnavailable,
    dismissed,
    onboarding,
    checklistFinished,
    isGlobalAdmin,
  ]);

  /** Persist completion to `userPreferences` so the modal does not reopen on other devices / reloads. */
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (onboardingUnavailable || onboarding === null) return;
    if (!allDone) return;
    if (onboarding.gettingStartedComplete) return;
    void markGettingStartedComplete({ memberUserKey: mutationMemberKey });
  }, [
    isLoaded,
    isSignedIn,
    onboardingUnavailable,
    onboarding,
    allDone,
    mutationMemberKey,
    markGettingStartedComplete,
  ]);

  const onSkip = useCallback(async () => {
    const ok = await confirm({
      title: "Skip setup",
      entityName: "Getting started",
      impact:
        "You can resume anytime from Settings → Getting started.",
      confirmLabel: "Skip for now",
    });
    if (!ok) return;
    setSkipBusy(true);
    try {
      if (typeof setSkipped !== "function") {
        console.warn(
          '[Getting started modal] "Skip for now" mutation (`setSkipped`) is missing — check Convex `api.userOnboarding.setSkipped` and codegen.',
        );
        return;
      }
      await setSkipped({ skipped: true, memberUserKey: mutationMemberKey });
    } finally {
      setSkipBusy(false);
    }
  }, [setSkipped, mutationMemberKey, confirm]);

  const onMinimize = useCallback(async () => {
    setDismissOptimistic(true);
    setDismissBusy(true);
    try {
      if (typeof dismissGettingStarted !== "function") {
        console.warn(
          '[Getting started modal] "Minimize" mutation (`dismissGettingStarted`) is missing — check Convex `api.userOnboarding.dismissGettingStarted` and codegen.',
        );
        setDismissOptimistic(false);
        return;
      }
      await dismissGettingStarted({ memberUserKey: mutationMemberKey });
    } catch {
      setDismissOptimistic(false);
    } finally {
      setDismissBusy(false);
    }
  }, [dismissGettingStarted, mutationMemberKey]);

  const teamSettingsHref = settingsHref("organization");
  const gettingStartedSettingsHref = settingsHref("gettingStarted");
  const pipelineHref = "/pipeline";
  const contactsHref = "/contacts";

  useEffect(() => {
    if (!showPanel) return;
    if (typeof setSkipped !== "function") {
      console.warn(
        '[Getting started modal] `setSkipped` mutation is missing — "Skip for now" will fail. Check Convex api.userOnboarding.setSkipped.',
      );
    }
    if (typeof dismissGettingStarted !== "function") {
      console.warn(
        '[Getting started modal] `dismissGettingStarted` mutation is missing — "Minimize" will fail. Check api.userOnboarding.dismissGettingStarted.',
      );
    }
    if (typeof onSkip !== "function") {
      console.warn(
        '[Getting started modal] `onSkip` is not a function — "Skip for now" control is broken.',
      );
    }
    if (typeof onMinimize !== "function") {
      console.warn(
        '[Getting started modal] `onMinimize` is not a function — "Minimize" control is broken.',
      );
    }
    const linkTargets: { label: string; href: string }[] = [
      { label: "Team settings", href: teamSettingsHref },
      { label: "Settings → Getting started", href: gettingStartedSettingsHref },
      { label: "Pipeline", href: pipelineHref },
      { label: "Contacts", href: contactsHref },
    ];
    for (const { label, href } of linkTargets) {
      if (typeof href !== "string" || !href.trim()) {
        console.warn(
          `[Getting started modal] "${label}" resolved an empty href — fix routes or settingsHref.`,
        );
      }
    }
  }, [
    showPanel,
    setSkipped,
    dismissGettingStarted,
    onSkip,
    onMinimize,
    teamSettingsHref,
    gettingStartedSettingsHref,
    pipelineHref,
    contactsHref,
  ]);

  if (!showPanel) return null;

  /**
   * Stacking / pointer-events:
   * - Outer shell: `fixed inset-0` + `pointer-events-none` so the viewport is never a
   *   full-screen hit target — clicks reach the page, chrome, and bottom nav.
   * - Inner card: `pointer-events-auto` only on the modal surface so buttons/links work.
   * - z-index: `OVERLAY_Z_BASE.modal` (50) → above saas menu scrim (40), bottom nav (30), page.
   */
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 flex items-end justify-end",
        "pt-4 pl-4 pr-4",
        "pb-[max(1rem,calc(0.75rem+env(safe-area-inset-bottom)))] sm:pb-6 sm:pr-6",
        layout === "classic" &&
          "max-md:pb-[calc(4.75rem+env(safe-area-inset-bottom))]",
      )}
      style={zIndexStyle("modal")}
      data-testid="getting-started-modal-layer"
    >
      <div
        role="region"
        aria-label="Getting started checklist"
        className="pointer-events-auto relative w-[min(24rem,calc(100dvw-2rem))]"
      >
        <div className="overflow-hidden rounded-xl border border-border bg-card/95 shadow-xl backdrop-blur-md">
        <div className="border-b border-border/80 bg-muted/30 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Getting started
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {completedCount} of 3 complete · optional — explore anytime
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                disabled={dismissBusy}
                onClick={() =>
                  runGettingStartedButtonAction("Minimize", onMinimize)
                }
              >
                Minimize
              </Button>
            </div>
          </div>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
            aria-hidden
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${(completedCount / 3) * 100}%` }}
            />
          </div>
        </div>

        <ul className="max-h-[min(55vh,24rem)] space-y-2 overflow-y-auto p-3">
          <StepRow
            done={stepOrgDone}
            title="Set up your workspace"
            description="Your workspace is bound to a single organization. Open team settings to review members and roles."
          >
            <Link
              href={teamSettingsHref}
              className={linkOutlineClass}
              onClick={(e) =>
                guardGettingStartedLinkClick("Team settings", teamSettingsHref, e)
              }
            >
              Team settings
            </Link>
          </StepRow>

          <StepRow
            done={stepFileDone}
            title="Create your first file"
            description={
              stepOrgDone
                ? "Open Pipeline and add a client, project, and loan file."
                : "Finish team setup first — then create a pipeline file."
            }
          >
            {stepOrgDone ? (
              <Link
                href={pipelineHref}
                className={linkOutlineClass}
                onClick={(e) =>
                  guardGettingStartedLinkClick("Pipeline", pipelineHref, e)
                }
              >
                Pipeline
              </Link>
            ) : (
              <span
                className={cn(linkGhostClass, "pointer-events-none opacity-48")}
                aria-disabled
              >
                Pipeline
              </span>
            )}
          </StepRow>

          <StepRow
            done={stepContactDone}
            title="Add your first contact"
            description={
              stepOrgDone
                ? "Track people you work with and link them to files."
                : "Available after you’re on a team."
            }
          >
            {stepOrgDone ? (
              <Link
                href={contactsHref}
                className={linkOutlineClass}
                onClick={(e) =>
                  guardGettingStartedLinkClick("Contacts", contactsHref, e)
                }
              >
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Contacts
              </Link>
            ) : (
              <span
                className={cn(linkOutlineClass, "pointer-events-none opacity-48")}
                aria-disabled
              >
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Contacts
              </span>
            )}
          </StepRow>
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 bg-muted/20 px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={skipBusy}
            onClick={() =>
              runGettingStartedButtonAction("Skip for now", onSkip)
            }
          >
            Skip for now
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Resume under{" "}
            <Link
              href={gettingStartedSettingsHref}
              className="font-medium text-primary underline-offset-2 hover:underline"
              onClick={(e) =>
                guardGettingStartedLinkClick(
                  "Settings → Getting started",
                  gettingStartedSettingsHref,
                  e,
                )
              }
            >
              Settings → Getting started
            </Link>
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
