import type { ComponentType } from "react";
import type { PipelineBlockVisibilitySpec } from "./pipelineBlockVisibility";
import type { PipelineBlockSettingsSchema } from "./pipelineBlockSettingsSchema";

export type { PipelineBlockSettingsSchema } from "./pipelineBlockSettingsSchema";

/**
 * Canonical pipeline drawer block ids. Keep in sync with `PIPELINE_BLOCKS` below.
 */
export const PIPELINE_BLOCK_IDS = [
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
  "constructionBudget",
  "investorExperience",
  "pfs",
] as const;

export type PipelineBlockId = (typeof PIPELINE_BLOCK_IDS)[number];

/** Fast membership checks for persisted ids and Convex payloads. */
export const ALL_PIPELINE_BLOCK_IDS = new Set<PipelineBlockId>(
  PIPELINE_BLOCK_IDS,
);

export type PipelineBlockCategory =
  | "file"
  | "deal"
  | "analysis"
  | "execution"
  | "people"
  | "admin";

/**
 * Parent tabs of the pipeline file workspace (command-center tabs + the
 * routable Settings tab). Every modular block belongs to exactly one parent
 * tab — this grouping is the single source of truth for template UIs
 * (Built-in Strategies viewer, custom template builder, wizard).
 * Keep in sync with `tabForDrawerBlock` in `lib/pipeline/fileWorkspaceTabRouting.ts`.
 */
export const PIPELINE_PARENT_TAB_IDS = [
  "dealInfo",
  "financials",
  "portalsProgress",
  "documents",
  "settings",
] as const;

export type PipelineParentTabId = (typeof PIPELINE_PARENT_TAB_IDS)[number];

export const PIPELINE_PARENT_TAB_LABELS: Record<PipelineParentTabId, string> = {
  dealInfo: "Deal Info",
  financials: "Financials",
  portalsProgress: "Portals · Progress",
  documents: "Documents",
  settings: "Settings",
};

export const PIPELINE_PARENT_TAB_DESCRIPTIONS: Record<
  PipelineParentTabId,
  string
> = {
  dealInfo:
    "Core deal identification, borrowers, notes, tasks, and lender shopping.",
  financials:
    "Deal structure, budgets, financial statements, and scenario analysis.",
  portalsProgress:
    "Borrower portal, underwriting progress, and milestone tracking.",
  documents: "Document vault, uploads, and file attachments.",
  settings: "File access, archive, and administrative controls.",
};

/**
 * Always-on workspace surfaces that live on a parent tab but are not
 * toggleable drawer blocks (they ship with every file). Rendered by template
 * UIs as locked rows so each tab shows its full contents.
 */
export const PIPELINE_PARENT_TAB_CORE_SURFACES: Record<
  PipelineParentTabId,
  readonly { name: string; description: string }[]
> = {
  dealInfo: [],
  financials: [],
  portalsProgress: [
    {
      name: "Client portal control room",
      description:
        "Borrower invites, secure links, uploads inbox, and communications.",
    },
    {
      name: "Underwriting ledger",
      description:
        "Condition tracking, lender track, and internal workflow queue.",
    },
  ],
  documents: [
    {
      name: "Document vault",
      description:
        "Central storage for every file document, folder, and portal upload.",
    },
  ],
  settings: [],
};

export type PipelineBlockDefinition = {
  readonly blockId: PipelineBlockId;
  /** Stable human-readable name (used for admin and diagnostics). */
  readonly name: string;
  /** Display label in the UI (kept for backward compatibility; should match `name`). */
  readonly label: string;
  /** Optional admin / settings blurb. */
  readonly description?: string;
  readonly category: PipelineBlockCategory;
  /**
   * Parent tab in the pipeline file workspace where this block's content
   * lives. Drives grouping in template UIs (strategy viewer, custom builder).
   */
  readonly parentTab: PipelineParentTabId;
  /** Whether the block is included in the default drawer layout for new files. */
  readonly isDefault: boolean;
  /** Whether the block is required and cannot be removed from the drawer layout. */
  readonly isMandatory: boolean;
  /**
   * Repo-relative path to the primary implementation surface for this block
   * (Next.js app root: `lender-app/`). Used for audits and tooling — not a dynamic import path.
   */
  readonly componentReference: string;
  /**
   * Optional React component for programmatic mounting. Most drawer blocks are rendered
   * inline in `PipelineDrawer`; keep `null` until a block is fully componentized.
   */
  readonly component: ComponentType<Record<string, never>> | null;
  readonly uiSurface: "drawer" | "page" | "modal" | "embedded";
  readonly discoveryTags: readonly string[];
  /**
   * JSON-schema-shaped bag describing configurable keys for this block’s
   * per-instance `fileDrawerLayout.settings[blockId]`. `null` = no settings.
   */
  readonly settingsSchema: PipelineBlockSettingsSchema | null;
  /**
   * Optional deal-context rules: when conditions fail, the block is not rendered
   * in the drawer (layout + stored data are unchanged). Omitted = always eligible.
   * **Mandatory** blocks ignore this at render time.
   */
  readonly visibilityWhen?: PipelineBlockVisibilitySpec;
};

export const PIPELINE_BLOCKS = [
  {
    blockId: "fileDetails",
    name: "File details",
    label: "File details",
    description: "Core file metadata and identifiers.",
    category: "file",
    parentTab: "dealInfo",
    isDefault: true,
    isMandatory: true,
    componentReference: "components/PipelineFileWorkspace.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: ["file", "details", "basics"],
    settingsSchema: null,
  },
  {
    blockId: "fileNotes",
    name: "File notes",
    label: "File notes",
    description:
      "Relational audit log (pipelineFileNotes) with pins, URL links, and file attachments.",
    category: "file",
    parentTab: "dealInfo",
    isDefault: true,
    isMandatory: false,
    componentReference: "components/pipeline/blocks/FileNotesBlock.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: ["notes", "memo", "file"],
    settingsSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        rows: { type: "integer", default: 2, minimum: 2, maximum: 24 },
      },
    },
  },
  {
    blockId: "dealWorkspace",
    name: "Deal workspace",
    label: "Deal workspace",
    description: "Intake and deal structure for the file.",
    category: "deal",
    parentTab: "financials",
    isDefault: true,
    isMandatory: true,
    componentReference: "components/intake/IntakeEditor.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: ["deal", "intake", "workspace"],
    settingsSchema: null,
  },
  {
    blockId: "licensing",
    name: "Licensing",
    label: "Licensing",
    description: "NMLS / licensing fields tied to the deal.",
    category: "deal",
    parentTab: "dealInfo",
    isDefault: true,
    isMandatory: false,
    componentReference: "components/PipelineFileWorkspace.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: ["licensing", "nmls"],
    settingsSchema: null,
  },
  {
    blockId: "scenarioMatch",
    name: "Scenario match",
    label: "Scenario match",
    description: "Match scenarios and program fit.",
    category: "analysis",
    parentTab: "financials",
    isDefault: true,
    isMandatory: false,
    componentReference: "components/PipelineScenarioMatch.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: ["scenario", "match", "pricing"],
    settingsSchema: null,
  },
  {
    blockId: "generateTerms",
    name: "Generate terms",
    label: "Generate terms",
    description: "Generate and refine term sheets.",
    category: "execution",
    parentTab: "financials",
    isDefault: true,
    isMandatory: false,
    componentReference: "components/PipelineFileWorkspace.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: ["terms", "generate"],
    settingsSchema: null,
    visibilityWhen: {
      match: "any",
      conditions: [
        { path: "dealType", op: "containsIgnoreCase", value: "refin" },
        { path: "fundingType", op: "containsIgnoreCase", value: "refin" },
      ],
    },
  },
  {
    blockId: "lenders",
    name: "Lenders",
    label: "Lenders",
    description: "Lender selection and shopping workflow.",
    category: "execution",
    parentTab: "dealInfo",
    isDefault: true,
    isMandatory: false,
    componentReference: "components/PipelineFileWorkspace.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: ["lenders", "shopping"],
    settingsSchema: null,
  },
  {
    blockId: "contacts",
    name: "Contacts",
    label: "Contacts",
    description: "Borrower and contact records for the file.",
    category: "people",
    parentTab: "dealInfo",
    isDefault: true,
    isMandatory: false,
    componentReference: "components/pipeline/blocks/FileContactsBlock.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: ["contacts", "borrowers"],
    settingsSchema: null,
  },
  {
    blockId: "feesSplits",
    name: "Fees & splits",
    label: "Fees & splits",
    description: "Fee worksheet and split breakdown.",
    category: "execution",
    parentTab: "dealInfo",
    isDefault: true,
    isMandatory: false,
    componentReference: "components/PipelineFileWorkspace.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: ["fees", "splits", "comp"],
    settingsSchema: null,
    visibilityWhen: {
      match: "any",
      conditions: [
        { path: "fundingType", op: "containsIgnoreCase", value: "investor" },
        { path: "fundingType", op: "containsIgnoreCase", value: "dscr" },
        { path: "dealType", op: "containsIgnoreCase", value: "investor" },
      ],
    },
  },
  {
    blockId: "tasks",
    name: "Tasks",
    label: "Tasks",
    description: "File-level tasks and follow-ups.",
    category: "execution",
    parentTab: "dealInfo",
    isDefault: true,
    isMandatory: false,
    componentReference: "components/pipeline/blocks/FileTasksBlock.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: ["tasks", "checklist"],
    settingsSchema: null,
  },
  {
    blockId: "people",
    name: "Pipeline File Access",
    label: "Pipeline File Access",
    description: "Owner-scoped ACL sharing for the file.",
    category: "people",
    parentTab: "settings",
    isDefault: true,
    isMandatory: false,
    componentReference: "components/PipelineFileSharingSection.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: ["people", "team"],
    settingsSchema: null,
  },
  {
    blockId: "archive",
    name: "Archive",
    label: "Archive",
    description: "Archive and restore the file.",
    category: "admin",
    parentTab: "settings",
    isDefault: true,
    isMandatory: false,
    componentReference: "components/PipelineFileWorkspace.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: ["archive", "history"],
    settingsSchema: null,
  },
  {
    blockId: "dangerZone",
    name: "Danger zone",
    label: "Danger zone",
    description: "Destructive actions such as delete.",
    category: "admin",
    parentTab: "settings",
    isDefault: true,
    isMandatory: false,
    componentReference: "components/PipelineFileWorkspace.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: ["danger", "delete"],
    settingsSchema: null,
  },
  {
    blockId: "constructionBudget",
    name: "Construction budget",
    label: "Construction budget",
    description:
      "Line-item construction budget with draw tracking and spend roll-up (ground-up / rehab files).",
    category: "deal",
    parentTab: "financials",
    isDefault: false,
    isMandatory: false,
    componentReference:
      "components/pipeline/blocks/ConstructionBudgetBlock.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: ["construction", "budget", "draws", "rehab"],
    settingsSchema: null,
  },
  {
    blockId: "investorExperience",
    name: "Investor experience",
    label: "Investor experience",
    description:
      "Borrower track record — investor projects that travel across files (36-month window).",
    category: "people",
    parentTab: "dealInfo",
    isDefault: false,
    isMandatory: false,
    componentReference:
      "components/pipeline/blocks/InvestorExperienceBlock.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: ["investor", "experience", "track record", "projects"],
    settingsSchema: null,
  },
  {
    blockId: "pfs",
    name: "Personal financial statement",
    label: "Personal financial statement",
    description:
      "SBA-style personal financial statement (assets, liabilities, schedules, net worth) matching the standard PFS spreadsheet.",
    category: "deal",
    parentTab: "financials",
    isDefault: false,
    isMandatory: false,
    componentReference: "components/pipeline/blocks/PfsBlock.tsx",
    component: null,
    uiSurface: "drawer",
    discoveryTags: [
      "pfs",
      "personal financial statement",
      "net worth",
      "assets",
      "liabilities",
      "guarantor",
    ],
    settingsSchema: null,
  },
] as const satisfies readonly PipelineBlockDefinition[];

/** Central registry export alias — same array as `PIPELINE_BLOCKS`. */
export const PIPELINE_BLOCK_REGISTRY = PIPELINE_BLOCKS;

export function getPipelineBlockRegistry(): readonly PipelineBlockDefinition[] {
  return PIPELINE_BLOCKS;
}

const BLOCK_BY_ID: Record<PipelineBlockId, PipelineBlockDefinition> = (() => {
  const m = {} as Record<PipelineBlockId, PipelineBlockDefinition>;
  for (const block of PIPELINE_BLOCKS) {
    m[block.blockId] = block;
  }
  return m;
})();

/** Ids that cannot be turned off globally (must stay available in the product). */
export function getGloballyLockedPipelineBlockIds(): readonly PipelineBlockId[] {
  return PIPELINE_BLOCKS.filter((b) => b.isMandatory).map((b) => b.blockId);
}

/** Registry-defined mandatory blocks (cannot be removed from drawer layouts). */
export function getMandatoryPipelineBlockIds(): readonly PipelineBlockId[] {
  return PIPELINE_BLOCKS.filter((b) => b.isMandatory).map((b) => b.blockId);
}

/** Default drawer section order for new layouts — `isDefault` blocks in registry order. */
export function getDefaultDrawerSectionOrder(): PipelineBlockId[] {
  return PIPELINE_BLOCKS.filter((b) => b.isDefault).map((b) => b.blockId);
}

/**
 * Opt-in registry blocks (`isDefault: false`) — appended to layouts as hidden
 * so users/templates can enable them (Phase Modular-C blocks and later).
 */
export function getOptionalPipelineBlockIds(): PipelineBlockId[] {
  return PIPELINE_BLOCKS.filter((b) => !b.isDefault).map((b) => b.blockId);
}

export type PipelineBlockTabGroup = {
  readonly tabId: PipelineParentTabId;
  readonly label: string;
  readonly description: string;
  /** Always-on surfaces shipped with every file on this tab (not toggleable). */
  readonly coreSurfaces: readonly { name: string; description: string }[];
  /** Every registry block whose content lives on this tab, in registry order. */
  readonly blocks: readonly PipelineBlockDefinition[];
};

/**
 * Global Block Registry grouped by parent tab — the single source of truth
 * for the Built-in Strategies viewer and the custom template builder. Always
 * returns all parent tabs (even when a tab has only core surfaces).
 */
export function getPipelineBlocksGroupedByTab(): readonly PipelineBlockTabGroup[] {
  return PIPELINE_PARENT_TAB_IDS.map((tabId) => ({
    tabId,
    label: PIPELINE_PARENT_TAB_LABELS[tabId],
    description: PIPELINE_PARENT_TAB_DESCRIPTIONS[tabId],
    coreSurfaces: PIPELINE_PARENT_TAB_CORE_SURFACES[tabId],
    blocks: PIPELINE_BLOCKS.filter((b) => b.parentTab === tabId),
  }));
}

export type PipelineBlockRegistryValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * Structural validation for the pipeline block registry (safe in browser and Convex).
 * For filesystem checks on `componentReference`, run `npm run validate:block-registry`.
 */
export function validatePipelineBlockRegistry(): PipelineBlockRegistryValidationResult {
  const errors: string[] = [];
  const seen = new Set<PipelineBlockId>();

  for (const block of PIPELINE_BLOCKS) {
    if (seen.has(block.blockId)) {
      errors.push(`Duplicate blockId: ${block.blockId}`);
    }
    seen.add(block.blockId);
    if (block.name.trim() === "") {
      errors.push(`Empty name for blockId ${block.blockId}`);
    }
    if (block.label.trim() === "") {
      errors.push(`Empty label for blockId ${block.blockId}`);
    }
    if (block.name !== block.label) {
      errors.push(
        `name and label must match for blockId ${block.blockId} (got name=${JSON.stringify(block.name)}, label=${JSON.stringify(block.label)})`,
      );
    }
    if (!block.componentReference || block.componentReference.trim() === "") {
      errors.push(`Missing componentReference for blockId ${block.blockId}`);
    }
    if (!PIPELINE_PARENT_TAB_IDS.includes(block.parentTab)) {
      errors.push(
        `Unknown parentTab ${JSON.stringify(block.parentTab)} for blockId ${block.blockId}`,
      );
    }
    if (!block.componentReference.startsWith("components/")) {
      errors.push(
        `componentReference must start with "components/" for blockId ${block.blockId} (got ${JSON.stringify(block.componentReference)})`,
      );
    }
    if (
      block.settingsSchema !== null &&
      (typeof block.settingsSchema !== "object" ||
        block.settingsSchema === null ||
        Array.isArray(block.settingsSchema))
    ) {
      errors.push(
        `settingsSchema must be a plain object or null for blockId ${block.blockId}`,
      );
    }
    const visibilityWhen = (block as PipelineBlockDefinition).visibilityWhen;
    if (visibilityWhen !== undefined) {
      const vw = visibilityWhen;
      if (vw.match !== "all" && vw.match !== "any") {
        errors.push(
          `visibilityWhen.match invalid for blockId ${block.blockId}`,
        );
      }
      if (!Array.isArray(vw.conditions) || vw.conditions.length === 0) {
        errors.push(
          `visibilityWhen.conditions must be non-empty for blockId ${block.blockId}`,
        );
      } else {
        for (const c of vw.conditions) {
          if (c.path !== "dealType" && c.path !== "fundingType") {
            errors.push(
              `visibilityWhen unknown path for blockId ${block.blockId}`,
            );
          }
          if (
            c.op !== "equalsIgnoreCase" &&
            c.op !== "containsIgnoreCase" &&
            c.op !== "startsWithIgnoreCase"
          ) {
            errors.push(
              `visibilityWhen unknown op for blockId ${block.blockId}`,
            );
          }
          if (typeof c.value !== "string" || !c.value.trim()) {
            errors.push(
              `visibilityWhen empty value for blockId ${block.blockId}`,
            );
          }
        }
      }
    }
  }

  if (PIPELINE_BLOCKS.length !== PIPELINE_BLOCK_IDS.length) {
    errors.push(
      `PIPELINE_BLOCKS length (${PIPELINE_BLOCKS.length}) does not match PIPELINE_BLOCK_IDS length (${PIPELINE_BLOCK_IDS.length})`,
    );
  }

  for (const id of PIPELINE_BLOCK_IDS) {
    if (!seen.has(id)) {
      errors.push(`PIPELINE_BLOCK_IDS includes ${id} but it is missing from PIPELINE_BLOCKS`);
    }
  }

  for (const block of PIPELINE_BLOCKS) {
    if (!PIPELINE_BLOCK_IDS.includes(block.blockId)) {
      errors.push(
        `blockId ${block.blockId} is not listed in PIPELINE_BLOCK_IDS`,
      );
    }
  }

  if (Object.keys(BLOCK_BY_ID).length !== PIPELINE_BLOCKS.length) {
    errors.push(
      `BLOCK_BY_ID size mismatch: map has ${Object.keys(BLOCK_BY_ID).length} keys, PIPELINE_BLOCKS has ${PIPELINE_BLOCKS.length} rows`,
    );
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

const _registryValidation = validatePipelineBlockRegistry();
if (!_registryValidation.ok && typeof process !== "undefined") {
  // eslint-disable-next-line no-console
  console.error(
    "[pipelineBlockRegistry] invalid registry:",
    _registryValidation.errors,
  );
}

function _assertEveryPipelineBlockIdIsRegistered(): void {
  const missing = PIPELINE_BLOCK_IDS.filter((id) => !(id in BLOCK_BY_ID));
  if (missing.length > 0) {
    throw new Error(
      `PIPELINE_BLOCK_IDS missing from PIPELINE_BLOCKS: ${missing.join(", ")}`,
    );
  }
}
_assertEveryPipelineBlockIdIsRegistered();

export function getPipelineBlock(
  blockId: PipelineBlockId,
): PipelineBlockDefinition {
  return BLOCK_BY_ID[blockId];
}

export function getPipelineBlockSettingsSchema(
  blockId: PipelineBlockId,
): PipelineBlockSettingsSchema | null {
  return getPipelineBlock(blockId).settingsSchema;
}

export function listPipelineBlocks(): readonly PipelineBlockDefinition[] {
  return PIPELINE_BLOCKS;
}

export function pipelineDrawerSectionLabels(): Record<
  PipelineBlockId,
  string
> {
  const out = {} as Record<PipelineBlockId, string>;
  for (const b of PIPELINE_BLOCKS) {
    out[b.blockId] = b.label;
  }
  return out;
}
