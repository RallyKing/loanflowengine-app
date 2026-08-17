"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import {
  SettingsSectionCard,
  SettingsSectionTabs,
} from "./SettingsHubChrome";
import { PersonalNewFileTemplateSection } from "@/components/PersonalNewFileTemplateSection";
import { UserPipelineFileTemplatesSection } from "@/components/UserPipelineFileTemplatesSection";
import { UserSimpleWorkflowsSection } from "@/components/UserSimpleWorkflowsSection";
import { cn } from "@/lib/cn";
import {
  AI_ASSIST_BEHAVIOR_KEY,
  readAiAssistEnabled,
} from "@/lib/userPreferencesModel";
import type { UserPreferencesV1 } from "@/lib/userPreferencesModel";
import type { BlockSyncBehaviorParsed } from "@/lib/blockSyncBehaviorSettings";
import {
  loadPipelineDrawerLayout,
  normalizePipelineDrawerLayout,
} from "@/lib/pipelineDrawerLayoutStorage";
import {
  DEFAULT_PIPELINE_STAGE_STYLES,
  PIPELINE_STATUSES,
  isValidPipelineStageColor,
  resolvePipelineStageStyle,
  type PipelineStageStyle,
  type PipelineStageStyleMap,
  type PipelineStatusValue,
} from "@/lib/pipelineStatus";
import type {
  FileSectionDefaultMode,
  IntakeAutosaveCadence,
  PipelineViewPref,
  UserSettingsV1,
} from "@/lib/userSettingsStorage";
import type { SettingsWorkflowTabId } from "@/lib/settingsRegistry";
import type { Id } from "@/convex/_generated/dataModel";

const PIPELINE_VIEW: { value: PipelineViewPref; label: string }[] = [
  { value: "table", label: "Table" },
  { value: "board", label: "Board" },
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

const WORKFLOW_TABS: readonly { id: SettingsWorkflowTabId; label: string }[] = [
  { id: "defaults", label: "Defaults" },
  { id: "templates", label: "Templates" },
  { id: "intelligence", label: "Intelligence" },
  { id: "stages", label: "Stages" },
];

export type SettingsWorkflowSectionProps = {
  initialTab?: SettingsWorkflowTabId;
  settings: UserSettingsV1;
  update: (patch: Partial<UserSettingsV1>) => void;
  canSyncDisplayColors: boolean;
  blockSyncBehavior: BlockSyncBehaviorParsed;
  patchBlockSyncBehavior: (patch: Partial<BlockSyncBehaviorParsed>) => void;
  preferences: UserPreferencesV1;
  prefsReady: boolean;
  accountId: string;
  syncConvexPreferences: (
    patch: Partial<UserPreferencesV1>,
  ) => Promise<void>;
  activeOrganizationId: Id<"organizations"> | string | null;
  actorKeyForConvex: string;
};

export function SettingsWorkflowSection({
  initialTab = "defaults",
  settings,
  update,
  canSyncDisplayColors,
  blockSyncBehavior,
  patchBlockSyncBehavior,
  preferences,
  prefsReady,
  accountId,
  syncConvexPreferences,
  activeOrganizationId,
  actorKeyForConvex,
}: SettingsWorkflowSectionProps) {
  const [tab, setTab] = useState<SettingsWorkflowTabId>(initialTab);
  const [stageStyleTarget, setStageStyleTarget] = useState<PipelineStatusValue>(
    () => PIPELINE_STATUSES[0]?.value ?? "confirm_interest",
  );

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const selectedStageStyle = useMemo(
    () =>
      resolvePipelineStageStyle(stageStyleTarget, settings.pipelineStageStyles),
    [stageStyleTarget, settings.pipelineStageStyles],
  );

  const commitStageStyleField = (
    stage: PipelineStatusValue,
    key: keyof PipelineStageStyle,
    color: string,
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
    <SettingsSectionCard
      id="workflow"
      title="Pipeline & workflow"
      description="Pipeline landing view, file sections, templates, AI assist, and stage colors."
    >
      <SettingsSectionTabs
        ariaLabel="Pipeline and workflow settings"
        tabs={WORKFLOW_TABS}
        value={tab}
        onChange={setTab}
        testIdPrefix="settings-workflow-tab"
      />

      {tab === "defaults" ? (
        <div className="space-y-4">
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
                  fileSectionDefaultMode: e.target
                    .value as FileSectionDefaultMode,
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
                  (o) => o.value === settings.fileSectionDefaultMode,
                )?.hint
              }{" "}
              Applies when you open a file; your toggles are still saved per
              file. Section headers show a live count of filled fields.
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
                      When on, edits write straight to the shared bus (visible
                      on every block). When off, edits stay local until you use{" "}
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
                    <span className="font-medium">
                      Allow block-only overrides
                    </span>
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
            <p className="text-sm font-medium text-foreground">
              Intake auto-save
            </p>
            <Select
              id="intake-autosave"
              value={settings.intakeAutosaveCadence}
              onChange={(e) => {
                update({
                  intakeAutosaveCadence: e.target
                    .value as IntakeAutosaveCadence,
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
                  (o) => o.value === settings.intakeAutosaveCadence,
                )?.hint
              }
            </p>
          </div>

          <div className="max-w-md space-y-2 border-t border-border/60 pt-4">
            <p className="text-sm font-medium text-foreground">
              Pipeline drawer — reset template
            </p>
            <p className="text-xs text-muted-foreground">
              Saves this device&apos;s current drawer block order and visibility
              as the template used by{" "}
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
                    pipelineDrawerTemplate: {
                      order: n.order,
                      hidden: n.hidden,
                    },
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
                blocks in order,{" "}
                {settings.pipelineDrawerTemplate.hidden.length} hidden).
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No template — reset uses registry defaults from Pipeline
                Settings.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {tab === "templates" ? (
        <div className="space-y-4">
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
        </div>
      ) : null}

      {tab === "intelligence" ? (
        <div className="space-y-4">
          <div className="max-w-xl space-y-2">
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
                  &quot;Ask AI&quot;. Org API keys for Due Diligence live under
                  Settings → Integrations → AI API keys (not the platform env key).
                </span>
              </span>
            </label>
          </div>

          <UserSimpleWorkflowsSection
            accountId={accountId}
            canPersist={canSyncDisplayColors}
            organizationId={
              (activeOrganizationId as Id<"organizations"> | null) ?? undefined
            }
            memberUserKey={actorKeyForConvex || undefined}
          />
        </div>
      ) : null}

      {tab === "stages" ? (
        <div className="max-w-md space-y-2">
          <p className="text-sm font-medium text-foreground">
            Pipeline stage styles
          </p>
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
                    e.target.value,
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
                    e.target.value,
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
                    e.target.value,
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
                    e.target.value,
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
                    e.target.value,
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
                    e.target.value,
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
                settings.pipelineStageStyles,
              );
              const active = s.value === stageStyleTarget;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStageStyleTarget(s.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
                    active &&
                      "ring-2 ring-brand-accent/40 ring-offset-1 ring-offset-background",
                  )}
                  style={{
                    backgroundColor: active
                      ? style.selectedBackgroundColor
                      : style.backgroundColor,
                    borderColor: style.borderColor,
                    color: active
                      ? style.selectedTextColor
                      : style.textColor,
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
            Stage style changes apply immediately in Pipeline table, board, and
            drawer.
          </p>
        </div>
      ) : null}
    </SettingsSectionCard>
  );
}
