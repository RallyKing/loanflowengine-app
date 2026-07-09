import { parseJsonUnknown } from "./safeJson";
import {
  ALL_PIPELINE_BLOCK_IDS,
  PIPELINE_BLOCK_IDS,
  type PipelineBlockId,
  getDefaultDrawerSectionOrder,
  getOptionalPipelineBlockIds,
  pipelineDrawerSectionLabels,
} from "./pipelineBlockRegistry";

/**
 * @deprecated Prefer `PipelineBlockId` from `@/lib/pipelineBlockRegistry`.
 * Kept so existing imports (`PipelineFileWorkspace`, layout settings) stay stable.
 */
export type PipelineDrawerSectionId = PipelineBlockId;

/** Header strips above the drawer blocks (not `PipelineBlockId` values). */
export const PIPELINE_FILE_HEADER_SECTION_IDS = [
  "dealMessages",
  "email",
  "documents",
] as const;

export type PipelineFileHeaderSectionId =
  (typeof PIPELINE_FILE_HEADER_SECTION_IDS)[number];

const HEADER_SECTION_ID_SET = new Set<string>(PIPELINE_FILE_HEADER_SECTION_IDS);

export type PipelineFileSectionId =
  | PipelineDrawerSectionId
  | PipelineFileHeaderSectionId;

export type PipelineFileSectionsState = {
  [K in PipelineFileHeaderSectionId]: boolean;
} & Record<PipelineBlockId, boolean>;

export function isPipelineFileHeaderSectionId(
  id: string,
): id is PipelineFileHeaderSectionId {
  return HEADER_SECTION_ID_SET.has(id);
}

export function isPipelineDrawerBlockSectionId(
  id: string,
): id is PipelineDrawerSectionId {
  return ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId);
}

/** Full expand/collapse flags for the pipeline file view (headers + drawer blocks). */
export function buildPipelineFileSectionsState(
  expanded: Partial<Record<PipelineFileSectionId, boolean>>,
): PipelineFileSectionsState {
  const header = Object.fromEntries(
    PIPELINE_FILE_HEADER_SECTION_IDS.map((id) => [id, expanded[id] === true]),
  ) as { [K in PipelineFileHeaderSectionId]: boolean };
  const blocks = Object.fromEntries(
    PIPELINE_BLOCK_IDS.map((id) => [id, expanded[id] === true]),
  ) as Record<PipelineBlockId, boolean>;
  return { ...header, ...blocks };
}

export const PIPELINE_DRAWER_LAYOUT_KEY = "dlc.pipeline-drawer-layout.v1";

/** Human-readable labels — derived from the pipeline block registry. */
export const PIPELINE_DRAWER_SECTION_LABELS: Record<
  PipelineDrawerSectionId,
  string
> = pipelineDrawerSectionLabels();

/** Default section order for new layouts — derived from the block registry. */
export const DEFAULT_PIPELINE_DRAWER_ORDER: PipelineDrawerSectionId[] =
  getDefaultDrawerSectionOrder();

/** Opt-in registry blocks — appended to layouts as hidden by default. */
export const OPTIONAL_PIPELINE_DRAWER_BLOCK_IDS: PipelineDrawerSectionId[] =
  getOptionalPipelineBlockIds();

export type PipelineDrawerLayoutV1 = {
  v: 1;
  order: PipelineDrawerSectionId[];
  hidden: PipelineDrawerSectionId[];
  /** When `true`, section is expanded. Omitted or `false` = collapsed. */
  expanded: Partial<Record<PipelineFileSectionId, boolean>>;
  /**
   * Per-block instance settings (user-defined), keyed by block id.
   * Values are plain objects; shape is described by the block’s `settingsSchema`.
   */
  settings?: Partial<
    Record<PipelineDrawerSectionId, Record<string, unknown>>
  >;
};

/** Serialize `settings` for Convex / JSON persistence. */
export function drawerSettingsForDb(
  settings: PipelineDrawerLayoutV1["settings"] | undefined,
): Record<string, unknown> | undefined {
  if (!settings || typeof settings !== "object") return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (!ALL_PIPELINE_BLOCK_IDS.has(k as PipelineBlockId)) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Normalize persisted / server JSON into a valid drawer layout. */
export function normalizePipelineDrawerLayout(
  raw: unknown
): PipelineDrawerLayoutV1 {
  const base: PipelineDrawerLayoutV1 = {
    v: 1,
    order: [
      ...DEFAULT_PIPELINE_DRAWER_ORDER,
      ...OPTIONAL_PIPELINE_DRAWER_BLOCK_IDS,
    ],
    hidden: [...OPTIONAL_PIPELINE_DRAWER_BLOCK_IDS],
    expanded: {},
    settings: undefined,
  };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return base;

  const orderIn = Array.isArray(o.order) ? o.order : [];
  const seen = new Set<PipelineDrawerSectionId>();
  const order: PipelineDrawerSectionId[] = [];
  for (const x of orderIn) {
    if (typeof x !== "string" || !ALL_PIPELINE_BLOCK_IDS.has(x as PipelineBlockId))
      continue;
    const id = x as PipelineDrawerSectionId;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  for (const id of DEFAULT_PIPELINE_DRAWER_ORDER) {
    if (!seen.has(id)) order.push(id);
  }
  /** Optional blocks unknown to this layout join the board hidden by default. */
  const appendedOptional: PipelineDrawerSectionId[] = [];
  for (const id of OPTIONAL_PIPELINE_DRAWER_BLOCK_IDS) {
    if (!seen.has(id)) {
      order.push(id);
      appendedOptional.push(id);
    }
  }

  const hiddenIn = Array.isArray(o.hidden) ? o.hidden : [];
  const hidden: PipelineDrawerSectionId[] = [];
  const hiddenSeen = new Set<PipelineDrawerSectionId>();
  for (const x of hiddenIn) {
    if (typeof x !== "string" || !ALL_PIPELINE_BLOCK_IDS.has(x as PipelineBlockId))
      continue;
    const id = x as PipelineDrawerSectionId;
    if (hiddenSeen.has(id)) continue;
    hiddenSeen.add(id);
    hidden.push(id);
  }
  for (const id of appendedOptional) {
    if (hiddenSeen.has(id)) continue;
    hiddenSeen.add(id);
    hidden.push(id);
  }

  const expanded: Partial<Record<PipelineFileSectionId, boolean>> = {};
  if (o.expanded && typeof o.expanded === "object" && !Array.isArray(o.expanded)) {
    for (const [k, v] of Object.entries(o.expanded as Record<string, unknown>)) {
      const isBlock = ALL_PIPELINE_BLOCK_IDS.has(k as PipelineBlockId);
      const isHeader = HEADER_SECTION_ID_SET.has(k);
      if (!isBlock && !isHeader) continue;
      if (typeof v === "boolean") {
        expanded[k as PipelineFileSectionId] = v;
      }
    }
  }

  const settings: Partial<
    Record<PipelineDrawerSectionId, Record<string, unknown>>
  > = {};
  if (o.settings && typeof o.settings === "object" && !Array.isArray(o.settings)) {
    for (const [k, v] of Object.entries(
      o.settings as Record<string, unknown>,
    )) {
      if (!ALL_PIPELINE_BLOCK_IDS.has(k as PipelineBlockId)) continue;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        settings[k as PipelineDrawerSectionId] = {
          ...(v as Record<string, unknown>),
        };
      }
    }
  }

  return {
    v: 1,
    order,
    hidden,
    expanded,
    ...(Object.keys(settings).length > 0 ? { settings } : {}),
  };
}

/** Active (visible) drawer blocks in render order — the “Lego board” iteration list. */
export function buildActiveBlocksForLayout(
  layout: PipelineDrawerLayoutV1
): PipelineDrawerSectionId[] {
  return layout.order.filter((sid) => !layout.hidden.includes(sid));
}

/**
 * Remove `blockId` from `hidden` and expand it — used by safe user workflows
 * (after `finalizeFileDrawerLayoutForPersist` enforces global policy).
 */
export function unhideDrawerBlockInLayout(
  raw: unknown,
  blockId: PipelineBlockId,
): PipelineDrawerLayoutV1 {
  const layout = normalizePipelineDrawerLayout(raw);
  if (!ALL_PIPELINE_BLOCK_IDS.has(blockId)) return layout;
  return {
    ...layout,
    hidden: layout.hidden.filter((h) => h !== blockId),
    expanded: { ...layout.expanded, [blockId]: true },
  };
}

export function defaultPipelineDrawerLayout(): PipelineDrawerLayoutV1 {
  return {
    v: 1,
    order: [
      ...DEFAULT_PIPELINE_DRAWER_ORDER,
      ...OPTIONAL_PIPELINE_DRAWER_BLOCK_IDS,
    ],
    hidden: [...OPTIONAL_PIPELINE_DRAWER_BLOCK_IDS],
    expanded: {},
    settings: undefined,
  };
}

/** Per-pipeline-file mirror of drawer state (expanded, order, etc.) for restore and offline. */
export const PIPELINE_DRAWER_LAYOUT_PER_FILE_PREFIX =
  "dlc.pipeline-drawer-layout.file.v1:" as const;

export function pipelineDrawerLayoutPerFileStorageKey(
  pipelineFileId: string,
): string {
  return `${PIPELINE_DRAWER_LAYOUT_PER_FILE_PREFIX}${pipelineFileId}`;
}

/**
 * Prefer server `fileDrawerLayout`, then this device&apos;s last saved layout for
 * this file, then all-collapsed defaults (`expanded` empty = collapsed).
 */
export function resolveDrawerLayoutForHydration(
  serverRaw: unknown | null | undefined,
  localLayout: PipelineDrawerLayoutV1 | null,
): PipelineDrawerLayoutV1 {
  if (serverRaw != null && typeof serverRaw === "object") {
    return normalizePipelineDrawerLayout(serverRaw);
  }
  if (localLayout) {
    return normalizePipelineDrawerLayout(localLayout);
  }
  return defaultPipelineDrawerLayout();
}

/** Last persisted drawer state for a single pipeline file (local only). */
export function loadPipelineDrawerLayoutForFile(
  pipelineFileId: string,
): PipelineDrawerLayoutV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const s = window.localStorage.getItem(
      pipelineDrawerLayoutPerFileStorageKey(pipelineFileId),
    );
    if (!s) return null;
    return normalizePipelineDrawerLayout(parseJsonUnknown(s));
  } catch {
    return null;
  }
}

export function savePipelineDrawerLayoutForFile(
  pipelineFileId: string,
  layout: PipelineDrawerLayoutV1,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      pipelineDrawerLayoutPerFileStorageKey(pipelineFileId),
      JSON.stringify(layout),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadPipelineDrawerLayout(): PipelineDrawerLayoutV1 {
  if (typeof window === "undefined") return defaultPipelineDrawerLayout();
  try {
    const s = localStorage.getItem(PIPELINE_DRAWER_LAYOUT_KEY);
    if (!s) return defaultPipelineDrawerLayout();
    return normalizePipelineDrawerLayout(parseJsonUnknown(s));
  } catch {
    return defaultPipelineDrawerLayout();
  }
}

export function savePipelineDrawerLayout(layout: PipelineDrawerLayoutV1): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PIPELINE_DRAWER_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    /* ignore quota / private mode */
  }
}

export function moveSectionInOrder(
  order: PipelineDrawerSectionId[],
  id: PipelineDrawerSectionId,
  dir: -1 | 1
): PipelineDrawerSectionId[] {
  const i = order.indexOf(id);
  if (i < 0) return order;
  const j = i + dir;
  if (j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
