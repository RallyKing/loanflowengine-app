"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useUserSettings } from "@/lib/userSettingsContext";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import {
  AI_ASSIST_BEHAVIOR_KEY,
  readAiAssistEnabled,
} from "@/lib/userPreferencesModel";
import {
  hexForColorInput,
  mergeDisplaySettingsColorPatch,
  parseUiDisplayColors,
  type UiDisplayColorKey,
} from "@/lib/uiDisplaySettings";
import {
  mergeBlockSyncBehaviorIntoSettings,
  parseBlockSyncBehavior,
  type BlockSyncBehaviorParsed,
} from "@/lib/blockSyncBehaviorSettings";
import { useColorScheme } from "@/lib/colorScheme";
import { ColorSchemeToggle } from "@/components/ColorSchemeToggle";
import { Button } from "@/components/ui/Button";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { Input, Select } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  SETTINGS_CATEGORIES,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
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
  FileSectionDefaultMode,
  IntakeAutosaveCadence,
  LiveStatusPillMode,
  MotionPreference,
  PipelineViewPref,
  SidePanelAnimationMode,
  TableDensityMode,
  TextScale,
} from "@/lib/userSettingsStorage";
import {
  DEFAULT_PIPELINE_STAGE_STYLES,
  PIPELINE_STATUSES,
  isValidPipelineStageColor,
  resolvePipelineStageStyle,
  type PipelineStageStyle,
  type PipelineStageStyleMap,
  type PipelineStatusValue,
} from "@/lib/pipelineStatus";
import {
  loadPipelineDrawerLayout,
  normalizePipelineDrawerLayout,
} from "@/lib/pipelineDrawerLayoutStorage";
import { PipelineBlockAdminDashboard } from "@/components/PipelineBlockAdminDashboard";
import { PersonalNewFileTemplateSection } from "@/components/PersonalNewFileTemplateSection";
import { UserPipelineFileTemplatesSection } from "@/components/UserPipelineFileTemplatesSection";
import { UserSimpleWorkflowsSection } from "@/components/UserSimpleWorkflowsSection";
import { OrganizationSettingsPanel } from "@/components/OrganizationSettingsPanel";
import { TeamManagementPanel } from "@/components/TeamManagementPanel";
import { OrganizationBillingPanel } from "@/components/OrganizationBillingPanel";
import { CustomDomainsSettingsPanel } from "@/components/CustomDomainsSettingsPanel";
import { GettingStartedSettingsPanel } from "@/components/GettingStartedSettingsPanel";
import { HelpSupportSettingsPanel } from "@/components/HelpSupportSettingsPanel";
import { WebhookSettingsWorkspace } from "@/components/WebhookSettingsWorkspace";
import { ProductKnowledgeAdminPanel } from "@/components/settings/ProductKnowledgeAdminPanel";
import { SystemAdminSettingsPanel } from "@/components/system-admin/SystemAdminSettingsPanel";
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

const UI_DISPLAY_COLOR_DEFAULTS: Record<UiDisplayColorKey, string> = {
  blockColor: "#B0B8AE",
  labelColor: "#64748B",
  indicatorColor: "#047857",
  textColor: "#0F172A",
};

const UI_DISPLAY_COLOR_META: Record<
  UiDisplayColorKey,
  { headline: string; hint: string }
> = {
  blockColor: {
    headline: "Drawer & file block borders",
    hint: "Pipeline drawer cards and other bordered file sections.",
  },
  labelColor: {
    headline: "Field & section labels",
    hint: "Uppercase section titles and compact field labels.",
  },
  indicatorColor: {
    headline: "Indicators & stage accents",
    hint: "Sync chips, collapsed field-count badges, and stage pill borders / board dots.",
  },
  textColor: {
    headline: "Main body text",
    hint: "Default reading color across the app (inherits to most content).",
  },
};

const MOTION_OPTIONS: { value: MotionPreference; label: string; hint: string }[] = [
  {
    value: "system",
    label: "Match my device (recommended)",
    hint: "Respects the OS “reduced motion” setting.",
  },
  {
    value: "reduced",
    label: "Reduce motion in this app",
    hint: "Shorter transitions and less movement.",
  },
  {
    value: "full",
    label: "Allow full motion",
    hint: "Overrides a system reduced-motion choice for this app only, when you prefer it.",
  },
];

const TEXT_OPTIONS: { value: TextScale; label: string }[] = [
  { value: "normal", label: "Standard" },
  { value: "large", label: "Larger (easier to read for long sessions)" },
];

const PIPELINE_VIEW: { value: PipelineViewPref; label: string }[] = [
  { value: "table", label: "Table" },
  { value: "board", label: "Board" },
];

const LIVE_PILL_OPTIONS: { value: LiveStatusPillMode; label: string; hint: string }[] = [
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

const TABLE_DENSITY_OPTIONS: {
  value: TableDensityMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "comfortable",
    label: "Comfortable (default)",
    hint: "More breathing room in Browse, Pipeline table, and Ledger cells.",
  },
  {
    value: "compact",
    label: "Compact",
    hint: "Tighter padding so you see more rows without scrolling.",
  },
  {
    value: "analyst",
    label: "Analyst",
    hint: "Maximum information density for long sessions (still respects touch-target minimums in the shell).",
  },
];

const SIDE_PANEL_OPTIONS: {
  value: SidePanelAnimationMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "slide",
    label: "Slide in (default)",
    hint: "Lender, pipeline, and task drawers animate from the right.",
  },
  {
    value: "none",
    label: "Open instantly",
    hint: "Drawers appear immediately — can feel snappier on slower devices.",
  },
];

const FILE_SECTION_DEFAULT_OPTIONS: {
  value: FileSectionDefaultMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "allCollapsed",
    label: "All collapsed",
    hint: "Every drawer and deal section starts closed until you expand it.",
  },
  {
    value: "allExpanded",
    label: "All expanded",
    hint: "Open every section by default for a full scan of the file.",
  },
  {
    value: "dataSmart",
    label: "Expand sections with data (recommended)",
    hint: "Sections that already have answers or computed values stay open; empty ones stay collapsed.",
  },
];

const INTAKE_AUTOSAVE_OPTIONS: {
  value: IntakeAutosaveCadence;
  label: string;
  hint: string;
}[] = [
  {
    value: "fast",
    label: "Fast (~0.4s after you stop typing)",
    hint: "Saves sooner; slightly more network chatter while editing quickly.",
  },
  {
    value: "standard",
    label: "Standard (~0.6s)",
    hint: "Balanced default for most users and connections.",
  },
  {
    value: "relaxed",
    label: "Relaxed (~1.2s)",
    hint: "Fewer saves while you pause mid-sentence — good on slower links.",
  },
];

function SettingsSection({
  id,
  title,
  description,
  children,
  className,
}: {
  id: SettingsSectionId;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={`settings-section-${id}`}
      aria-labelledby={`settings-heading-${id}`}
      className={cn(
        "scroll-mt-28 overflow-hidden rounded-xl border border-border/80 bg-background shadow-sm lg:scroll-mt-32",
        className
      )}
    >
      <div className="border-b border-border/60 bg-muted/30 px-4 py-3 sm:px-5">
        <h2
          id={`settings-heading-${id}`}
          className="text-sm font-semibold tracking-tight sm:text-base"
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">{children}</div>
    </section>
  );
}

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
  const [stageStyleTarget, setStageStyleTarget] = useState<PipelineStatusValue>(
    () => PIPELINE_STATUSES[0]?.value ?? "confirm_interest",
  );

  const selectedStageStyle = useMemo(
    () => resolvePipelineStageStyle(stageStyleTarget, settings.pipelineStageStyles),
    [stageStyleTarget, settings.pipelineStageStyles]
  );

  const commitStageStyleField = (
    stage: PipelineStatusValue,
    key: keyof PipelineStageStyle,
    color: string
  ) => {
    if (!isValidPipelineStageColor(color)) return;
    const normalized = color.trim().toUpperCase();
    const next: PipelineStageStyleMap = {
      ...settings.pipelineStageStyles,
      [stage]: {
        ...(settings.pipelineStageStyles[stage] ?? {}),
        [key]: normalized,
      },
    };
    update({ pipelineStageStyles: next });
  };

  const resetStageStyle = (stage: PipelineStatusValue) => {
    const next: PipelineStageStyleMap = {
      ...settings.pipelineStageStyles,
      [stage]: { ...DEFAULT_PIPELINE_STAGE_STYLES[stage] },
    };
    update({ pipelineStageStyles: next });
  };

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
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            One place for your team, appearance, accessibility, workflow defaults,
            and device-local data behavior. Pipeline admin stores global drawer
            policy in the database.
          </p>
        </div>
        <Link
          href={APP_HOME_HREF}
          className={cn(
            "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border",
            "bg-background px-3 text-xs font-medium text-foreground hover:bg-muted hover:border-brand-accent/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1"
          )}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to app
        </Link>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        <nav
          className="lg:sticky lg:top-28 lg:w-56 lg:shrink-0"
          aria-label="Settings sections"
        >
          <p className="mb-2 hidden text-xs font-medium uppercase tracking-wider text-muted-foreground lg:block">
            Jump to
          </p>
          <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-4 lg:overflow-visible lg:pb-0">
            {SETTINGS_CATEGORIES.filter(
              (category) => !category.adminOnly || isGlobalAdmin,
            ).map((category) => (
              <div key={category.id} className="flex shrink-0 gap-1 lg:block lg:shrink">
                <p
                  className="hidden text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 lg:mb-1 lg:block"
                  title={category.description}
                >
                  {category.label}
                </p>
                <ul className="flex gap-1 lg:flex-col">
                  {category.sectionIds
                    .map((id) => SETTINGS_SECTIONS.find((s) => s.id === id))
                    .filter(
                      (s): s is (typeof SETTINGS_SECTIONS)[number] => s != null,
                    )
                    .map((s) => {
                      const active = hashSection === s.id;
                      return (
                        <li key={s.id} className="shrink-0 lg:shrink">
                          <a
                            href={`#${s.id}`}
                            title={s.description}
                            className={cn(
                              "block rounded-lg border px-3 py-2 text-sm transition-colors lg:py-1.5",
                              active
                                ? "border-primary/35 bg-primary/5 font-medium text-foreground"
                                : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                            )}
                          >
                            {s.label}
                          </a>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <SettingsSection
            id="gettingStarted"
            title="Getting started"
            description="Optional setup checklist — team, first file, and first contact. You can resume or dismiss it anytime."
          >
            <GettingStartedSettingsPanel />
          </SettingsSection>
          <SettingsSection
            id="helpSupport"
            title="Help & support"
            description="Search the feature encyclopedia, keyboard shortcuts, contextual tips, and contact support."
          >
            <HelpSupportSettingsPanel />
          </SettingsSection>
          <SettingsSection
            id="organization"
            title="Organization"
            description="Create a team, invite members, assign admin or member roles, and manage access in this app."
          >
            <OrganizationSettingsPanel />
          </SettingsSection>
          <SettingsSection
            id="teamManagement"
            title="Team management"
            description="Phase 12 directory: create native users, assign product roles, deactivate accounts, reset passwords, and revoke active sessions."
          >
            <TeamManagementPanel />
          </SettingsSection>
          <SettingsSection
            id="billing"
            title="Team billing"
            description="View your plan, change tiers, see recent invoices, and open Stripe’s customer portal for payment methods and cancellation."
          >
            <OrganizationBillingPanel />
          </SettingsSection>
          <SettingsSection
            id="domains"
            title="Custom domains"
            description="Map a hostname to your organization for white-label URLs. SSL is handled by your host (e.g. Vercel) after DNS points at the app."
          >
            <CustomDomainsSettingsPanel />
          </SettingsSection>
          <SettingsSection
            id="appearance"
            title="Appearance"
            description="Workspace shell — same choices as the header theme toggle."
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <p className="text-sm text-muted-foreground">Workspace theme</p>
              <ColorSchemeToggle />
            </div>
            <p className="text-xs text-muted-foreground">
              <strong>Classic</strong> uses forest, gold, and your OS dark mode
              (except in the SaaS workspace, which keeps a high-contrast light
              work area). <strong>SaaS</strong> uses a green nav, light content,
              and blue action accents.
            </p>

            <div className="mt-5 space-y-4 border-t border-border/60 pt-5">
              <div>
                <p className="text-sm font-medium text-foreground">
                  UI accent colors
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Saved to your account as{" "}
                  <span className="font-mono text-[11px]">displaySettings</span>{" "}
                  and applied app-wide. Per-stage pill fills still use the table
                  below; the indicator color tints dots, borders, and compact
                  chips for consistency.
                </p>
              </div>
              {!canSyncDisplayColors ? (
                <p className="text-xs text-muted-foreground" role="status">
                  Waiting for account preferences…
                </p>
              ) : null}
              {(Object.keys(UI_DISPLAY_COLOR_DEFAULTS) as UiDisplayColorKey[]).map(
                (key) => {
                  const meta = UI_DISPLAY_COLOR_META[key];
                  const fallback = UI_DISPLAY_COLOR_DEFAULTS[key];
                  const stored = uiColors[key];
                  const colorInputValue = hexForColorInput(stored, fallback);
                  return (
                    <div
                      key={key}
                      className="flex max-w-2xl flex-col gap-2 border-b border-border/40 pb-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {meta.headline}
                        </p>
                        <p className="text-xs text-muted-foreground">{meta.hint}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <input
                          type="color"
                          aria-label={`${meta.headline} color`}
                          className="h-9 w-14 cursor-pointer rounded border border-border bg-background p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                          value={colorInputValue}
                          disabled={!canSyncDisplayColors}
                          onChange={(e) => setUiColor(key, e.target.value)}
                        />
                        <Input
                          key={`${key}-${stored ?? ""}`}
                          className="w-32 font-mono text-xs"
                          defaultValue={stored ?? ""}
                          placeholder="#RRGGBB or rgb()"
                          spellCheck={false}
                          disabled={!canSyncDisplayColors}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            setUiColor(key, v === "" ? null : v);
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!canSyncDisplayColors || !stored}
                          onClick={() => setUiColor(key, null)}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  );
                },
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canSyncDisplayColors}
                  onClick={() => void resetUiColors()}
                >
                  Reset all accent colors
                </Button>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            id="accessibility"
            title="Accessibility"
            description="Motion, reading comfort, and keyboard visibility."
          >
            <div className="max-w-md space-y-2">
              <label className="sr-only" htmlFor="motion-pref">
                Motion level
              </label>
              <p className="text-sm font-medium text-foreground">Motion</p>
              <Select
                id="motion-pref"
                value={settings.motionPreference}
                onChange={(e) => {
                  update({
                    motionPreference: e.target.value as MotionPreference,
                  });
                }}
                className="w-full"
              >
                {MOTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                {
                  MOTION_OPTIONS.find((m) => m.value === settings.motionPreference)
                    ?.hint
                }
              </p>
            </div>

            <div className="max-w-md space-y-2 border-t border-border/60 pt-4">
              <label className="text-sm text-muted-foreground" htmlFor="text-scale">
                Text size
              </label>
              <Select
                id="text-scale"
                value={settings.textScale}
                onChange={(e) => {
                  update({ textScale: e.target.value as TextScale });
                }}
                className="w-full"
              >
                {TEXT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Scales the whole app slightly — like browser zoom without breaking
                table layouts.
              </p>
            </div>

            <div className="flex max-w-md flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">
                Stronger focus indicators
              </span>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border accent-[rgb(var(--primary))] focus-visible:ring-2 focus-visible:ring-brand-accent"
                  checked={settings.enhancedFocusRings}
                  onChange={(e) => update({ enhancedFocusRings: e.target.checked })}
                  aria-describedby="focus-rings-hint"
                />
                <span>On</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground" id="focus-rings-hint">
              Makes the focused control easier to see when you use Tab or a
              switch device. Mouse clicks are unchanged.
            </p>
          </SettingsSection>

          <SettingsSection
            id="layout"
            title="Layout and density"
            description="Data grids and side drawers — tune information density and motion."
          >
            <div className="max-w-md space-y-2">
              <label className="sr-only" htmlFor="table-density">
                Table density
              </label>
              <p className="text-sm font-medium text-foreground">Data tables</p>
              <Select
                id="table-density"
                value={settings.tableDensity}
                onChange={(e) => {
                  update({
                    tableDensity: e.target.value as TableDensityMode,
                  });
                }}
                className="w-full"
              >
                {TABLE_DENSITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                {
                  TABLE_DENSITY_OPTIONS.find((o) => o.value === settings.tableDensity)
                    ?.hint
                }
              </p>
            </div>

            <div className="max-w-md space-y-2 border-t border-border/60 pt-4">
              <label className="sr-only" htmlFor="side-panel-anim">
                Side panel animation
              </label>
              <p className="text-sm font-medium text-foreground">Drawer panels</p>
              <Select
                id="side-panel-anim"
                value={settings.sidePanelAnimation}
                onChange={(e) => {
                  update({
                    sidePanelAnimation: e.target.value as SidePanelAnimationMode,
                  });
                }}
                className="w-full"
              >
                {SIDE_PANEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                {
                  SIDE_PANEL_OPTIONS.find(
                    (o) => o.value === settings.sidePanelAnimation
                  )?.hint
                }
              </p>
            </div>
          </SettingsSection>

          <SettingsSection
            id="navigation"
            title="Navigation"
            description="Primary routes in the sidebar, collapsed rail, and headers. Changes sync to this account when you save."
          >
            <NavManager />
          </SettingsSection>

          <SettingsSection
            id="workflow"
            title="Workflow"
            description="Pipeline landing view, file sections, and intake auto-save timing."
          >
            <div className="max-w-md space-y-2">
              <label className="sr-only" htmlFor="file-section-default">
                Default file section layout
              </label>
              <p className="text-sm font-medium text-foreground">
                Pipeline file — sections on open
              </p>
              <Select
                id="file-section-default"
                value={settings.fileSectionDefaultMode}
                onChange={(e) => {
                  update({
                    fileSectionDefaultMode: e.target.value as FileSectionDefaultMode,
                  });
                }}
                className="w-full"
              >
                {FILE_SECTION_DEFAULT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                {
                  FILE_SECTION_DEFAULT_OPTIONS.find(
                    (o) => o.value === settings.fileSectionDefaultMode
                  )?.hint
                }{" "}
                Applies when you open a file; your toggles are still saved per file.
                Section headers show a live count of filled fields.
              </p>
            </div>

            <div className="max-w-md space-y-3 border-t border-border/60 pt-4">
              <p className="text-sm font-medium text-foreground">
                File details — shared funding &amp; rate
              </p>
              <p className="text-xs text-muted-foreground">
                Applies on this account when a pipeline file is not driven by the
                embedded deal workspace. Local drafts avoid cross-block races until
                you push or reset.
              </p>
              {!canSyncDisplayColors ? (
                <p className="text-xs text-muted-foreground" role="status">
                  Waiting for account preferences…
                </p>
              ) : (
                <div className="space-y-3">
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border accent-[rgb(var(--primary))] focus-visible:ring-2 focus-visible:ring-brand-accent"
                      checked={blockSyncBehavior.autoSyncSharedAcrossBlocks}
                      disabled={!canSyncDisplayColors}
                      onChange={(e) =>
                        patchBlockSyncBehavior({
                          autoSyncSharedAcrossBlocks: e.target.checked,
                        })
                      }
                    />
                    <span>
                      <span className="font-medium">Auto-sync shared data</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        When on, edits write straight to the shared bus (visible on
                        every block). When off, edits stay local until you use{" "}
                        <em className="not-italic">Push to shared bus</em> in the
                        drawer.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border accent-[rgb(var(--primary))] focus-visible:ring-2 focus-visible:ring-brand-accent"
                      checked={blockSyncBehavior.allowOverrides}
                      disabled={!canSyncDisplayColors}
                      onChange={(e) =>
                        patchBlockSyncBehavior({
                          allowOverrides: e.target.checked,
                        })
                      }
                    />
                    <span>
                      <span className="font-medium">Allow block-only overrides</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        When on, the drawer can detach funding or rate to a
                        per-block value stored on the file. You can always reset to
                        the shared bus from the field row.
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </div>

            <PersonalNewFileTemplateSection
              preferences={preferences}
              ready={prefsReady}
              canSync={canSyncDisplayColors}
              updatePreferences={syncConvexPreferences}
            />

            <UserPipelineFileTemplatesSection
              accountId={accountId}
              canSync={canSyncDisplayColors}
              preferences={preferences}
              prefsReady={prefsReady}
            />

            <div className="max-w-xl space-y-2 border-t border-border/60 pt-4">
              <p className="text-sm font-medium text-foreground">Intelligence</p>
              <p className="text-xs text-muted-foreground">
                Optional OpenAI-backed suggestions. Heuristic hints, file insights,
                and your simple workflows still run when this is off.
              </p>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border accent-[rgb(var(--primary))] focus-visible:ring-2 focus-visible:ring-brand-accent"
                  checked={readAiAssistEnabled(preferences.behaviorSettings)}
                  disabled={!canSyncDisplayColors}
                  onChange={(e) =>
                    void syncConvexPreferences({
                      behaviorSettings: {
                        ...preferences.behaviorSettings,
                        [AI_ASSIST_BEHAVIOR_KEY]: e.target.checked,
                      },
                    })
                  }
                />
                <span>
                  <span className="font-medium">Enable AI assist</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Drawer “Suggested sections” model pass and deal workspace
                    &quot;Ask AI&quot; (requires an OpenAI key on Convex).
                  </span>
                </span>
              </label>
            </div>

            <UserSimpleWorkflowsSection
              accountId={accountId}
              canPersist={canSyncDisplayColors}
              organizationId={activeOrganizationId ?? undefined}
              memberUserKey={actorKeyForConvex || undefined}
            />

            <div className="max-w-md space-y-2 border-t border-border/60 pt-4">
              <p className="text-sm font-medium text-foreground">
                Pipeline drawer — reset template
              </p>
              <p className="text-xs text-muted-foreground">
                Saves this device&apos;s current drawer block order and visibility as
                the template used by{" "}
                <span className="font-medium text-foreground">
                  Reset to template
                </span>{" "}
                on individual pipeline files. Mandatory blocks always stay visible.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const cur = loadPipelineDrawerLayout();
                    const n = normalizePipelineDrawerLayout(cur);
                    update({
                      pipelineDrawerTemplate: { order: n.order, hidden: n.hidden },
                    });
                  }}
                >
                  Save device layout as template
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!settings.pipelineDrawerTemplate}
                  onClick={() => update({ pipelineDrawerTemplate: undefined })}
                >
                  Clear template
                </Button>
              </div>
              {settings.pipelineDrawerTemplate ? (
                <p className="text-xs text-muted-foreground">
                  Template is set ({settings.pipelineDrawerTemplate.order.length}{" "}
                  blocks in order, {settings.pipelineDrawerTemplate.hidden.length}{" "}
                  hidden).
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No template — reset uses registry defaults from Pipeline Settings.
                </p>
              )}
            </div>

            <div className="max-w-md space-y-2 border-t border-border/60 pt-4">
              <label className="text-sm text-muted-foreground" htmlFor="pl-view">
                Open Pipeline in
              </label>
              <Select
                id="pl-view"
                value={settings.pipelineDefaultView}
                onChange={(e) => {
                  update({
                    pipelineDefaultView: e.target.value as PipelineViewPref,
                  });
                }}
                className="w-full"
              >
                {PIPELINE_VIEW.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} view
                  </option>
                ))}
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Sort order for the Pipeline list is remembered separately in its own
              control on that page.
            </p>

            <div className="max-w-md space-y-2 border-t border-border/60 pt-4">
              <label className="sr-only" htmlFor="intake-autosave">
                Intake auto-save delay
              </label>
              <p className="text-sm font-medium text-foreground">Intake auto-save</p>
              <Select
                id="intake-autosave"
                value={settings.intakeAutosaveCadence}
                onChange={(e) => {
                  update({
                    intakeAutosaveCadence: e.target.value as IntakeAutosaveCadence,
                  });
                }}
                className="w-full"
              >
                {INTAKE_AUTOSAVE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                {
                  INTAKE_AUTOSAVE_OPTIONS.find(
                    (o) => o.value === settings.intakeAutosaveCadence
                  )?.hint
                }
              </p>
            </div>

            <div className="max-w-md space-y-2 border-t border-border/60 pt-4">
              <p className="text-sm font-medium text-foreground">Pipeline stage styles</p>
              <Select
                value={stageStyleTarget}
                onChange={(e) =>
                  setStageStyleTarget(e.target.value as PipelineStatusValue)
                }
                className="w-full"
                aria-label="Select pipeline stage to style"
              >
                {PIPELINE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1.5 text-xs">
                  <span>Pill background</span>
                  <input
                    type="color"
                    value={selectedStageStyle.backgroundColor}
                    onChange={(e) =>
                      commitStageStyleField(
                        stageStyleTarget,
                        "backgroundColor",
                        e.target.value
                      )
                    }
                    className="h-7 w-10 cursor-pointer rounded border border-border bg-background p-0.5"
                    aria-label="Pill background color"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1.5 text-xs">
                  <span>Text color</span>
                  <input
                    type="color"
                    value={selectedStageStyle.textColor}
                    onChange={(e) =>
                      commitStageStyleField(
                        stageStyleTarget,
                        "textColor",
                        e.target.value
                      )
                    }
                    className="h-7 w-10 cursor-pointer rounded border border-border bg-background p-0.5"
                    aria-label="Stage text color"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1.5 text-xs">
                  <span>Border color</span>
                  <input
                    type="color"
                    value={selectedStageStyle.borderColor}
                    onChange={(e) =>
                      commitStageStyleField(
                        stageStyleTarget,
                        "borderColor",
                        e.target.value
                      )
                    }
                    className="h-7 w-10 cursor-pointer rounded border border-border bg-background p-0.5"
                    aria-label="Stage border color"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1.5 text-xs">
                  <span>Indicator light</span>
                  <input
                    type="color"
                    value={selectedStageStyle.indicatorColor}
                    onChange={(e) =>
                      commitStageStyleField(
                        stageStyleTarget,
                        "indicatorColor",
                        e.target.value
                      )
                    }
                    className="h-7 w-10 cursor-pointer rounded border border-border bg-background p-0.5"
                    aria-label="Indicator light color"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1.5 text-xs">
                  <span>Selected background</span>
                  <input
                    type="color"
                    value={selectedStageStyle.selectedBackgroundColor}
                    onChange={(e) =>
                      commitStageStyleField(
                        stageStyleTarget,
                        "selectedBackgroundColor",
                        e.target.value
                      )
                    }
                    className="h-7 w-10 cursor-pointer rounded border border-border bg-background p-0.5"
                    aria-label="Selected background color"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1.5 text-xs">
                  <span>Selected text</span>
                  <input
                    type="color"
                    value={selectedStageStyle.selectedTextColor}
                    onChange={(e) =>
                      commitStageStyleField(
                        stageStyleTarget,
                        "selectedTextColor",
                        e.target.value
                      )
                    }
                    className="h-7 w-10 cursor-pointer rounded border border-border bg-background p-0.5"
                    aria-label="Selected text color"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => resetStageStyle(stageStyleTarget)}
                >
                  Reset stage
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PIPELINE_STATUSES.map((s) => {
                  const style = resolvePipelineStageStyle(
                    s.value,
                    settings.pipelineStageStyles
                  );
                  const active = s.value === stageStyleTarget;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setStageStyleTarget(s.value)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
                        active && "ring-2 ring-brand-accent/40 ring-offset-1 ring-offset-background"
                      )}
                      style={{
                        backgroundColor: active
                          ? style.selectedBackgroundColor
                          : style.backgroundColor,
                        borderColor: style.borderColor,
                        color: active ? style.selectedTextColor : style.textColor,
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: style.indicatorColor }}
                        aria-hidden
                      />
                      {s.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Stage style changes apply immediately in Pipeline table, board, and drawer.
              </p>
            </div>
          </SettingsSection>

          <SettingsSection
            id="pipelineAdmin"
            title="Pipeline admin"
            description="Global drawer blocks, required sections, defaults for new files, and optional bulk sync across all pipeline files."
          >
            <p className="text-sm text-muted-foreground">
              <Link href="/settings/pipeline-stages" className="text-primary underline">
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
          </SettingsSection>

          {isGlobalAdmin ? (
            <SettingsSection
              id="productKnowledge"
              title="Product knowledge"
              description="Seed the encyclopedia, publish release notes to the Updates bell, and review automation drafts."
            >
              <ProductKnowledgeAdminPanel />
            </SettingsSection>
          ) : null}

          {isGlobalAdmin ? (
            <SettingsSection
              id="systemAdmin"
              title="System admin"
              description="Global tenant access and internal controls."
            >
              <SystemAdminSettingsPanel />
            </SettingsSection>
          ) : null}

          <SettingsSection
            id="performance"
            title="Performance"
            description="This device — summary and reset."
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
                  <span className="font-medium">{settings.sidePanelAnimation}</span>
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
          </SettingsSection>

          <SettingsSection
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
                  LIVE_PILL_OPTIONS.find((o) => o.value === settings.liveStatusPill)
                    ?.hint
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
                Validates migrated links against lender source rows. If this fails, fix data
                before relying on the &quot;Lender contacts&quot; hub in the lender drawer.
              </p>
              <LenderContactMigrationValidationCard />
            </div>
          </SettingsSection>

          <SettingsSection
            id="notifications"
            title="Notifications"
            description="Stored in Convex with your account preferences. Task @mentions use words like @yourAccountId in task or file notes."
          >
            {!canSyncDisplayColors ? (
              <p className="text-sm text-muted-foreground">
                Set an account id (or sign in when available) to sync notification
                preferences to the server.
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
                    <code className="rounded bg-muted px-1">NOTIFICATION_EMAIL_FROM</code>
                    . Open tracking needs{" "}
                    <code className="rounded bg-muted px-1">EMAIL_PUBLIC_BASE_URL</code>{" "}
                    (your Convex site URL, e.g. https://… .convex.site).
                    Inbound reply webhooks use{" "}
                    <code className="rounded bg-muted px-1">SYSTEM_EMAIL_INBOUND_SECRET</code>{" "}
                    POSTed as header{" "}
                    <code className="rounded bg-muted px-1">X-System-Email-Secret</code>{" "}
                    to <code className="rounded bg-muted px-1">/webhooks/system-email/inbound</code>
                    with JSON {"{"} <code className="rounded bg-muted px-1">correlationId</code>,{" "}
                    <code className="rounded bg-muted px-1">snippet</code> {"}"} (wire from your email provider or automation).
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
                    <span className="text-sm">Allow email for enabled categories</span>
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
                      ["Task assignment", NOTIFY_TASK_ASSIGNMENT_INAPP_KEY, NOTIFY_TASK_ASSIGNMENT_EMAIL_KEY],
                      ["File & deal updates", NOTIFY_FILE_UPDATE_INAPP_KEY, NOTIFY_FILE_UPDATE_EMAIL_KEY],
                      ["@Mentions", NOTIFY_MENTION_INAPP_KEY, NOTIFY_MENTION_EMAIL_KEY],
                      ["Deadline digest", NOTIFY_DEADLINE_INAPP_KEY, NOTIFY_DEADLINE_EMAIL_KEY],
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
          </SettingsSection>

          <SettingsSection
            id="webhooks"
            title="Webhooks"
            description="Register multi-event HTTPS endpoints, or configure one merchant channel webhook for SMS/email fan-out (GHL pattern). Deliveries never block the UI."
          >
            <WebhookSettingsWorkspace />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
