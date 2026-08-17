/**
 * Central registry of **catalog** pipeline file templates (pre-built layouts).
 * Selecting one at new-file creation sets initial `fileDrawerLayout` for that
 * file only; account `userPreferences` still apply when no catalog template is chosen.
 */
import {
  ALL_PIPELINE_BLOCK_IDS,
  PIPELINE_BLOCK_IDS,
  type PipelineBlockId,
} from "./pipelineBlockRegistry";
import {
  DEFAULT_PIPELINE_DRAWER_ORDER,
  OPTIONAL_PIPELINE_DRAWER_BLOCK_IDS,
  normalizePipelineDrawerLayout,
  type PipelineDrawerLayoutV1,
} from "./pipelineDrawerLayoutStorage";
import { mergeBlockOrder } from "./userPreferencesNewFileDrawer";
import type { PortalRequestChecklistItem } from "./portalRequestChecklists";
import {
  getPortalRequestChecklist,
} from "./portalRequestChecklists";

export type PipelineFileTemplateId =
  | "basic-deal"
  | "advanced-deal"
  | "refinance"
  | "purchase"
  | "investor-scenario"
  | "ground-up-construction"
  | "fix-flip"
  | "factoring"
  | "working-capital"
  | "cash-out-refi";

/** Shape applied onto the global new-file layout (catalog or user-saved). */
export type PipelineFileTemplatePayload = {
  /** Blocks shown in the drawer for new files created with this template. */
  includedBlocks: readonly PipelineBlockId[];
  /** Preferred order (subset; missing ids are filled from default registry order). */
  blockOrder: readonly string[];
  /** Per-block `fileDrawerLayout.settings` merged onto the global baseline. */
  defaultSettings: Partial<
    Record<PipelineBlockId, Record<string, unknown>>
  >;
};

/**
 * Phase Modular-E — workflow extras carried by loan-strategy templates beyond
 * drawer layout. Applied by the New File wizard: favorites merge into the
 * creator's `userPreferences.favoriteFileBlocks`, the portal checklist is
 * queued via `api.clientPortalAdmin.applyRequestChecklist` when the borrower
 * is invited, and task playbooks apply through the task-template flow.
 */
export type PipelineFileTemplateWorkflowExtras = {
  /** Block ids pre-pinned to the favorites quick-access bar. */
  favoriteBlockIds?: readonly PipelineBlockId[];
  /** Portal document requests queued for the borrower portal. */
  portalRequestChecklist?: readonly PortalRequestChecklistItem[];
  /**
   * Org task-template group ids applied on creation. Built-in catalog
   * templates leave this empty (they cannot reference org data); user-saved
   * templates persist real `taskTemplateGroups` ids.
   */
  taskTemplateGroupIds?: readonly string[];
};

export type PipelineFileTemplate = PipelineFileTemplatePayload &
  PipelineFileTemplateWorkflowExtras & {
    templateId: PipelineFileTemplateId;
    name: string;
    description: string;
  };

const ALL_IDS = PIPELINE_BLOCK_IDS;

function checklistItems(id: string): readonly PortalRequestChecklistItem[] {
  return getPortalRequestChecklist(id)?.items ?? [];
}

export const PIPELINE_FILE_TEMPLATES: readonly PipelineFileTemplate[] = [
  {
    templateId: "basic-deal",
    name: "Basic deal",
    description:
      "Core file metadata, notes, deal workspace, licensing, shopping, and contacts — fewer execution blocks.",
    includedBlocks: [
      "fileDetails",
      "fileNotes",
      "dealWorkspace",
      "licensing",
      "lenders",
      "contacts",
      "archive",
      "dangerZone",
    ],
    blockOrder: [
      "fileDetails",
      "fileNotes",
      "dealWorkspace",
      "licensing",
      "lenders",
      "contacts",
      "archive",
      "dangerZone",
    ],
    defaultSettings: { fileNotes: { rows: 4 } },
  },
  {
    templateId: "advanced-deal",
    name: "Advanced deal",
    description:
      "Full drawer: scenario match, term options, fees, tasks, and team blocks included.",
    includedBlocks: [...ALL_IDS],
    blockOrder: [...DEFAULT_PIPELINE_DRAWER_ORDER],
    defaultSettings: { fileNotes: { rows: 8 } },
  },
  {
    templateId: "refinance",
    name: "Refinance",
    description:
      "Emphasizes scenario fit, term generation, lender shopping, and fee breakdown.",
    includedBlocks: [
      "fileDetails",
      "fileNotes",
      "dealWorkspace",
      "licensing",
      "scenarioMatch",
      "generateTerms",
      "lenders",
      "contacts",
      "feesSplits",
      "tasks",
      "people",
      "archive",
      "dangerZone",
    ],
    blockOrder: [
      "fileDetails",
      "dealWorkspace",
      "scenarioMatch",
      "generateTerms",
      "lenders",
      "feesSplits",
      "licensing",
      "contacts",
      "fileNotes",
      "tasks",
      "people",
      "archive",
      "dangerZone",
    ],
    defaultSettings: { fileNotes: { rows: 6 } },
  },
  {
    templateId: "purchase",
    name: "Purchase",
    description:
      "Purchase-oriented flow: deal workspace, contacts, scenario, terms, and lenders.",
    includedBlocks: [
      "fileDetails",
      "fileNotes",
      "dealWorkspace",
      "licensing",
      "scenarioMatch",
      "generateTerms",
      "lenders",
      "contacts",
      "feesSplits",
      "tasks",
      "people",
      "archive",
      "dangerZone",
    ],
    blockOrder: [
      "fileDetails",
      "dealWorkspace",
      "contacts",
      "licensing",
      "scenarioMatch",
      "generateTerms",
      "lenders",
      "feesSplits",
      "fileNotes",
      "tasks",
      "people",
      "archive",
      "dangerZone",
    ],
    defaultSettings: { fileNotes: { rows: 6 } },
  },
  {
    templateId: "investor-scenario",
    name: "Investor scenario",
    description:
      "Investor / DSCR-style emphasis: scenario match, fees & splits, lenders, and execution blocks.",
    includedBlocks: [
      "fileDetails",
      "fileNotes",
      "dealWorkspace",
      "licensing",
      "scenarioMatch",
      "generateTerms",
      "lenders",
      "contacts",
      "feesSplits",
      "tasks",
      "people",
      "archive",
      "dangerZone",
    ],
    blockOrder: [
      "fileDetails",
      "scenarioMatch",
      "dealWorkspace",
      "feesSplits",
      "lenders",
      "generateTerms",
      "licensing",
      "contacts",
      "fileNotes",
      "tasks",
      "people",
      "archive",
      "dangerZone",
    ],
    defaultSettings: { fileNotes: { rows: 5 } },
  },
  // --- Phase Modular-E: loan-strategy templates (favorites + portal checklist) ---
  {
    templateId: "ground-up-construction",
    name: "Ground-Up Construction",
    description:
      "New construction: budget with draws, borrower track record, PFS, and full execution blocks.",
    includedBlocks: [
      "fileDetails",
      "fileNotes",
      "dealWorkspace",
      "licensing",
      "scenarioMatch",
      "generateTerms",
      "lenders",
      "contacts",
      "feesSplits",
      "tasks",
      "constructionBudget",
      "investorExperience",
      "pfs",
      "trackRecord",
      "people",
      "archive",
      "dangerZone",
    ],
    blockOrder: [
      "fileDetails",
      "dealWorkspace",
      "constructionBudget",
      "investorExperience",
      "pfs",
      "trackRecord",
      "scenarioMatch",
      "generateTerms",
      "lenders",
      "feesSplits",
      "licensing",
      "contacts",
      "fileNotes",
      "tasks",
      "people",
      "archive",
      "dangerZone",
    ],
    defaultSettings: { fileNotes: { rows: 6 } },
    favoriteBlockIds: ["constructionBudget", "pfs", "trackRecord", "tasks"],
    portalRequestChecklist: checklistItems("construction-fix-flip"),
  },
  {
    templateId: "fix-flip",
    name: "Fix & Flip",
    description:
      "Rehab-and-resell: rehab budget, investor track record, scenario fit, and lender shopping.",
    includedBlocks: [
      "fileDetails",
      "fileNotes",
      "dealWorkspace",
      "licensing",
      "scenarioMatch",
      "generateTerms",
      "lenders",
      "contacts",
      "feesSplits",
      "tasks",
      "constructionBudget",
      "investorExperience",
      "trackRecord",
      "people",
      "archive",
      "dangerZone",
    ],
    blockOrder: [
      "fileDetails",
      "dealWorkspace",
      "investorExperience",
      "constructionBudget",
      "trackRecord",
      "scenarioMatch",
      "generateTerms",
      "lenders",
      "feesSplits",
      "licensing",
      "contacts",
      "fileNotes",
      "tasks",
      "people",
      "archive",
      "dangerZone",
    ],
    defaultSettings: { fileNotes: { rows: 5 } },
    favoriteBlockIds: ["constructionBudget", "investorExperience", "trackRecord"],
    portalRequestChecklist: checklistItems("construction-fix-flip"),
  },
  {
    templateId: "factoring",
    name: "Factoring",
    description:
      "Receivables financing: cash-flow focused; hides real-estate scenario and construction blocks.",
    includedBlocks: [
      "fileDetails",
      "fileNotes",
      "dealWorkspace",
      "lenders",
      "contacts",
      "feesSplits",
      "tasks",
      "people",
      "archive",
      "dangerZone",
    ],
    blockOrder: [
      "fileDetails",
      "dealWorkspace",
      "contacts",
      "lenders",
      "feesSplits",
      "fileNotes",
      "tasks",
      "people",
      "archive",
      "dangerZone",
    ],
    defaultSettings: { fileNotes: { rows: 5 } },
    favoriteBlockIds: ["tasks", "contacts"],
    portalRequestChecklist: checklistItems("working-capital"),
  },
  {
    templateId: "working-capital",
    name: "Working Capital",
    description:
      "Business cash-flow lending: bank statements, PFS, Simple P&L, and lender shopping without RE blocks.",
    includedBlocks: [
      "fileDetails",
      "fileNotes",
      "dealWorkspace",
      "lenders",
      "contacts",
      "feesSplits",
      "tasks",
      "pfs",
      "simplePl",
      "people",
      "archive",
      "dangerZone",
    ],
    blockOrder: [
      "fileDetails",
      "dealWorkspace",
      "contacts",
      "pfs",
      "simplePl",
      "lenders",
      "feesSplits",
      "fileNotes",
      "tasks",
      "people",
      "archive",
      "dangerZone",
    ],
    defaultSettings: { fileNotes: { rows: 5 } },
    favoriteBlockIds: ["tasks", "pfs", "simplePl"],
    portalRequestChecklist: checklistItems("working-capital"),
  },
  {
    templateId: "cash-out-refi",
    name: "Cash-Out Refi",
    description:
      "Refinance with cash out: scenario fit, term generation, PFS, and fee breakdown.",
    includedBlocks: [
      "fileDetails",
      "fileNotes",
      "dealWorkspace",
      "licensing",
      "scenarioMatch",
      "generateTerms",
      "lenders",
      "contacts",
      "feesSplits",
      "tasks",
      "pfs",
      "people",
      "archive",
      "dangerZone",
    ],
    blockOrder: [
      "fileDetails",
      "dealWorkspace",
      "scenarioMatch",
      "generateTerms",
      "pfs",
      "lenders",
      "feesSplits",
      "licensing",
      "contacts",
      "fileNotes",
      "tasks",
      "people",
      "archive",
      "dangerZone",
    ],
    defaultSettings: { fileNotes: { rows: 5 } },
    favoriteBlockIds: ["pfs", "lenders"],
    portalRequestChecklist: checklistItems("standard-loan-docs"),
  },
];

const TEMPLATE_BY_ID: ReadonlyMap<string, PipelineFileTemplate> = new Map(
  PIPELINE_FILE_TEMPLATES.map((t) => [t.templateId, t]),
);

export function listPipelineFileTemplates(): readonly PipelineFileTemplate[] {
  return PIPELINE_FILE_TEMPLATES;
}

export function getPipelineFileTemplate(
  id: string,
): PipelineFileTemplate | null {
  const t = TEMPLATE_BY_ID.get(id);
  return t ?? null;
}

export function isValidPipelineFileTemplateId(id: string): boolean {
  return TEMPLATE_BY_ID.has(id);
}

/**
 * Merges a catalog or user template payload onto the workspace **global** new-file layout baseline.
 * Unions `includedBlocks` with `effectiveMandatory` so admin/product rules hold.
 * Does not apply collapse behavior — caller should run `applyDrawerCollapseFromPreferences`.
 */
export function applyPipelineFileTemplatePayloadToLayout(
  base: PipelineDrawerLayoutV1,
  template: PipelineFileTemplatePayload,
  effectiveMandatory: readonly PipelineBlockId[],
): PipelineDrawerLayoutV1 {
  const visible = new Set<PipelineBlockId>();
  for (const id of template.includedBlocks) {
    if (ALL_PIPELINE_BLOCK_IDS.has(id)) visible.add(id);
  }
  for (const id of effectiveMandatory) {
    visible.add(id);
  }

  /**
   * Full drawer order (visible + hidden). Include optional registry blocks so
   * `normalizePipelineDrawerLayout` does not force-hide ones listed in
   * `includedBlocks` (older bug: optionals missing from `blockOrder` were always
   * appended as hidden, so PFS never appeared even when the template included it).
   */
  const order = mergeBlockOrder(
    [...template.blockOrder],
    [...DEFAULT_PIPELINE_DRAWER_ORDER, ...OPTIONAL_PIPELINE_DRAWER_BLOCK_IDS],
  );

  /** Hide every registry block not in the template (or effective mandatory) set. */
  const hidden = PIPELINE_BLOCK_IDS.filter((id) => !visible.has(id));

  let settingsOut: PipelineDrawerLayoutV1["settings"] = undefined;
  if (base.settings && Object.keys(base.settings).length > 0) {
    settingsOut = { ...base.settings };
  }
  for (const [k, val] of Object.entries(template.defaultSettings)) {
    if (!ALL_PIPELINE_BLOCK_IDS.has(k as PipelineBlockId)) continue;
    if (!val || typeof val !== "object" || Array.isArray(val)) continue;
    const bid = k as PipelineBlockId;
    settingsOut = settingsOut ?? {};
    settingsOut[bid] = {
      ...(settingsOut[bid] ?? {}),
      ...(val as Record<string, unknown>),
    };
  }

  return normalizePipelineDrawerLayout({
    v: 1,
    order,
    hidden,
    expanded: { ...base.expanded },
    ...(settingsOut && Object.keys(settingsOut).length > 0
      ? { settings: settingsOut }
      : {}),
  });
}

export function applyCatalogFileTemplateToLayout(
  base: PipelineDrawerLayoutV1,
  template: PipelineFileTemplate,
  effectiveMandatory: readonly PipelineBlockId[],
): PipelineDrawerLayoutV1 {
  return applyPipelineFileTemplatePayloadToLayout(
    base,
    {
      includedBlocks: template.includedBlocks,
      blockOrder: template.blockOrder,
      defaultSettings: template.defaultSettings,
    },
    effectiveMandatory,
  );
}
