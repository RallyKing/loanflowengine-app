import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { pickCanonicalUserPreferences } from "./userPreferencesPick";
import {
  drawerSettingsForDb,
  normalizePipelineDrawerLayout,
  type PipelineDrawerLayoutV1,
} from "../lib/pipelineDrawerLayoutStorage";
import {
  ALL_PIPELINE_BLOCK_IDS,
  getGloballyLockedPipelineBlockIds,
  type PipelineBlockId,
} from "../lib/pipelineBlockRegistry";
import {
  applyPipelineGlobalBlockPolicy,
  getEffectiveMandatoryPipelineBlockIds,
  stripNonHideableFromHidden,
} from "../lib/pipelineGlobalBlockPolicy";
import type { PipelineDrawerMetricsContext } from "../lib/file/fileSectionMetrics";
import {
  getDefaultUserPreferences,
  mergeServerUserPreferences,
} from "../lib/userPreferencesModel";
import {
  applyPipelineFileTemplatePayloadToLayout,
  getPipelineFileTemplate,
} from "../lib/pipelineFileTemplates";
import { loadUserPipelineFileTemplateForLayout } from "./pipelineFileUserTemplatesShared";
import {
  applyDrawerCollapseFromPreferences,
  applyUserPreferencesToNewFileDrawerLayout,
} from "../lib/userPreferencesNewFileDrawer";

export const PIPELINE_GLOBAL_BLOCK_CONFIG_KEY = "singleton" as const;

function pickCanonicalPipelineGlobalBlockConfig(
  rows: Doc<"pipelineGlobalBlockConfig">[],
): Doc<"pipelineGlobalBlockConfig"> | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0]!;
  return rows.reduce((a, b) => (a.updatedAt >= b.updatedAt ? a : b));
}

function drawerExpandedForDb(
  expanded: PipelineDrawerLayoutV1["expanded"]
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(expanded)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

export function layoutToDbFields(layout: PipelineDrawerLayoutV1): {
  order: string[];
  hidden: string[];
  expanded: Record<string, boolean>;
  settings?: Record<string, unknown>;
} {
  const settings = drawerSettingsForDb(layout.settings);
  return {
    order: layout.order,
    hidden: layout.hidden,
    expanded: drawerExpandedForDb(layout.expanded),
    ...(settings ? { settings } : {}),
  };
}

export async function getPipelineGlobalBlockConfigRow(
  ctx: Pick<QueryCtx, "db">
): Promise<Doc<"pipelineGlobalBlockConfig"> | null> {
  const rows = await ctx.db
    .query("pipelineGlobalBlockConfig")
    .withIndex("by_key", (q) => q.eq("key", PIPELINE_GLOBAL_BLOCK_CONFIG_KEY))
    .collect();
  return pickCanonicalPipelineGlobalBlockConfig(rows);
}

export function defaultNewFileDrawerLayout(): PipelineDrawerLayoutV1 {
  return normalizePipelineDrawerLayout({
    v: 1,
    order: [],
    hidden: [],
    expanded: {},
  });
}

export function resolvedConfigFromRow(
  row: Doc<"pipelineGlobalBlockConfig"> | null
): {
  disabledBlockIds: string[];
  adminRequiredBlockIds: string[];
  newFileDrawerLayout: PipelineDrawerLayoutV1;
  updatedAt: number;
} {
  const baseLayout = row?.newFileDrawerLayout ?? {
    v: 1 as const,
    order: [],
    hidden: [],
    expanded: {},
  };
  const normalized = normalizePipelineDrawerLayout(baseLayout);
  const nonHideable = new Set(
    getEffectiveMandatoryPipelineBlockIds(row?.adminRequiredBlockIds)
  );
  /** Legacy `disabledBlockIds` is no longer merged into the template or runtime drawer. */
  const newFileDrawerLayout = applyPipelineGlobalBlockPolicy(
    {
      ...normalized,
      hidden: stripNonHideableFromHidden(normalized.hidden, nonHideable),
    },
    { disabled: new Set(), nonHideable }
  );
  return {
    disabledBlockIds: row?.disabledBlockIds ?? [],
    adminRequiredBlockIds: row?.adminRequiredBlockIds ?? [],
    newFileDrawerLayout,
    updatedAt: row?.updatedAt ?? 0,
  };
}

export async function getNonHideableMandatorySetForCtx(
  ctx: Pick<QueryCtx, "db">
): Promise<Set<string>> {
  const row = await getPipelineGlobalBlockConfigRow(ctx);
  return new Set(getEffectiveMandatoryPipelineBlockIds(row?.adminRequiredBlockIds));
}

/**
 * Product-wide “disabled blocks” are no longer applied when persisting per-file
 * layouts (new-file defaults use `newFileDrawerLayout.hidden` instead).
 */
export async function getDisabledBlockSetForCtx(
  _ctx: Pick<QueryCtx, "db">
): Promise<Set<string>> {
  return new Set();
}

export async function finalizeFileDrawerLayoutForPersist(
  ctx: Pick<QueryCtx, "db">,
  layout: PipelineDrawerLayoutV1
): Promise<PipelineDrawerLayoutV1> {
  const normalized = normalizePipelineDrawerLayout(layout);
  const nonHideable = await getNonHideableMandatorySetForCtx(ctx);
  const disabled = await getDisabledBlockSetForCtx(ctx);
  const hidden = stripNonHideableFromHidden(normalized.hidden, nonHideable);
  return applyPipelineGlobalBlockPolicy(
    { ...normalized, hidden },
    { disabled, nonHideable }
  );
}

export async function getInitialFileDrawerLayoutForNewRow(
  ctx: Pick<QueryCtx, "db">
): Promise<PipelineDrawerLayoutV1> {
  const row = await getPipelineGlobalBlockConfigRow(ctx);
  return resolvedConfigFromRow(row).newFileDrawerLayout;
}

export type ResolveNewFileDrawerLayoutOptions = {
  /** When set, uses the catalog template for blocks/order/settings; user prefs still drive collapse only. */
  catalogFileTemplateId?: string;
  /**
   * When set, uses this account-owned template (same effect as catalog).
   * Mutually exclusive with `catalogFileTemplateId`. Requires `preferencesAccountId`.
   */
  userPipelineFileTemplateId?: Id<"pipelineFileUserTemplates">;
};

/**
 * New-file drawer layout: global admin template, then optional per-account
 * `userPreferences` (block lists / order / collapse). When `catalogFileTemplateId`
 * is set, the catalog template replaces block visibility/order/settings for this
 * creation; account `collapseBehavior` still applies. Always finalized for persist.
 */
export async function resolveNewFileDrawerLayout(
  ctx: Pick<QueryCtx, "db">,
  preferencesAccountId: string | undefined,
  metricsCtx: PipelineDrawerMetricsContext,
  options?: ResolveNewFileDrawerLayoutOptions,
): Promise<PipelineDrawerLayoutV1> {
  const globalRow = await getPipelineGlobalBlockConfigRow(ctx);
  const base = resolvedConfigFromRow(globalRow).newFileDrawerLayout;
  const effectiveMandatory = getEffectiveMandatoryPipelineBlockIds(
    globalRow?.adminRequiredBlockIds,
  );
  const trimmed = preferencesAccountId?.trim();
  const catalogId = options?.catalogFileTemplateId?.trim();
  const userTplId = options?.userPipelineFileTemplateId;

  if (catalogId && userTplId) {
    throw new Error("Choose either a built-in template or a personal template, not both.");
  }

  if (userTplId) {
    if (!trimmed) {
      throw new Error("Personal file templates require a signed-in account.");
    }
    const userTpl = await loadUserPipelineFileTemplateForLayout(
      ctx,
      userTplId,
      trimmed,
    );
    if (!userTpl) {
      throw new Error("Personal template not found.");
    }
    let prefsForCollapse = getDefaultUserPreferences();
    const prefRows = await ctx.db
      .query("userPreferences")
      .withIndex("by_accountId", (q) => q.eq("accountId", trimmed))
      .collect();
    const doc = pickCanonicalUserPreferences(prefRows);
    if (doc) prefsForCollapse = mergeServerUserPreferences(doc);
    const withTemplate = applyPipelineFileTemplatePayloadToLayout(
      base,
      {
        includedBlocks: userTpl.includedBlocks as PipelineBlockId[],
        blockOrder: userTpl.blockOrder,
        defaultSettings: userTpl.defaultSettings,
      },
      effectiveMandatory,
    );
    const withCollapse = applyDrawerCollapseFromPreferences(
      withTemplate,
      prefsForCollapse.collapseBehavior,
      metricsCtx,
      { behaviorSettings: prefsForCollapse.behaviorSettings },
    );
    return finalizeFileDrawerLayoutForPersist(ctx, withCollapse);
  }

  if (catalogId) {
    const template = getPipelineFileTemplate(catalogId);
    if (!template) {
      throw new Error(`Unknown pipeline file template: ${catalogId}`);
    }
    let prefsForCollapse = getDefaultUserPreferences();
    if (trimmed) {
      const prefRows = await ctx.db
        .query("userPreferences")
        .withIndex("by_accountId", (q) => q.eq("accountId", trimmed))
        .collect();
      const doc = pickCanonicalUserPreferences(prefRows);
      if (doc) prefsForCollapse = mergeServerUserPreferences(doc);
    }
    const withTemplate = applyPipelineFileTemplatePayloadToLayout(
      base,
      {
        includedBlocks: template.includedBlocks,
        blockOrder: template.blockOrder,
        defaultSettings: template.defaultSettings,
      },
      effectiveMandatory,
    );
    const withCollapse = applyDrawerCollapseFromPreferences(
      withTemplate,
      prefsForCollapse.collapseBehavior,
      metricsCtx,
      { behaviorSettings: prefsForCollapse.behaviorSettings },
    );
    return finalizeFileDrawerLayoutForPersist(ctx, withCollapse);
  }

  if (!trimmed) {
    return finalizeFileDrawerLayoutForPersist(ctx, base);
  }
  const prefRows = await ctx.db
    .query("userPreferences")
    .withIndex("by_accountId", (q) => q.eq("accountId", trimmed))
    .collect();
  const doc = pickCanonicalUserPreferences(prefRows);
  const prefs = doc ? mergeServerUserPreferences(doc) : null;
  const merged = applyUserPreferencesToNewFileDrawerLayout(
    base,
    prefs,
    metricsCtx,
    { effectiveMandatoryBlockIds: effectiveMandatory },
  );
  return finalizeFileDrawerLayoutForPersist(ctx, merged);
}

const lockedGlobal = new Set<string>(getGloballyLockedPipelineBlockIds());

export function validateGlobalBlockConfigInput(input: {
  disabledBlockIds: string[];
  adminRequiredBlockIds: string[];
  newFileDrawerLayout: PipelineDrawerLayoutV1;
}): void {
  for (const id of input.disabledBlockIds) {
    if (lockedGlobal.has(id)) {
      throw new Error(`Cannot globally disable required block: ${id}`);
    }
  }
  const nonHideable = new Set(
    getEffectiveMandatoryPipelineBlockIds(input.adminRequiredBlockIds)
  );
  for (const id of input.adminRequiredBlockIds) {
    if (typeof id !== "string" || !ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId)) {
      throw new Error(`Invalid block id in admin required: ${id}`);
    }
    if (input.disabledBlockIds.includes(id)) {
      throw new Error(`Cannot mark a disabled block as required: ${id}`);
    }
  }
  for (const id of nonHideable) {
    if (input.newFileDrawerLayout.hidden.includes(id)) {
      throw new Error(
        `Required block cannot be hidden in new file template: ${id}`
      );
    }
  }
}

export async function ensurePipelineGlobalBlockConfig(
  ctx: MutationCtx
): Promise<Doc<"pipelineGlobalBlockConfig">> {
  const existing = await getPipelineGlobalBlockConfigRow(ctx);
  if (existing) return existing;
  const now = Date.now();
  const initialLayout = defaultNewFileDrawerLayout();
  const inserted = await ctx.db.insert("pipelineGlobalBlockConfig", {
    key: "singleton",
    disabledBlockIds: [],
    adminRequiredBlockIds: [],
    newFileDrawerLayout: {
      v: 1,
      ...layoutToDbFields(initialLayout),
    },
    updatedAt: now,
  });
  const created = await ctx.db.get(inserted);
  if (!created) throw new Error("Failed to create pipelineGlobalBlockConfig");
  return created;
}

export type PipelineGlobalBlockConfigPatch = {
  disabledBlockIds: string[];
  adminRequiredBlockIds: string[];
  newFileDrawerLayout: PipelineDrawerLayoutV1;
};

export async function writePipelineGlobalBlockConfig(
  ctx: MutationCtx,
  patch: PipelineGlobalBlockConfigPatch
): Promise<Id<"pipelineGlobalBlockConfig">> {
  validateGlobalBlockConfigInput(patch);
  const normalizedLayout = normalizePipelineDrawerLayout(patch.newFileDrawerLayout);
  const nonHideable = new Set(
    getEffectiveMandatoryPipelineBlockIds(patch.adminRequiredBlockIds)
  );
  const coercedHidden = stripNonHideableFromHidden(normalizedLayout.hidden, nonHideable);
  const newFileDrawerLayout = applyPipelineGlobalBlockPolicy(
    { ...normalizedLayout, hidden: coercedHidden },
    { disabled: new Set(), nonHideable }
  );
  const now = Date.now();
  const row = await ensurePipelineGlobalBlockConfig(ctx);
  await ctx.db.patch(row._id, {
    /** Retired: always clear; “off” for new files is `newFileDrawerLayout.hidden`. */
    disabledBlockIds: [],
    adminRequiredBlockIds: patch.adminRequiredBlockIds.filter(
      (id) => typeof id === "string" && ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId)
    ),
    newFileDrawerLayout: {
      v: 1,
      ...layoutToDbFields(newFileDrawerLayout),
    },
    updatedAt: now,
  });
  return row._id;
}
