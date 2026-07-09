import type { Doc } from "../convex/_generated/dataModel";
import {
  ALL_PIPELINE_BLOCK_IDS,
  type PipelineBlockId,
} from "./pipelineBlockRegistry";

export type UserPreferencesCollapseBehavior =
  | "all_open"
  | "all_closed"
  | "smart";

/**
 * Account-scoped customization payload (Convex `userPreferences` + client defaults).
 * Not applied to pipeline file rows unless a feature explicitly merges it.
 */

/** `behaviorSettings` key; when false, AI drawer + deal assist calls are skipped. */
export const AI_ASSIST_BEHAVIOR_KEY = "aiAssistEnabled" as const;

/**
 * Whether OpenAI-backed assist features are allowed for this account.
 * Missing / non-boolean values default to enabled so existing rows keep current behavior.
 */
export function readAiAssistEnabled(
  behaviorSettings: Record<string, unknown>,
): boolean {
  return behaviorSettings[AI_ASSIST_BEHAVIOR_KEY] !== false;
}

/** Normalize Convex `behaviorSettings` / JSON blobs for `readAiAssistEnabled`. */
export function behaviorSettingsRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

export type UserPreferencesV1 = {
  formatVersion: 1;
  defaultBlocks: string[];
  blockOrder: string[];
  collapseBehavior: UserPreferencesCollapseBehavior;
  displaySettings: Record<string, unknown>;
  /**
   * Feature flags and JSON blobs for optional behavior (parsed defensively in feature code).
   * Includes `aiAssistEnabled` and versioned `pipelineFileExpandUx` (see `PIPELINE_FILE_EXPAND_UX_KEY` in `pipelineFileExpandUx.ts`).
   */
  behaviorSettings: Record<string, unknown>;
  /**
   * Per-block `fileDrawerLayout.settings[blockId]` merged onto the global
   * new-file template when this account creates a pipeline file.
   */
  newFileDrawerSettings: Partial<
    Record<PipelineBlockId, Record<string, unknown>>
  >;
  /** Pinned pipeline block ids for the file favorites quick-access bar (registry-validated). */
  favoriteFileBlocks: PipelineBlockId[];
  /** Convex `userPreferences` — canonical with legacy `userOnboarding` merge in queries. */
  gettingStartedDismissed: boolean;
  gettingStartedComplete: boolean;
  gettingStartedSkipped: boolean;
};

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isCollapseBehavior(
  x: unknown,
): x is UserPreferencesCollapseBehavior {
  return x === "all_open" || x === "all_closed" || x === "smart";
}

function stringArray(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((e): e is string => typeof e === "string");
}

function favoriteFileBlocksFromRow(raw: unknown): PipelineBlockId[] {
  if (!Array.isArray(raw)) return [];
  const out: PipelineBlockId[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    if (!ALL_PIPELINE_BLOCK_IDS.has(entry as PipelineBlockId)) continue;
    if (out.includes(entry as PipelineBlockId)) continue;
    out.push(entry as PipelineBlockId);
  }
  return out;
}

function newFileDrawerSettingsFromRow(
  raw: unknown,
): Partial<Record<PipelineBlockId, Record<string, unknown>>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Partial<Record<PipelineBlockId, Record<string, unknown>>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ALL_PIPELINE_BLOCK_IDS.has(k as PipelineBlockId)) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    out[k as PipelineBlockId] = { ...(v as Record<string, unknown>) };
  }
  return out;
}

export function getDefaultUserPreferences(): UserPreferencesV1 {
  return {
    formatVersion: 1,
    defaultBlocks: [],
    blockOrder: [],
    collapseBehavior: "all_closed",
    displaySettings: {},
    behaviorSettings: {},
    newFileDrawerSettings: {},
    favoriteFileBlocks: [],
    gettingStartedDismissed: false,
    gettingStartedComplete: false,
    gettingStartedSkipped: false,
  };
}

/**
 * Normalize a Convex row (or null) into `UserPreferencesV1` for UI / patches.
 */
export function mergeServerUserPreferences(
  row: Doc<"userPreferences"> | null | undefined,
): UserPreferencesV1 {
  const d = getDefaultUserPreferences();
  if (!row) return d;

  return {
    formatVersion: 1,
    defaultBlocks: stringArray(row.defaultBlocks),
    blockOrder: stringArray(row.blockOrder),
    collapseBehavior: isCollapseBehavior(row.collapseBehavior)
      ? row.collapseBehavior
      : d.collapseBehavior,
    displaySettings: isPlainObject(row.displaySettings)
      ? { ...row.displaySettings }
      : {},
    behaviorSettings: isPlainObject(row.behaviorSettings)
      ? { ...row.behaviorSettings }
      : {},
    newFileDrawerSettings: newFileDrawerSettingsFromRow(row.newFileDrawerSettings),
    favoriteFileBlocks: favoriteFileBlocksFromRow(row.favoriteFileBlocks),
    gettingStartedDismissed: row.gettingStartedDismissed === true,
    gettingStartedComplete: row.gettingStartedComplete === true,
    gettingStartedSkipped: row.gettingStartedSkipped === true,
  };
}

export function mergeUserPreferencesPatch(
  base: UserPreferencesV1,
  patch: Partial<UserPreferencesV1>,
): UserPreferencesV1 {
  return {
    formatVersion: 1,
    defaultBlocks:
      patch.defaultBlocks !== undefined
        ? [...patch.defaultBlocks]
        : [...base.defaultBlocks],
    blockOrder:
      patch.blockOrder !== undefined
        ? [...patch.blockOrder]
        : [...base.blockOrder],
    collapseBehavior:
      patch.collapseBehavior !== undefined
        ? patch.collapseBehavior
        : base.collapseBehavior,
    displaySettings:
      patch.displaySettings !== undefined
        ? { ...patch.displaySettings }
        : { ...base.displaySettings },
    behaviorSettings:
      patch.behaviorSettings !== undefined
        ? { ...patch.behaviorSettings }
        : { ...base.behaviorSettings },
    newFileDrawerSettings:
      patch.newFileDrawerSettings !== undefined
        ? { ...patch.newFileDrawerSettings }
        : { ...base.newFileDrawerSettings },
    favoriteFileBlocks:
      patch.favoriteFileBlocks !== undefined
        ? [...patch.favoriteFileBlocks]
        : [...base.favoriteFileBlocks],
    gettingStartedDismissed:
      patch.gettingStartedDismissed !== undefined
        ? patch.gettingStartedDismissed
        : base.gettingStartedDismissed,
    gettingStartedComplete:
      patch.gettingStartedComplete !== undefined
        ? patch.gettingStartedComplete
        : base.gettingStartedComplete,
    gettingStartedSkipped:
      patch.gettingStartedSkipped !== undefined
        ? patch.gettingStartedSkipped
        : base.gettingStartedSkipped,
  };
}
