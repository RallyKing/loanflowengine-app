"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useUserSettings } from "@/lib/userSettingsContext";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import {
  mergeDisplaySettingsColorPatch,
  parseUiDisplayColors,
  type UiDisplayColorKey,
} from "@/lib/uiDisplaySettings";
import {
  mergeDisplaySettingsTimezone,
  resolveViewerTimeZone,
} from "@/lib/dateTimeZone";
import {
  mergeBlockSyncBehaviorIntoSettings,
  parseBlockSyncBehavior,
  type BlockSyncBehaviorParsed,
} from "@/lib/blockSyncBehaviorSettings";
import { useColorScheme } from "@/lib/colorScheme";
import { Button } from "@/components/ui/Button";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { Input, Select } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  AI_PROVIDERS_PATH,
  MESSAGE_TEMPLATES_PATH,
  SETTINGS_DISPLAY_TAB_FROM_SECTION,
  type SettingsDisplayTabId,
} from "@/lib/settingsRegistry";
import {
  useScrollSettingsSectionIntoView,
  useSettingsHashSection,
} from "@/lib/useSettingsHashSection";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { APP_HOME_HREF } from "@/lib/brandIdentity";
import { LenderContactMigrationValidationCard } from "@/components/LenderContactMigrationValidationCard";
import { NavManager } from "@/components/navigation/NavManager";
import type {
  LiveStatusPillMode,
  MotionPreference,
  SidePanelAnimationMode,
  TableDensityMode,
  TextScale,
} from "@/lib/userSettingsStorage";
import { DEFAULT_PIPELINE_STAGE_STYLES } from "@/lib/pipelineStatus";
import { PipelineBlockAdminDashboard } from "@/components/PipelineBlockAdminDashboard";
import { OrganizationSettingsPanel } from "@/components/OrganizationSettingsPanel";
import { TeamManagementPanel } from "@/components/TeamManagementPanel";
import { OrganizationBillingPanel } from "@/components/OrganizationBillingPanel";
import { CustomDomainsSettingsPanel } from "@/components/CustomDomainsSettingsPanel";
import { GettingStartedSettingsPanel } from "@/components/GettingStartedSettingsPanel";
import { HelpSupportSettingsPanel } from "@/components/HelpSupportSettingsPanel";
import { WebhookSettingsWorkspace } from "@/components/WebhookSettingsWorkspace";
import { ProductKnowledgeAdminPanel } from "@/components/settings/ProductKnowledgeAdminPanel";
import { SystemAdminSettingsPanel } from "@/components/system-admin/SystemAdminSettingsPanel";
import {
  SettingsJumpNav,
  SettingsSectionCard,
} from "@/components/settings/SettingsHubChrome";
import { SettingsDisplaySection } from "@/components/settings/SettingsDisplaySection";
import { SettingsWorkflowSection } from "@/components/settings/SettingsWorkflowSection";
import { ActionSuiteModal } from "@/components/ui/ActionSuite";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useAuth } from "@/lib/sessionUiClient";
import type { UserPreferencesV1 } from "@/lib/userPreferencesModel";
import {
  NOTIFY_DEADLINE_EMAIL_KEY,
  NOTIFY_DEADLINE_INAPP_KEY,
  NOTIFY_EMAIL_ADDRESS_KEY,
  NOTIFY_EMAIL_MASTER_KEY,
  NOTIFY_FILE_UPDATE_EMAIL_KEY,
  NOTIFY_FILE_UPDATE_INAPP_KEY,
  NOTIFY_MASTER_ENABLED_KEY,
  NOTIFY_MENTION_EMAIL_KEY,
  NOTIFY_MENTION_INAPP_KEY,
  NOTIFY_TASK_ASSIGNMENT_EMAIL_KEY,
  NOTIFY_TASK_ASSIGNMENT_INAPP_KEY,
} from "@/lib/notificationPreferences";

const LIVE_PILL_OPTIONS: {
  value: LiveStatusPillMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "always",
    label: "Always show status",
    hint: "The header chip is visible whenever the window is wide enough — including a calm “Live” state.",
  },
  {
    value: "minimal",
    label: "Only when connecting, busy, or offline",
    hint: "Hides the green “Live” chip when everything is healthy so the header stays quieter.",
  },
];

export function SettingsPageClient() {
  const { confirm } = useOperationalConfirm();
  const { settings, update } = useUserSettings();
  const {
    preferences,
    updatePreferences,
    accountId,
    ready: prefsReady,
  } = useUserPreferences();
  const { activeOrganizationId, can: orgCan, isRbacActive } = useOrgPermissions();
  const { isGlobalAdmin } = useAuth();
  const actorKeyForConvex = useActorUserKey().trim();
  const syncConvexPreferences = useCallback(
    (patch: Partial<UserPreferencesV1>) =>
      updatePreferences(
        patch,
        activeOrganizationId
          ? { rbacOrganizationId: activeOrganizationId }
          : undefined,
      ),
    [updatePreferences, activeOrganizationId],
  );
  const canSyncDisplayColors = accountId.length > 0 && prefsReady;
  const uiColors = useMemo(
    () => parseUiDisplayColors(preferences.displaySettings),
    [preferences.displaySettings],
  );
  const viewerTimeZone = useMemo(
    () => resolveViewerTimeZone(preferences.displaySettings),
    [preferences.displaySettings],
  );
  const blockSyncBehavior = useMemo(
    () => parseBlockSyncBehavior(preferences.behaviorSettings),
    [preferences.behaviorSettings],
  );
  const setUiColor = useCallback(
    (key: UiDisplayColorKey, value: string | null) => {
      if (!canSyncDisplayColors) return;
      const next = mergeDisplaySettingsColorPatch(preferences.displaySettings, {
        [key]: value,
      });
      void syncConvexPreferences({ displaySettings: next });
    },
    [canSyncDisplayColors, preferences.displaySettings, syncConvexPreferences],
  );
  const resetUiColors = useCallback(() => {
    if (!canSyncDisplayColors) return;
    const next = mergeDisplaySettingsColorPatch(preferences.displaySettings, {
      blockColor: null,
      labelColor: null,
      indicatorColor: null,
      textColor: null,
    });
    void syncConvexPreferences({ displaySettings: next });
  }, [canSyncDisplayColors, preferences.displaySettings, syncConvexPreferences]);

  const setViewerTimeZone = useCallback(
    (timezone: string) => {
      if (!canSyncDisplayColors) return;
      const next = mergeDisplaySettingsTimezone(
        preferences.displaySettings,
        timezone,
      );
      void syncConvexPreferences({ displaySettings: next });
    },
    [canSyncDisplayColors, preferences.displaySettings, syncConvexPreferences],
  );

  const patchBlockSyncBehavior = useCallback(
    (patch: Partial<BlockSyncBehaviorParsed>) => {
      if (!canSyncDisplayColors) return;
      void syncConvexPreferences({
        behaviorSettings: mergeBlockSyncBehaviorIntoSettings(
          preferences.behaviorSettings,
          patch,
        ),
      });
    },
    [canSyncDisplayColors, preferences.behaviorSettings, syncConvexPreferences],
  );
  const patchNotificationBehavior = useCallback(
    (patch: Record<string, unknown>) => {
      if (!canSyncDisplayColors) return;
      void syncConvexPreferences({
        behaviorSettings: {
          ...preferences.behaviorSettings,
          ...patch,
        },
      });
    },
    [canSyncDisplayColors, preferences.behaviorSettings, syncConvexPreferences],
  );

  const notifyFlag = useCallback(
    (key: string, fallback: boolean): boolean => {
      const v = preferences.behaviorSettings[key];
      if (v === undefined || v === null) return fallback;
      return Boolean(v);
    },
    [preferences.behaviorSettings],
  );

  const notificationEmailRaw =
    typeof preferences.behaviorSettings[NOTIFY_EMAIL_ADDRESS_KEY] === "string"
      ? (preferences.behaviorSettings[NOTIFY_EMAIL_ADDRESS_KEY] as string)
      : "";

  const toggleNotify = useCallback(
    (key: string, checked: boolean) => {
      patchNotificationBehavior({ [key]: checked });
    },
    [patchNotificationBehavior],
  );
  const { scheme, setScheme } = useColorScheme();
  const hashSection = useSettingsHashSection();
  useScrollSettingsSectionIntoView(hashSection);
  const displayInitialTab: SettingsDisplayTabId =
    (hashSection
      ? SETTINGS_DISPLAY_TAB_FROM_SECTION[hashSection]
      : undefined) ?? "theme";

  const [migrationModalOpen, setMigrationModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wider">
              Preferences hub
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            One place for display comfort, workflow defaults, communications,
            and team settings. Pipeline admin stores global drawer policy in the
            database.
          </p>
        </div>
        <Link
          href={APP_HOME_HREF}
          className={cn(
            "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-dlc-md border border-border",
            "bg-dlc-surface px-3 text-xs font-medium text-foreground shadow-dlc-1",
            "hover:bg-dlc-surface-high hover:border-brand-accent/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1",
            "duration-dlc-short ease-dlc-standard",
          )}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to app
        </Link>
      </div>

      <div
        className="flex flex-col gap-8 md:flex-row md:items-start md:gap-10"
        data-testid="settings-hub-layout"
      >
        <SettingsJumpNav
          hashSection={hashSection}
          isGlobalAdmin={Boolean(isGlobalAdmin)}
        />

        <div
          className="flex min-w-0 flex-1 flex-col gap-8"
          data-testid="settings-hub-content"
        >
          <SettingsDisplaySection
            initialTab={displayInitialTab}
            canSyncDisplayColors={canSyncDisplayColors}
            viewerTimeZone={viewerTimeZone}
            setViewerTimeZone={setViewerTimeZone}
            uiColors={uiColors}
            setUiColor={setUiColor}
            resetUiColors={resetUiColors}
            motionPreference={settings.motionPreference}
            textScale={settings.textScale}
            enhancedFocusRings={settings.enhancedFocusRings}
            tableDensity={settings.tableDensity}
            sidePanelAnimation={settings.sidePanelAnimation}
            onMotionPreferenceChange={(motionPreference: MotionPreference) =>
              update({ motionPreference })
            }
            onTextScaleChange={(textScale: TextScale) => update({ textScale })}
            onEnhancedFocusRingsChange={(enhancedFocusRings: boolean) =>
              update({ enhancedFocusRings })
            }
            onTableDensityChange={(tableDensity: TableDensityMode) =>
              update({ tableDensity })
            }
            onSidePanelAnimationChange={(
              sidePanelAnimation: SidePanelAnimationMode,
            ) => update({ sidePanelAnimation })}
          />

          <SettingsSectionCard
            id="performance"
            title="This device"
            description="Local preference snapshot and reset to defaults."
          >
            <p className="text-sm text-muted-foreground">
              The app prerenders what it can, streams live data when you are
              connected, and uses lightweight lists on Browse. A production
              deploy can add a CDN and HTTP/2 — not toggles in this local panel.
            </p>
            <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Current snapshot</p>
                <p className="text-sm text-foreground">
                  Shell <span className="font-medium">{scheme}</span>
                  {" · "}
                  Text <span className="font-medium">{settings.textScale}</span>
                  {" · "}
                  Motion{" "}
                  <span className="font-medium">{settings.motionPreference}</span>
                  {" · "}
                  Focus{" "}
                  <span className="font-medium">
                    {settings.enhancedFocusRings ? "enhanced" : "default"}
                  </span>
                  {" · "}
                  Live pill{" "}
                  <span className="font-medium">{settings.liveStatusPill}</span>
                  {" · "}
                  Tables{" "}
                  <span className="font-medium">{settings.tableDensity}</span>
                  {" · "}
                  Drawers{" "}
                  <span className="font-medium">
                    {settings.sidePanelAnimation}
                  </span>
                  {" · "}
                  Intake save{" "}
                  <span className="font-medium">
                    {settings.intakeAutosaveCadence}
                  </span>
                  {" · "}
                  File sections{" "}
                  <span className="font-medium">
                    {settings.fileSectionDefaultMode}
                  </span>
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void (async () => {
                    const ok = await confirm({
                      title: "Reset settings",
                      entityName: "This device",
                      impact:
                        "All settings on this device return to defaults.",
                      confirmLabel: "Reset",
                    });
                    if (!ok) return;
                    setScheme("default");
                    update({
                      motionPreference: "system",
                      textScale: "normal",
                      pipelineDefaultView: "table",
                      enhancedFocusRings: false,
                      liveStatusPill: "always",
                      tableDensity: "comfortable",
                      sidePanelAnimation: "slide",
                      intakeAutosaveCadence: "standard",
                      fileSectionDefaultMode: "allCollapsed",
                      pipelineStageStyles: { ...DEFAULT_PIPELINE_STAGE_STYLES },
                    });
                  })();
                }}
              >
                Reset to defaults
              </Button>
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard
            id="gettingStarted"
            title="Getting started"
            description="Optional setup checklist — team, first file, and first contact. You can resume or dismiss it anytime."
          >
            <GettingStartedSettingsPanel />
          </SettingsSectionCard>

          <SettingsSectionCard
            id="helpSupport"
            title="Help & support"
            description="Search the feature encyclopedia, keyboard shortcuts, contextual tips, and contact support."
          >
            <HelpSupportSettingsPanel />
          </SettingsSectionCard>

          <SettingsSectionCard
            id="navigation"
            title="Navigation"
            description="Primary routes in the sidebar, collapsed rail, and headers. Changes sync to this account when you save."
          >
            <NavManager />
          </SettingsSectionCard>

          <SettingsSectionCard
            id="domains"
            title="Custom domains"
            description="Map a hostname to your organization for white-label URLs. SSL is handled by your host (e.g. Vercel) after DNS points at the app."
          >
            <CustomDomainsSettingsPanel />
          </SettingsSectionCard>

          <SettingsWorkflowSection
            settings={settings}
            update={update}
            canSyncDisplayColors={canSyncDisplayColors}
            blockSyncBehavior={blockSyncBehavior}
            patchBlockSyncBehavior={patchBlockSyncBehavior}
            preferences={preferences}
            prefsReady={prefsReady}
            accountId={accountId}
            syncConvexPreferences={syncConvexPreferences}
            activeOrganizationId={activeOrganizationId}
            actorKeyForConvex={actorKeyForConvex}
          />

          <SettingsSectionCard
            id="pipelineAdmin"
            title="Pipeline admin"
            description="Global drawer blocks, required sections, defaults for new files, and optional bulk sync across all pipeline files."
          >
            <p className="text-sm text-muted-foreground">
              <Link
                href="/settings/pipeline-stages"
                className="text-primary underline"
              >
                Pipeline stages
              </Link>
              {" — customize funnel stages and sub-stages for your organization."}
            </p>
            {isGlobalAdmin ? (
              <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm">
                <span className="font-medium text-foreground">System admin</span>
                {" — "}
                <a href="#systemAdmin" className="underline">
                  Switch tenant (GodMode)
                </a>
                .
              </div>
            ) : null}
            {!isRbacActive || orgCan("blocks.manage") ? (
              <PipelineBlockAdminDashboard
                rbacOrganizationId={activeOrganizationId ?? undefined}
                actorUserKey={accountId.trim() || undefined}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                You don&apos;t have permission to manage global pipeline blocks
                for this team.
              </p>
            )}
          </SettingsSectionCard>

          <SettingsSectionCard
            id="messageTemplates"
            title="Message templates (Email & SMS)"
            description="Reusable message templates live under Automations — same communicationTemplates library used in compose."
          >
            <p className="text-sm text-muted-foreground">
              Automations is the primary hub for email, SMS, and future
              automation templates. Settings keeps this link only.
            </p>
            <Link
              href={MESSAGE_TEMPLATES_PATH}
              className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
              data-testid="settings-message-templates-link"
            >
              Open Automations template library
            </Link>
          </SettingsSectionCard>

          <SettingsSectionCard
            id="notifications"
            title="Notifications"
            description="Stored in Convex with your account preferences. Task @mentions use words like @yourAccountId in task or file notes."
          >
            {!canSyncDisplayColors ? (
              <p className="text-sm text-muted-foreground">
                Set an account id (or sign in when available) to sync
                notification preferences to the server.
              </p>
            ) : (
              <div className="max-w-xl space-y-6">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={notifyFlag(NOTIFY_MASTER_ENABLED_KEY, true)}
                    onChange={(e) =>
                      toggleNotify(NOTIFY_MASTER_ENABLED_KEY, e.target.checked)
                    }
                  />
                  <span>
                    <span className="text-sm font-medium">
                      Enable in-app notifications
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Master switch for the Alerts menu. Per-category toggles
                      below still apply.
                    </span>
                  </span>
                </label>

                <div className="space-y-2 border-t border-border/60 pt-4">
                  <p className="text-sm font-medium">Email (optional)</p>
                  <p className="text-xs text-muted-foreground">
                    Requires{" "}
                    <code className="rounded bg-muted px-1">RESEND_API_KEY</code>{" "}
                    and{" "}
                    <code className="rounded bg-muted px-1">
                      NOTIFICATION_EMAIL_FROM
                    </code>{" "}
                    in the Convex dashboard. Messages are sent via Resend.
                    Workspace outbound email (from the pipeline drawer) also uses{" "}
                    <code className="rounded bg-muted px-1">SYSTEM_EMAIL_FROM</code>{" "}
                    when set, otherwise falls back to{" "}
                    <code className="rounded bg-muted px-1">
                      NOTIFICATION_EMAIL_FROM
                    </code>
                    . Open tracking needs{" "}
                    <code className="rounded bg-muted px-1">
                      EMAIL_PUBLIC_BASE_URL
                    </code>{" "}
                    (your Convex site URL, e.g. https://… .convex.site). Inbound
                    reply webhooks use{" "}
                    <code className="rounded bg-muted px-1">
                      SYSTEM_EMAIL_INBOUND_SECRET
                    </code>{" "}
                    POSTed as header{" "}
                    <code className="rounded bg-muted px-1">
                      X-System-Email-Secret
                    </code>{" "}
                    to{" "}
                    <code className="rounded bg-muted px-1">
                      /webhooks/system-email/inbound
                    </code>{" "}
                    with JSON {"{"}{" "}
                    <code className="rounded bg-muted px-1">correlationId</code>
                    , <code className="rounded bg-muted px-1">snippet</code> {"}"}{" "}
                    (wire from your email provider or automation).
                  </p>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={notifyFlag(NOTIFY_EMAIL_MASTER_KEY, false)}
                      onChange={(e) =>
                        toggleNotify(NOTIFY_EMAIL_MASTER_KEY, e.target.checked)
                      }
                    />
                    <span className="text-sm">
                      Allow email for enabled categories
                    </span>
                  </label>
                  <div className="space-y-1">
                    <label
                      htmlFor="notification-email"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Notification email address
                    </label>
                    <Input
                      id="notification-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={notificationEmailRaw}
                      onChange={(e) =>
                        patchNotificationBehavior({
                          [NOTIFY_EMAIL_ADDRESS_KEY]: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-3 border-t border-border/60 pt-4">
                  <p className="text-sm font-medium">Categories</p>
                  {(
                    [
                      [
                        "Task assignment",
                        NOTIFY_TASK_ASSIGNMENT_INAPP_KEY,
                        NOTIFY_TASK_ASSIGNMENT_EMAIL_KEY,
                      ],
                      [
                        "File & deal updates",
                        NOTIFY_FILE_UPDATE_INAPP_KEY,
                        NOTIFY_FILE_UPDATE_EMAIL_KEY,
                      ],
                      [
                        "@Mentions",
                        NOTIFY_MENTION_INAPP_KEY,
                        NOTIFY_MENTION_EMAIL_KEY,
                      ],
                      [
                        "Deadline digest",
                        NOTIFY_DEADLINE_INAPP_KEY,
                        NOTIFY_DEADLINE_EMAIL_KEY,
                      ],
                    ] as const
                  ).map(([label, inAppKey, emailKey]) => (
                    <div
                      key={inAppKey}
                      className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-sm font-medium">{label}</span>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={notifyFlag(inAppKey, true)}
                            onChange={(e) =>
                              toggleNotify(inAppKey, e.target.checked)
                            }
                          />
                          In-app
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={notifyFlag(emailKey, false)}
                            onChange={(e) =>
                              toggleNotify(emailKey, e.target.checked)
                            }
                          />
                          Email
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SettingsSectionCard>

          <SettingsSectionCard
            id="webhooks"
            title="Webhooks"
            description="Register multi-event HTTPS endpoints, or configure one merchant channel webhook for SMS/email fan-out (GHL pattern). Deliveries never block the UI."
          >
            <WebhookSettingsWorkspace />
          </SettingsSectionCard>

          <SettingsSectionCard
            id="aiProviders"
            title="AI API keys"
            description="Connect your own OpenAI, Anthropic, Gemini, or custom (OpenAI-compatible) provider. Keys are org-scoped and never shown in full after save."
          >
            <p className="text-sm text-muted-foreground">
              Open the full manager from Jump-to → Integrations, or go directly
              to the dedicated AI providers page. Due diligence prompts live on
              the same screen.
            </p>
            <Link
              href={AI_PROVIDERS_PATH}
              className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
              data-testid="settings-ai-providers-link"
            >
              Open AI API keys
            </Link>
          </SettingsSectionCard>

          <SettingsSectionCard
            id="data"
            title="Data and connectivity"
            description="Live Convex channel indicator and where preferences live."
          >
            <div className="max-w-md space-y-2">
              <label className="sr-only" htmlFor="live-pill-mode">
                Live connection indicator
              </label>
              <p className="text-sm font-medium text-foreground">
                Header live status chip
              </p>
              <Select
                id="live-pill-mode"
                value={settings.liveStatusPill}
                onChange={(e) => {
                  update({
                    liveStatusPill: e.target.value as LiveStatusPillMode,
                  });
                }}
                className="w-full"
              >
                {LIVE_PILL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                {
                  LIVE_PILL_OPTIONS.find(
                    (o) => o.value === settings.liveStatusPill,
                  )?.hint
                }
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Preferences are stored in{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                localStorage
              </code>{" "}
              under versioned keys (settings, color scheme). Clearing site data
              resets them.
            </p>
            <div className="mt-6 max-w-xl space-y-2">
              <p className="text-sm font-medium text-foreground">
                Lender contact migration (Convex)
              </p>
              <p className="text-xs text-muted-foreground">
                Validates migrated links against lender source rows. If this
                fails, fix data before relying on the &quot;Lender contacts&quot;
                hub in the lender drawer.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMigrationModalOpen(true)}
                data-testid="settings-run-migration-check"
              >
                Run migration check…
              </Button>
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard
            id="organization"
            title="Organization"
            description="Create a team, invite members, assign admin or member roles, and manage access in this app."
          >
            <OrganizationSettingsPanel />
          </SettingsSectionCard>

          <SettingsSectionCard
            id="teamManagement"
            title="Team management"
            description="Phase 12 directory: create native users, assign product roles, deactivate accounts, reset passwords, and revoke active sessions."
          >
            <TeamManagementPanel />
          </SettingsSectionCard>

          <SettingsSectionCard
            id="billing"
            title="Team billing"
            description="View your plan, change tiers, see recent invoices, and open Stripe’s customer portal for payment methods and cancellation."
          >
            <OrganizationBillingPanel />
          </SettingsSectionCard>

          {isGlobalAdmin ? (
            <SettingsSectionCard
              id="productKnowledge"
              title="Product knowledge"
              description="Seed the encyclopedia, publish release notes to the Updates bell, and review automation drafts."
            >
              <ProductKnowledgeAdminPanel />
            </SettingsSectionCard>
          ) : null}

          {isGlobalAdmin ? (
            <SettingsSectionCard
              id="systemAdmin"
              title="System admin"
              description="Global tenant access and internal controls."
            >
              <SystemAdminSettingsPanel />
            </SettingsSectionCard>
          ) : null}
        </div>
      </div>

      {migrationModalOpen ? (
        <ActionSuiteModal
          title="Lender contact migration"
          onClose={() => setMigrationModalOpen(false)}
          testId="settings-migration-check-modal"
        >
          <div className="max-h-[min(70dvh,520px)] overflow-y-auto overscroll-contain">
            <LenderContactMigrationValidationCard />
          </div>
        </ActionSuiteModal>
      ) : null}
    </div>
  );
}
