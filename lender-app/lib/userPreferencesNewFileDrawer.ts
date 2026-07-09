import type { Doc, Id } from "../convex/_generated/dataModel";
import {
  ALL_PIPELINE_BLOCK_IDS,
  getMandatoryPipelineBlockIds,
  type PipelineBlockId,
} from "./pipelineBlockRegistry";
import {
  DEFAULT_PIPELINE_DRAWER_ORDER,
  OPTIONAL_PIPELINE_DRAWER_BLOCK_IDS,
  normalizePipelineDrawerLayout,
  type PipelineDrawerLayoutV1,
  type PipelineDrawerSectionId,
  type PipelineFileSectionId,
} from "./pipelineDrawerLayoutStorage";
import {
  buildPipelineDrawerMetricsContext,
  type PipelineDrawerMetricsContext,
} from "./file/fileSectionMetrics";
import type { TermOptionRowLite } from "./file/fileSectionMetrics";
import {
  drawerExpandedMapForCollapseBehavior,
  headerSectionsExpandedForCollapseBehavior,
} from "./pipelineDrawerCollapseBehavior";
import {
  applyPipelineFileExpandUxToExpanded,
  readPipelineFileExpandUxRules,
} from "./pipelineFileExpandUx";
import type { UserPreferencesCollapseBehavior, UserPreferencesV1 } from "./userPreferencesModel";

type PipelineDoc = Doc<"pipeline">;
type IntakeSheetDoc = Doc<"intakeSheets">;

/** Merge a user-ordered subset with a base order (used by prefs + settings UI). */
export function mergeBlockOrder(
  userOrderIn: string[],
  baseOrder: readonly PipelineDrawerSectionId[],
): PipelineDrawerSectionId[] {
  const seen = new Set<PipelineDrawerSectionId>();
  const out: PipelineDrawerSectionId[] = [];
  for (const id of userOrderIn) {
    if (!ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId)) continue;
    const sid = id as PipelineDrawerSectionId;
    if (seen.has(sid)) continue;
    seen.add(sid);
    out.push(sid);
  }
  for (const id of baseOrder) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of DEFAULT_PIPELINE_DRAWER_ORDER) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export type ApplyUserPrefsNewFileDrawerOptions = {
  /**
   * Registry mandatory ∪ admin-required (workspace). When omitted, registry
   * mandatory ids are used. Server always passes the effective set so user
   * prefs cannot hide workspace-required blocks.
   */
  effectiveMandatoryBlockIds?: readonly PipelineBlockId[];
};

/**
 * Ensures saved `defaultBlocks` / `blockOrder` never omit workspace- or
 * product-required blocks. No-ops when the user has not customized lists
 * (both empty = follow system template for visibility/order).
 */
export function coerceUserDrawerPreferenceLists(
  effectiveMandatory: readonly PipelineBlockId[],
  lists: { defaultBlocks: string[]; blockOrder: string[] },
): { defaultBlocks: string[]; blockOrder: string[] } {
  const hasVisibilityPick = lists.defaultBlocks.length > 0;
  const hasOrderPick = lists.blockOrder.length > 0;
  if (!hasVisibilityPick && !hasOrderPick) {
    return {
      defaultBlocks: [...lists.defaultBlocks],
      blockOrder: [...lists.blockOrder],
    };
  }

  let defaultBlocks = [...lists.defaultBlocks];
  let blockOrder = [...lists.blockOrder];

  if (hasVisibilityPick) {
    const vis = new Set<PipelineBlockId>();
    for (const id of lists.defaultBlocks) {
      if (ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId)) {
        vis.add(id as PipelineBlockId);
      }
    }
    for (const id of effectiveMandatory) {
      vis.add(id);
    }
    defaultBlocks = [
      ...DEFAULT_PIPELINE_DRAWER_ORDER,
      ...OPTIONAL_PIPELINE_DRAWER_BLOCK_IDS,
    ].filter((id) => vis.has(id));
  }

  if (hasOrderPick) {
    let ord = mergeBlockOrder(blockOrder, [...DEFAULT_PIPELINE_DRAWER_ORDER]);
    const seen = new Set(ord);
    for (const id of effectiveMandatory) {
      if (seen.has(id)) continue;
      const insertAt = DEFAULT_PIPELINE_DRAWER_ORDER.indexOf(id);
      let pos = ord.length;
      for (let i = 0; i < ord.length; i++) {
        const pi = DEFAULT_PIPELINE_DRAWER_ORDER.indexOf(ord[i]);
        if (pi > insertAt) {
          pos = i;
          break;
        }
      }
      ord.splice(pos, 0, id);
      seen.add(id);
    }
    blockOrder = ord;
  }

  return { defaultBlocks, blockOrder };
}

function expandedForCollapse(
  behavior: UserPreferencesCollapseBehavior,
  order: string[],
  metricsCtx: PipelineDrawerMetricsContext,
): Partial<Record<PipelineBlockId, boolean>> {
  const visible = order.filter((id): id is PipelineBlockId =>
    ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId),
  );
  return drawerExpandedMapForCollapseBehavior(
    behavior,
    visible,
    metricsCtx,
  ) as Partial<Record<PipelineBlockId, boolean>>;
}

/**
 * Recomputes `expanded` from account collapse behavior for an existing layout
 * (e.g. after a catalog file template sets order/hidden/settings).
 */
export function applyDrawerCollapseFromPreferences(
  layout: PipelineDrawerLayoutV1,
  collapseBehavior: UserPreferencesCollapseBehavior,
  metricsCtx: PipelineDrawerMetricsContext,
  options?: { behaviorSettings?: Record<string, unknown> },
): PipelineDrawerLayoutV1 {
  const expandedBlocks = expandedForCollapse(
    collapseBehavior,
    layout.order,
    metricsCtx,
  );
  const headers = headerSectionsExpandedForCollapseBehavior(collapseBehavior);
  const visibleBlockIds = layout.order.filter((id) => !layout.hidden.includes(id));
  const expandUx = readPipelineFileExpandUxRules(options?.behaviorSettings);
  let expanded: Partial<Record<PipelineFileSectionId, boolean>> = {
    ...layout.expanded,
    ...expandedBlocks,
    ...headers,
  };
  expanded = applyPipelineFileExpandUxToExpanded(expanded, expandUx, {
    visibleBlockIds,
    metricsCtx,
    actionHints: null,
  });
  return normalizePipelineDrawerLayout({
    ...layout,
    expanded,
  });
}

/**
 * Applies account `UserPreferences` onto the **global new-file** drawer template
 * (system default), without weakening workspace/product requirements.
 *
 * Precedence: **effective mandatory** (admin ∪ registry) → **user lists &
 * settings** → **system `base`** (global new-file template).
 * When `prefs` is null (no row / no account id), returns a normalized copy of `base`.
 * Does not read or write pipeline rows.
 */
export function applyUserPreferencesToNewFileDrawerLayout(
  base: PipelineDrawerLayoutV1,
  prefs: UserPreferencesV1 | null,
  metricsCtx: PipelineDrawerMetricsContext,
  options?: ApplyUserPrefsNewFileDrawerOptions,
): PipelineDrawerLayoutV1 {
  if (!prefs) {
    return normalizePipelineDrawerLayout(base);
  }

  const mandatoryList =
    options?.effectiveMandatoryBlockIds ?? getMandatoryPipelineBlockIds();
  const mandatory = new Set<PipelineDrawerSectionId>(
    mandatoryList as PipelineDrawerSectionId[],
  );

  let order = [...base.order];
  if (prefs.blockOrder.length > 0) {
    order = mergeBlockOrder(prefs.blockOrder, base.order);
  }

  let hidden = [...base.hidden];
  if (prefs.defaultBlocks.length > 0) {
    const visible = new Set<PipelineDrawerSectionId>();
    for (const id of prefs.defaultBlocks) {
      if (ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId)) {
        visible.add(id as PipelineDrawerSectionId);
      }
    }
    for (const id of mandatoryList) {
      visible.add(id as PipelineDrawerSectionId);
    }
    const hiddenSet = new Set<PipelineDrawerSectionId>();
    for (const id of order) {
      if (mandatory.has(id)) continue;
      if (!visible.has(id)) hiddenSet.add(id);
    }
    hidden = [...hiddenSet];
  }

  const visibleBlockIds = order.filter((id) => !hidden.includes(id));
  const expandUx = readPipelineFileExpandUxRules(prefs.behaviorSettings);
  let expanded: Partial<Record<PipelineFileSectionId, boolean>> = {
    ...expandedForCollapse(prefs.collapseBehavior, order, metricsCtx),
    ...headerSectionsExpandedForCollapseBehavior(prefs.collapseBehavior),
  };
  expanded = applyPipelineFileExpandUxToExpanded(expanded, expandUx, {
    visibleBlockIds,
    metricsCtx,
    actionHints: null,
  });

  let settingsOut: PipelineDrawerLayoutV1["settings"] = undefined;
  if (base.settings && Object.keys(base.settings).length > 0) {
    settingsOut = { ...base.settings };
  }
  if (
    prefs.newFileDrawerSettings &&
    typeof prefs.newFileDrawerSettings === "object"
  ) {
    for (const [k, val] of Object.entries(prefs.newFileDrawerSettings)) {
      if (!ALL_PIPELINE_BLOCK_IDS.has(k as PipelineBlockId)) continue;
      if (!val || typeof val !== "object" || Array.isArray(val)) continue;
      const id = k as PipelineDrawerSectionId;
      settingsOut = settingsOut ?? {};
      settingsOut[id] = {
        ...(settingsOut[id] ?? {}),
        ...(val as Record<string, unknown>),
      };
    }
  }

  return normalizePipelineDrawerLayout({
    v: 1,
    order,
    hidden,
    expanded,
    ...(settingsOut && Object.keys(settingsOut).length > 0
      ? { settings: settingsOut }
      : {}),
  });
}

function termOptionsToLite(
  rows: NonNullable<PipelineDoc["termOptions"]> | undefined,
): TermOptionRowLite[] {
  if (!rows) return [];
  return rows.map((row) => ({
    rate: row.rate ?? "",
    term: row.term ?? "",
    prepaymentPenalty: row.prepaymentPenalty ?? "",
    notes: row.notes ?? "",
    appraisalRequired: row.appraisalRequired,
    newLoanAmount: row.newLoanAmount,
    fundingTimeframe: row.fundingTimeframe,
    qualifyingIncomeType: row.qualifyingIncomeType,
    includeQualifyingIncomeAmount: row.includeQualifyingIncomeAmount,
    qualifyingIncomeAmount: row.qualifyingIncomeAmount,
  }));
}

/**
 * Builds drawer field-density context for a row that has not been inserted yet
 * (used when computing `smart` collapse for new files).
 */
export function buildNewFilePipelineMetricsContext(args: {
  body: Omit<
    PipelineDoc,
    "_id" | "_creationTime" | "createdAt" | "updatedAt"
  >;
  dealData?: unknown;
  intakeSheetId?: Id<"intakeSheets">;
  /** When set, preferred over coercing `dealData` for workspace tab counts. */
  dealSheet?: IntakeSheetDoc | null;
}): PipelineDrawerMetricsContext {
  const pipeline = {
    ...args.body,
    dealData: args.dealData,
    intakeSheetId: args.intakeSheetId,
    _id: "kx7newfile_metrics_placeholder" as Id<"pipeline">,
    _creationTime: 0,
  } as PipelineDoc;

  const dealSheet: IntakeSheetDoc | null =
    args.dealSheet ??
    (args.dealData &&
    typeof args.dealData === "object" &&
    args.dealData !== null
      ? (args.dealData as IntakeSheetDoc)
      : null);

  return buildPipelineDrawerMetricsContext({
    pipeline,
    termOptions: termOptionsToLite(args.body.termOptions),
    licenseLo: "",
    licenseBroker: "",
    linkedTasks: [],
    associatedContactLinkCount: 0,
    dealSheet,
  });
}
