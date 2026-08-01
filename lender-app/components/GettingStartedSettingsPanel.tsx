"use client";

import { useAuth } from "@/lib/sessionUiClient";
import { useMutation, useQueries, useConvexAuth, type RequestForQueries } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Button } from "@/components/ui/Button";
import { useProductTour } from "@/lib/productTourContext";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useConvexOrgQueryReady } from "@/lib/useConvexOrgQueryReady";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";

type OnboardingViewerState = FunctionReturnType<
  typeof api.userOnboarding.getForViewer
>;
type DemoWorkspaceStatus = FunctionReturnType<typeof api.demoWorkspace.status>;

function degradedDemoStatus(): DemoWorkspaceStatus {
  return {
    bundleId: "",
    loaded: false,
    counts: { pipeline: 0, contacts: 0, lenders: 0, tasks: 0 },
    plan: "basic",
    pipelineFileCount: 0,
    pipelineFileCap: null,
    canLoadDemo: false,
    loadBlockedReason: null,
  };
}

export function GettingStartedSettingsPanel() {
  const { confirm } = useOperationalConfirm();
  const { isLoaded, isSignedIn } = useAuth();
  const { startTour } = useProductTour();
  const { accountId: preferencesAccountId } = useUserPreferences();
  const memberKey = useActorUserKey().trim();
  const { activeOrganizationId, can: orgCan } = useOrgPermissions();
  const { isAuthenticated, isLoading: convexAuthLoading } = useConvexAuth();
  const orgQueryReady = useConvexOrgQueryReady();

  const gettingStartedQueries = useMemo((): RequestForQueries => {
    const q: RequestForQueries = {};
    if (
      isLoaded &&
      isSignedIn &&
      memberKey &&
      isAuthenticated &&
      !convexAuthLoading
    ) {
      q.onboarding = {
        query: api.userOnboarding.getForViewer,
        args: { memberUserKey: memberKey },
      };
    }
    if (orgQueryReady && activeOrganizationId && memberKey) {
      q.demoStatus = {
        query: api.demoWorkspace.status,
        args: {
          organizationId: activeOrganizationId,
          memberUserKey: memberKey,
        },
      };
    }
    return q;
  }, [
    isLoaded,
    isSignedIn,
    memberKey,
    isAuthenticated,
    convexAuthLoading,
    orgQueryReady,
    activeOrganizationId,
  ]);

  const gsResults = useQueries(gettingStartedQueries);
  const onboardingRaw =
    isLoaded && isSignedIn && memberKey ? gsResults.onboarding : undefined;
  const state: OnboardingViewerState | undefined =
    onboardingRaw instanceof Error
      ? {
          skipped: false,
          collapsed: false,
          gettingStartedDismissed: false,
          gettingStartedComplete: false,
          gettingStartedSkipped: false,
        }
      : onboardingRaw;
  const demoRaw =
    isLoaded && isSignedIn && activeOrganizationId && memberKey
      ? gsResults.demoStatus
      : undefined;
  const demoStatus: DemoWorkspaceStatus | undefined =
    demoRaw instanceof Error
      ? degradedDemoStatus()
      : demoRaw;
  const resume = useMutation(api.userOnboarding.resume);
  const loadDemo = useMutation(api.demoWorkspace.load);
  const removeDemo = useMutation(api.demoWorkspace.remove);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState<"load" | "remove" | null>(null);

  const canLoadPermissions =
    orgCan("files.edit") && orgCan("contacts.manage");
  const canRemovePermissions =
    orgCan("files.delete") && orgCan("contacts.manage");

  if (!isLoaded) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading…
      </p>
    );
  }

  if (!isSignedIn) {
    return (
      <p className="text-sm text-muted-foreground">
        Sign in to manage your setup checklist.
      </p>
    );
  }

  return (
    <div className="max-w-xl space-y-3">
      <p className="text-sm text-muted-foreground">
        The floating checklist helps you join a team, create your first
        pipeline file, and add a contact. It never blocks navigation — you can
        skip or minimize it anytime.
      </p>
      {state?.skipped ? (
        <p
          className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-50"
          role="status"
        >
          You chose <strong>Skip for now</strong>. Resume below to show the
          checklist again.
        </p>
      ) : null}
      {state && !state.skipped && state.gettingStartedDismissed ? (
        <p
          className="rounded-md border border-border/80 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          role="status"
        >
          You minimized the getting started checklist. Use{" "}
          <strong>Resume checklist</strong> below to open it again.
        </p>
      ) : null}

      <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-3">
        <p className="text-sm font-medium text-foreground">Demo workspace</p>
        <p className="mt-1 text-xs text-muted-foreground">
          One-click sample <strong>pipeline files</strong>,{" "}
          <strong>contacts</strong>, <strong>lenders</strong>, and{" "}
          <strong>tasks</strong>. Every record is prefixed with{" "}
          <span className="font-medium text-foreground">[Demo]</span> and tagged
          so you can delete the whole bundle anytime (nothing touches your real
          data).
        </p>
        {!activeOrganizationId ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Select or create a team in the header to load demo data.
          </p>
        ) : demoStatus === undefined ? (
          <p className="mt-2 text-xs text-muted-foreground" role="status">
            Checking demo status…
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {demoStatus.loaded ? (
              <p
                className="text-xs text-muted-foreground"
                role="status"
              >
                Demo loaded — {demoStatus.counts.pipeline} files,{" "}
                {demoStatus.counts.contacts} contacts,{" "}
                {demoStatus.counts.lenders} lenders, {demoStatus.counts.tasks}{" "}
                tasks.
              </p>
            ) : null}
            {demoStatus.loadBlockedReason ? (
              <p
                className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-950 dark:text-amber-50"
                role="status"
              >
                {demoStatus.loadBlockedReason}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={
                  demoBusy !== null ||
                  !canLoadPermissions ||
                  !demoStatus.canLoadDemo ||
                  demoStatus.loaded
                }
                title={
                  !canLoadPermissions
                    ? "You need permission to edit files and manage contacts."
                    : undefined
                }
                onClick={() => {
                  void (async () => {
                    if (!activeOrganizationId) return;
                    const ok = await confirm({
                      title: "Load demo workspace",
                      entityName: "Your team",
                      impact:
                        "Adds labeled [Demo] sample files, contacts, lenders, and tasks for your current team.",
                      confirmLabel: "Load demo",
                    });
                    if (!ok) return;
                    setDemoBusy("load");
                    try {
                      await loadDemo({
                        organizationId: activeOrganizationId,
                        memberUserKey: memberKey,
                        preferencesAccountId:
                          preferencesAccountId.trim() || undefined,
                      });
                    } finally {
                      setDemoBusy(null);
                    }
                  })();
                }}
              >
                {demoBusy === "load" ? "Loading…" : "Load demo workspace"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  demoBusy !== null ||
                  !canRemovePermissions ||
                  !demoStatus.loaded
                }
                title={
                  !canRemovePermissions
                    ? "You need permission to delete files and manage contacts."
                    : undefined
                }
                onClick={() => {
                  void (async () => {
                    if (!activeOrganizationId) return;
                    const ok = await confirm({
                      ...simpleDeleteConfirm("Demo workspace data", {
                        title: "Remove demo workspace",
                        impact:
                          "Deletes only rows tagged as the demo bundle for this team (sample files, contacts, lenders, and tasks).",
                        confirmLabel: "Remove demo",
                      }),
                    });
                    if (!ok) return;
                    setDemoBusy("remove");
                    try {
                      await removeDemo({
                        organizationId: activeOrganizationId,
                        memberUserKey: memberKey,
                      });
                    } finally {
                      setDemoBusy(null);
                    }
                  })();
                }}
              >
                {demoBusy === "remove" ? "Removing…" : "Remove demo data"}
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-3">
        <p className="text-sm font-medium text-foreground">Product tour</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Short walkthrough of Tasks, Pipeline, Deal library, and Contacts —
          with overlays you can replay anytime.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={startTour}
        >
          Start product tour
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || state === undefined}
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                await resume({ memberUserKey: memberKey });
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? "Saving…" : "Resume checklist"}
        </Button>
      </div>
    </div>
  );
}
