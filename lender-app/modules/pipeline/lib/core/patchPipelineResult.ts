/**
 * Soft OCC result for `pipeline.patch` (mirrors `patchDealResult`).
 * Throwing `CONFLICT_DATA_CHANGED` surfaced as a Convex server error on inline
 * fields (e.g. File Details → Scenario) when deal autosave or criteria saves
 * raced the same `pipeline.updatedAt`.
 */

export const PATCH_PIPELINE_CONFLICT_CODE = "CONFLICT_DATA_CHANGED" as const;

/** Free-text `pipeline.scenario` cap — search indexing clamps to 8k; keep headroom. */
export const MAX_PIPELINE_SCENARIO_CHARS = 16_000;

/**
 * Field keys that should not fan out watcher `file_update` notifications.
 * Scratch / form-autosave fields change often and bloated every Scenario save.
 */
export const PIPELINE_PATCH_QUIET_NOTIFY_KEYS = new Set([
  "scenario",
  "scenarioCriteria",
  "termOptions",
]);

export type PatchPipelineSuccess = {
  ok: true;
  id: string;
  ledgerId?: string;
};

export type PatchPipelineConflict = {
  ok: false;
  code: typeof PATCH_PIPELINE_CONFLICT_CODE;
  serverUpdatedAt: number;
};

export type PatchPipelineResult = PatchPipelineSuccess | PatchPipelineConflict;

export function isPatchPipelineConflictResult(
  v: unknown,
): v is PatchPipelineConflict {
  if (!v || typeof v !== "object") return false;
  const o = v as PatchPipelineConflict;
  return (
    o.ok === false &&
    o.code === PATCH_PIPELINE_CONFLICT_CODE &&
    typeof o.serverUpdatedAt === "number"
  );
}

export function isPipelinePatchQuietNotifyOnly(keys: string[]): boolean {
  return (
    keys.length > 0 &&
    keys.every((k) => PIPELINE_PATCH_QUIET_NOTIFY_KEYS.has(k))
  );
}

/** Args that are not pipeline field keys when classifying quiet-only patches. */
const PIPELINE_PATCH_META_KEYS = new Set([
  "id",
  "expectedUpdatedAt",
  "preferencesAccountId",
  "memberUserKey",
  "organizationId",
]);

/**
 * Online-only: omit `expectedUpdatedAt` for scratch-only patches so Scenario /
 * criteria / termOptions do not soft-conflict when deal autosave bumps
 * `pipeline.updatedAt`. Offline queue must keep `expectedUpdatedAt` so flush
 * still OCC-protects against silently overwriting newer server values.
 */
export function stripOccForOnlineQuietPipelinePatch<
  T extends { expectedUpdatedAt?: number },
>(args: T): T {
  const patchKeys = Object.keys(args).filter((k) => {
    if (PIPELINE_PATCH_META_KEYS.has(k)) return false;
    return (args as Record<string, unknown>)[k] !== undefined;
  });
  if (!isPipelinePatchQuietNotifyOnly(patchKeys)) return args;
  if (args.expectedUpdatedAt === undefined) return args;
  const { expectedUpdatedAt: _drop, ...rest } = args;
  return rest as T;
}

export function clampPipelineScenarioText(
  raw: string | null | undefined,
): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_PIPELINE_SCENARIO_CHARS) {
    throw new Error(
      `Scenario is too long (max ${MAX_PIPELINE_SCENARIO_CHARS.toLocaleString()} characters)`,
    );
  }
  return trimmed;
}
