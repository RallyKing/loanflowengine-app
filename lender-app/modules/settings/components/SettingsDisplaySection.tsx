"use client";

import { useEffect, useState } from "react";
import { ColorSchemeToggle } from "@/components/ColorSchemeToggle";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import {
  SettingsSectionCard,
  SettingsSectionTabs,
} from "./SettingsHubChrome";
import {
  hexForColorInput,
  type UiDisplayColorKey,
  type UiDisplayColors,
} from "@/lib/uiDisplaySettings";
import {
  VIEWER_TIMEZONE_OPTIONS,
  viewerTimeZoneOptionLabel,
} from "@/lib/dateTimeZone";
import type {
  MotionPreference,
  SidePanelAnimationMode,
  TableDensityMode,
  TextScale,
} from "@/lib/userSettingsStorage";
import type { SettingsDisplayTabId } from "@/lib/settingsRegistry";

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

const MOTION_OPTIONS: { value: MotionPreference; label: string; hint: string }[] =
  [
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

const DISPLAY_TABS: readonly { id: SettingsDisplayTabId; label: string }[] = [
  { id: "theme", label: "Theme" },
  { id: "accessibility", label: "Accessibility" },
  { id: "density", label: "Density" },
];

export type SettingsDisplaySectionProps = {
  initialTab: SettingsDisplayTabId;
  canSyncDisplayColors: boolean;
  viewerTimeZone: string;
  setViewerTimeZone: (timezone: string) => void;
  uiColors: UiDisplayColors;
  setUiColor: (key: UiDisplayColorKey, value: string | null) => void;
  resetUiColors: () => void;
  motionPreference: MotionPreference;
  textScale: TextScale;
  enhancedFocusRings: boolean;
  tableDensity: TableDensityMode;
  sidePanelAnimation: SidePanelAnimationMode;
  onMotionPreferenceChange: (value: MotionPreference) => void;
  onTextScaleChange: (value: TextScale) => void;
  onEnhancedFocusRingsChange: (value: boolean) => void;
  onTableDensityChange: (value: TableDensityMode) => void;
  onSidePanelAnimationChange: (value: SidePanelAnimationMode) => void;
};

export function SettingsDisplaySection({
  initialTab,
  canSyncDisplayColors,
  viewerTimeZone,
  setViewerTimeZone,
  uiColors,
  setUiColor,
  resetUiColors,
  motionPreference,
  textScale,
  enhancedFocusRings,
  tableDensity,
  sidePanelAnimation,
  onMotionPreferenceChange,
  onTextScaleChange,
  onEnhancedFocusRingsChange,
  onTableDensityChange,
  onSidePanelAnimationChange,
}: SettingsDisplaySectionProps) {
  const [tab, setTab] = useState<SettingsDisplayTabId>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  return (
    <SettingsSectionCard
      id="display"
      title="Display & comfort"
      description="Theme, timezone, accent colors, motion, text size, and table density."
    >
      <SettingsSectionTabs
        ariaLabel="Display settings"
        tabs={DISPLAY_TABS}
        value={tab}
        onChange={setTab}
        testIdPrefix="settings-display-tab"
      />

      {tab === "theme" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p className="text-sm text-muted-foreground">Workspace theme</p>
            <ColorSchemeToggle />
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>Classic</strong> uses forest, gold, and your OS dark mode
            (except in the SaaS workspace, which keeps a high-contrast light work
            area). <strong>SaaS</strong> uses a green nav, light content, and blue
            action accents.
          </p>

          <div className="mt-5 space-y-3 border-t border-border/60 pt-5">
            <div>
              <p className="text-sm font-medium text-foreground">Timezone</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Used for portal link expiry, calendars, and Product Updates
                timestamps. Defaults to US Central (
                <span className="font-mono text-[11px]">America/Chicago</span>
                ). Saved on your account in{" "}
                <span className="font-mono text-[11px]">
                  displaySettings.timezone
                </span>
                .
              </p>
            </div>
            {!canSyncDisplayColors ? (
              <p className="text-xs text-muted-foreground" role="status">
                Waiting for account preferences…
              </p>
            ) : null}
            <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label
                className="text-sm text-muted-foreground"
                htmlFor="viewer-timezone"
              >
                Preferred timezone
              </label>
              <Select
                id="viewer-timezone"
                className="sm:max-w-xs"
                value={viewerTimeZone}
                disabled={!canSyncDisplayColors}
                data-testid="settings-viewer-timezone"
                onChange={(e) => setViewerTimeZone(e.target.value)}
              >
                {VIEWER_TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} ({opt.value})
                  </option>
                ))}
                {!VIEWER_TIMEZONE_OPTIONS.some(
                  (o) => o.value === viewerTimeZone,
                ) ? (
                  <option value={viewerTimeZone}>{viewerTimeZone}</option>
                ) : null}
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Active: {viewerTimeZoneOptionLabel(viewerTimeZone)} (
              {viewerTimeZone})
            </p>
          </div>

          <div className="mt-5 space-y-4 border-t border-border/60 pt-5">
            <div>
              <p className="text-sm font-medium text-foreground">
                UI accent colors
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Saved to your account as{" "}
                <span className="font-mono text-[11px]">displaySettings</span>{" "}
                and applied app-wide. Per-stage pill fills still use the table
                below; the indicator color tints dots, borders, and compact chips
                for consistency.
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
        </div>
      ) : null}

      {tab === "accessibility" ? (
        <div className="space-y-4">
          <div className="max-w-md space-y-2">
            <label className="sr-only" htmlFor="motion-pref">
              Motion level
            </label>
            <p className="text-sm font-medium text-foreground">Motion</p>
            <Select
              id="motion-pref"
              value={motionPreference}
              onChange={(e) => {
                onMotionPreferenceChange(e.target.value as MotionPreference);
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
              {MOTION_OPTIONS.find((m) => m.value === motionPreference)?.hint}
            </p>
          </div>

          <div className="max-w-md space-y-2 border-t border-border/60 pt-4">
            <label className="text-sm text-muted-foreground" htmlFor="text-scale">
              Text size
            </label>
            <Select
              id="text-scale"
              value={textScale}
              onChange={(e) => {
                onTextScaleChange(e.target.value as TextScale);
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
                checked={enhancedFocusRings}
                onChange={(e) =>
                  onEnhancedFocusRingsChange(e.target.checked)
                }
                aria-describedby="focus-rings-hint"
              />
              <span>On</span>
            </label>
          </div>
          <p className="text-xs text-muted-foreground" id="focus-rings-hint">
            Makes the focused control easier to see when you use Tab or a switch
            device. Mouse clicks are unchanged.
          </p>
        </div>
      ) : null}

      {tab === "density" ? (
        <div className="space-y-4">
          <div className="max-w-md space-y-2">
            <label className="sr-only" htmlFor="table-density">
              Table density
            </label>
            <p className="text-sm font-medium text-foreground">Data tables</p>
            <Select
              id="table-density"
              value={tableDensity}
              onChange={(e) => {
                onTableDensityChange(e.target.value as TableDensityMode);
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
                TABLE_DENSITY_OPTIONS.find((o) => o.value === tableDensity)
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
              value={sidePanelAnimation}
              onChange={(e) => {
                onSidePanelAnimationChange(
                  e.target.value as SidePanelAnimationMode,
                );
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
                SIDE_PANEL_OPTIONS.find((o) => o.value === sidePanelAnimation)
                  ?.hint
              }
            </p>
          </div>
        </div>
      ) : null}
    </SettingsSectionCard>
  );
}
