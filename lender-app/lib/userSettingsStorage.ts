import { parseJsonUnknown } from "@/lib/safeJson";
import {
  DEFAULT_PIPELINE_STAGE_STYLES,
  getDefaultPipelineStageStyles,
  type PipelineStageStyle,
  type PipelineStageStyleMap,
  type PipelineStatusValue,
  isValidPipelineStageColor,
  resolvePipelineStageStyle,
} from "@/lib/pipelineStatus";

export type PipelineStageColorMap = PipelineStageStyleMap;

/**
 * Versioned, device-local preferences (no account required). Single JSON key so we
 * can add fields and migrate in one place later.
 */
export const USER_SETTINGS_STORAGE_KEY = "dlc.user-settings.v1";

export type MotionPreference = "system" | "reduced" | "full";

export type TextScale = "normal" | "large";

export type PipelineViewPref = "table" | "board";

/** Header live-connection pill: always visible, or only when connecting / issues / activity. */
export type LiveStatusPillMode = "always" | "minimal";

/** Primary lender / ledger / pipeline grid row padding. */
export type TableDensityMode = "comfortable" | "compact" | "analyst";

/** Slide-in animation for right-hand drawers (lender, pipeline, tasks). */
export type SidePanelAnimationMode = "slide" | "none";

/** Intake editor debounce before auto-saving patches to Convex. */
export type IntakeAutosaveCadence = "fast" | "standard" | "relaxed";

/**
 * When you open a pipeline file, how drawer + deal sections start out before
 * you toggle them. Stored on this device with other user settings.
 */
export type FileSectionDefaultMode = "allExpanded" | "allCollapsed" | "dataSmart";

/** Saved from Settings → “Save device layout as template” for per-file reset. */
export type PipelineDrawerTemplateV1 = {
  order: string[];
  hidden: string[];
};

export type UserSettingsV1 = {
  v: 1;
  /** How animations behave (system follows OS, reduced always minimizes motion). */
  motionPreference: MotionPreference;
  /** Slightly larger base type for long reading sessions. */
  textScale: TextScale;
  /** When you open the Pipeline, start in table or board. */
  pipelineDefaultView: PipelineViewPref;
  /** Bolder :focus-visible outlines (keyboard / switch navigation). */
  enhancedFocusRings: boolean;
  /** Header Convex / live-data status chip visibility (see `LiveConnectionPill`). */
  liveStatusPill: LiveStatusPillMode;
  /** Browse / Pipeline table / Ledger cell density. */
  tableDensity: TableDensityMode;
  /** Drawer slide-in (see `globals.css`: `animate-slide-in-right` desktop, `animate-slide-in-up` mobile inspector). */
  sidePanelAnimation: SidePanelAnimationMode;
  /** Delay after last keystroke before intake auto-save runs. */
  intakeAutosaveCadence: IntakeAutosaveCadence;
  /** Pipeline file drawer + deal workspace default expand/collapse behavior. */
  fileSectionDefaultMode: FileSectionDefaultMode;
  /**
   * Optional drawer block order/hidden template used when resetting a file’s layout
   * to match Pipeline Settings (see `pipeline.resetFileDrawerLayoutToTemplate`).
   */
  pipelineDrawerTemplate?: PipelineDrawerTemplateV1;
  /** Per-stage style overrides for pipeline status labels. */
  pipelineStageStyles: PipelineStageColorMap;
};

function cloneDefaultStageStyles(): PipelineStageColorMap {
  return getDefaultPipelineStageStyles();
}

function parseStyleObject(
  raw: unknown
): Partial<PipelineStageStyle> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: Partial<PipelineStageStyle> = {};
  if (typeof o.backgroundColor === "string" && isValidPipelineStageColor(o.backgroundColor)) {
    out.backgroundColor = o.backgroundColor.trim().toUpperCase();
  }
  if (typeof o.textColor === "string" && isValidPipelineStageColor(o.textColor)) {
    out.textColor = o.textColor.trim().toUpperCase();
  }
  if (typeof o.borderColor === "string" && isValidPipelineStageColor(o.borderColor)) {
    out.borderColor = o.borderColor.trim().toUpperCase();
  }
  if (
    typeof o.selectedBackgroundColor === "string" &&
    isValidPipelineStageColor(o.selectedBackgroundColor)
  ) {
    out.selectedBackgroundColor = o.selectedBackgroundColor.trim().toUpperCase();
  }
  if (
    typeof o.selectedTextColor === "string" &&
    isValidPipelineStageColor(o.selectedTextColor)
  ) {
    out.selectedTextColor = o.selectedTextColor.trim().toUpperCase();
  }
  if (typeof o.indicatorColor === "string" && isValidPipelineStageColor(o.indicatorColor)) {
    out.indicatorColor = o.indicatorColor.trim().toUpperCase();
  }
  return out;
}

function parseStageStyles(value: unknown, legacyColors: unknown): PipelineStageColorMap {
  const out = cloneDefaultStageStyles();
  const styleObj = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const legacyObj =
    legacyColors && typeof legacyColors === "object"
      ? (legacyColors as Record<string, unknown>)
      : null;
  for (const s of Object.keys(DEFAULT_PIPELINE_STAGE_STYLES) as PipelineStatusValue[]) {
    const styleRaw = styleObj?.[s];
    if (styleRaw && typeof styleRaw === "object") {
      out[s] = parseStyleObject(styleRaw);
      continue;
    }
    // Backward compatibility: old single-color map.
    const legacy = legacyObj?.[s];
    if (typeof legacy === "string" && isValidPipelineStageColor(legacy)) {
      const style = resolvePipelineStageStyle(s, {
        [s]: {
          backgroundColor: legacy,
          borderColor: legacy,
          indicatorColor: legacy,
        },
      });
      out[s] = style;
    }
  }
  return out;
}

const DEFAULT: UserSettingsV1 = {
  v: 1,
  motionPreference: "system",
  textScale: "normal",
  pipelineDefaultView: "table",
  enhancedFocusRings: false,
  liveStatusPill: "always",
  tableDensity: "comfortable",
  sidePanelAnimation: "slide",
  intakeAutosaveCadence: "standard",
  fileSectionDefaultMode: "allCollapsed",
  pipelineStageStyles: cloneDefaultStageStyles(),
};

/** Milliseconds for intake auto-save debounce (`IntakeEditor`). */
export function intakeAutosaveDelayMs(
  cadence: IntakeAutosaveCadence
): number {
  if (cadence === "fast") return 400;
  if (cadence === "relaxed") return 1200;
  return 600;
}

function parse(json: string): UserSettingsV1 {
  const raw = parseJsonUnknown(json);
  if (!raw || typeof raw !== "object" || (raw as UserSettingsV1).v !== 1) {
    return { ...DEFAULT };
  }
  const o = raw as Record<string, unknown>;
  let motion: MotionPreference = "system";
  if (o.motionPreference === "reduced" || o.motionPreference === "full") {
    motion = o.motionPreference;
  }
  return {
    v: 1,
    motionPreference: motion,
    textScale: o.textScale === "large" ? "large" : "normal",
    pipelineDefaultView: o.pipelineDefaultView === "board" ? "board" : "table",
    enhancedFocusRings: o.enhancedFocusRings === true,
    liveStatusPill: o.liveStatusPill === "minimal" ? "minimal" : "always",
    tableDensity: (() => {
      const d = o.tableDensity;
      if (d === "compact" || d === "analyst") return d;
      return "comfortable";
    })(),
    sidePanelAnimation: o.sidePanelAnimation === "none" ? "none" : "slide",
    intakeAutosaveCadence: (() => {
      const c = o.intakeAutosaveCadence;
      if (c === "fast" || c === "relaxed") return c;
      return "standard";
    })(),
    fileSectionDefaultMode: (() => {
      const m = o.fileSectionDefaultMode;
      if (m === "allExpanded" || m === "allCollapsed" || m === "dataSmart") return m;
      return "allCollapsed";
    })(),
    pipelineDrawerTemplate: (() => {
      const t = o.pipelineDrawerTemplate;
      if (!t || typeof t !== "object") return undefined;
      const rec = t as Record<string, unknown>;
      const order = Array.isArray(rec.order)
        ? rec.order.filter((x): x is string => typeof x === "string")
        : [];
      const hidden = Array.isArray(rec.hidden)
        ? rec.hidden.filter((x): x is string => typeof x === "string")
        : [];
      if (order.length === 0 && hidden.length === 0) return undefined;
      return { order, hidden };
    })(),
    pipelineStageStyles: parseStageStyles(
      o.pipelineStageStyles,
      o.pipelineStageColors
    ),
  };
}

/**
 * When `motionPreference === "system"`, matches `(prefers-reduced-motion: reduce)`.
 * If `window` is unavailable, returns `false` (no reduction until client runs).
 */
export function getEffectiveReduceMotion(
  motionPreference: MotionPreference
): boolean {
  if (typeof window === "undefined") return false;
  if (motionPreference === "reduced") return true;
  if (motionPreference === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function loadUserSettings(): UserSettingsV1 {
  if (typeof window === "undefined") {
    return { ...DEFAULT, pipelineStageStyles: cloneDefaultStageStyles() };
  }
  try {
    const s = localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
    if (!s) return { ...DEFAULT, pipelineStageStyles: cloneDefaultStageStyles() };
    return parse(s);
  } catch {
    return { ...DEFAULT, pipelineStageStyles: cloneDefaultStageStyles() };
  }
}

export function saveUserSettings(next: UserSettingsV1): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Map settings to `document.documentElement` data attributes for global CSS
 * and for debugging in devtools.
 */
export function applyUserSettingsToDocument(
  s: UserSettingsV1
): { reduceMotion: boolean; textScale: TextScale } {
  if (typeof document === "undefined") {
    return { reduceMotion: getEffectiveReduceMotion(s.motionPreference), textScale: s.textScale };
  }
  const root = document.documentElement;
  const reduceMotion = getEffectiveReduceMotion(s.motionPreference);
  if (reduceMotion) {
    root.setAttribute("data-reduce-motion", "true");
  } else {
    root.removeAttribute("data-reduce-motion");
  }
  if (s.textScale === "large") {
    root.setAttribute("data-text-scale", "large");
  } else {
    root.removeAttribute("data-text-scale");
  }
  if (s.enhancedFocusRings) {
    root.setAttribute("data-focus-rings", "enhanced");
  } else {
    root.removeAttribute("data-focus-rings");
  }
  if (s.motionPreference !== "system") {
    root.setAttribute("data-motion-pref", s.motionPreference);
  } else {
    root.removeAttribute("data-motion-pref");
  }
  if (s.sidePanelAnimation === "none") {
    root.setAttribute("data-panel-slide", "none");
  } else {
    root.removeAttribute("data-panel-slide");
  }
  return { reduceMotion, textScale: s.textScale };
}

export function getDefaultUserSettings(): UserSettingsV1 {
  return { ...DEFAULT, pipelineStageStyles: cloneDefaultStageStyles() };
}
