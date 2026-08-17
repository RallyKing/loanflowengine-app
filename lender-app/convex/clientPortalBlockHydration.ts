import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  mergePatchIntoDeal,
  resolveDealBaseForPipelinePatch,
} from "./dealDataMerge";
import {
  getAtomicPortalBlock,
  isAtomicPortalBlockId,
  normalizeToAtomicBlockIds,
  type AtomicPortalBlockId,
} from "../lib/atomicPortalBlockRegistry";
import { buildPfsDealPatchFromPortalSubmission } from "../lib/pfs/personalFinancialStatementModel";
import {
  CONSTRUCTION_BUDGET_CATALOG_BY_KEY,
  isConstructionBudgetProjectType,
  isConstructionBudgetRepairReplace,
  isConstructionBudgetUnit,
  isValidCompletionTimeframeMonths,
} from "../lib/constructionBudget/constructionBudgetModel";
import {
  findPfsInstance,
  findPfsInstanceByVaultTask,
  normalizePfsInstances,
  pfsDealPatchFromInstances,
  replacePfsInstanceData,
} from "../lib/pfs/pfsInstances";
import { normalizeSimplePlStatement } from "../lib/simplePl/simplePlModel";
import {
  findSimplePlInstance,
  findSimplePlInstanceByVaultTask,
  normalizeSimplePlInstances,
  replaceSimplePlInstanceData,
  simplePlDealPatchFromInstances,
} from "../lib/simplePl/simplePlInstances";
import { SECTION_KEYS } from "./shareSections";

type SubmissionValues = Record<string, unknown>;

/** Reject unknown keys and empty submissions before hydrating dealData. */
export function validateClientPortalFormData(
  blockId: AtomicPortalBlockId,
  formData: unknown,
): void {
  const def = getAtomicPortalBlock(blockId);
  if (formData == null || typeof formData !== "object" || Array.isArray(formData)) {
    throw new Error("Form submission must be a JSON object.");
  }
  const values = formData as SubmissionValues;
  const allowed = new Set<string>(def.dealDataKeys);
  if (def.kind === "dealSection" && def.dealSectionId) {
    for (const key of SECTION_KEYS[def.dealSectionId]) allowed.add(key);
  }
  if (def.kind === "calculator" && def.calculatorId) {
    for (const key of SECTION_KEYS[def.calculatorId]) allowed.add(key);
  }
  if (blockId === "file_details" || blockId === "contacts") {
    [
      "firstName",
      "lastName",
      "email",
      "phone",
      "notes",
      "clientPortalNotes",
      "address",
      "city",
      "state",
      "zip",
    ].forEach((k) => allowed.add(k));
  }
  if (blockId === "file_notes" || blockId === "deal_notes") {
    ["clientPortalNotes", "notes", "primaryObjective", "additionalNotes"].forEach(
      (k) => allowed.add(k),
    );
  }
  if (blockId === "construction_budget") {
    allowed.add("lines");
    allowed.add("header");
    allowed.add("notes");
    allowed.add("clientPortalNotes");
  }
  if (blockId === "investor_experience") {
    allowed.add("projects");
    allowed.add("notes");
    allowed.add("clientPortalNotes");
  }
  if (blockId === "pfs_statement") {
    ["assets", "liabilities", "pfs", "pfsInstances", "notes", "clientPortalNotes"].forEach(
      (k) => allowed.add(k),
    );
  }
  if (blockId === "track_record") {
    ["trackRecord", "trackRecordMeta", "notes", "clientPortalNotes"].forEach(
      (k) => allowed.add(k),
    );
  }
  if (blockId === "simple_pl") {
    ["simplePl", "simplePlInstances", "notes", "clientPortalNotes"].forEach(
      (k) => allowed.add(k),
    );
  }

  let substantive = false;
  for (const [key, raw] of Object.entries(values)) {
    if (key === "submittedAt" || key === "blockId") continue;
    if (!allowed.has(key)) {
      throw new Error(`Field "${key}" is not allowed for this block.`);
    }
    if (raw == null) continue;
    if (typeof raw === "string" && raw.trim()) substantive = true;
    else if (Array.isArray(raw) && raw.length > 0) substantive = true;
    else if (typeof raw === "object" && Object.keys(raw as object).length > 0) {
      substantive = true;
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      substantive = true;
    }
  }
  if (!substantive) {
    throw new Error("Add at least one field before submitting.");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function pickKeys(
  source: SubmissionValues,
  allowed: readonly string[],
): Record<string, unknown> {
  const allowedSet = new Set(allowed);
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (!allowedSet.has(key)) continue;
    if (raw == null) continue;
    if (typeof raw === "string" && raw.trim() === "") continue;
    out[key] = raw;
  }
  return out;
}

function normalizeFormValues(formData: unknown): SubmissionValues {
  if (formData == null) return {};
  if (typeof formData !== "object" || Array.isArray(formData)) {
    return { notes: String(formData) };
  }
  const record = formData as SubmissionValues;
  const notes =
    typeof record.notes === "string" ? record.notes.trim() : "";
  if (notes && !record.clientPortalNotes) {
    return { ...record, clientPortalNotes: notes };
  }
  return record;
}

async function patchPipelineDealData(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  dealPatch: Record<string, unknown>,
): Promise<void> {
  const deal = await resolveDealBaseForPipelinePatch(ctx, file);
  const now = Date.now();
  const mergedDeal = mergePatchIntoDeal(deal, {
    ...dealPatch,
    updatedAt: now,
  });
  await ctx.db.patch(file._id, {
    dealData: mergedDeal as Doc<"pipeline">["dealData"],
    updatedAt: now,
  });
}

/** Snapshot only the dealData slice owned by an atomic block. */
export function extractDealSnapshotSlice(
  dealData: Record<string, unknown> | null | undefined,
  blockId: AtomicPortalBlockId,
  options?: {
    fileTask?: Pick<
      Doc<"documentVaultFileTasks">,
      "_id" | "sourceKind" | "sourceInstanceId"
    >;
  },
): Record<string, unknown> {
  const def = getAtomicPortalBlock(blockId);
  const deal = dealData ?? {};
  if (blockId === "pfs_statement" && options?.fileTask) {
    const instances = normalizePfsInstances(deal);
    const inst =
      (options.fileTask.sourceKind === "pfs_instance"
        ? findPfsInstance(instances, options.fileTask.sourceInstanceId)
        : undefined) ??
      findPfsInstanceByVaultTask(instances, String(options.fileTask._id));
    if (inst) {
      return { pfs: inst.data };
    }
    if (instances.length > 1) {
      return {};
    }
    if (instances[0]) {
      return { pfs: instances[0].data };
    }
  }
  if (blockId === "simple_pl" && options?.fileTask) {
    const instances = normalizeSimplePlInstances(deal);
    const inst =
      (options.fileTask.sourceKind === "simple_pl_instance"
        ? findSimplePlInstance(instances, options.fileTask.sourceInstanceId)
        : undefined) ??
      findSimplePlInstanceByVaultTask(instances, String(options.fileTask._id));
    if (inst) {
      return { simplePl: inst.data };
    }
    if (instances.length > 1) {
      return {};
    }
    if (instances[0]) {
      return { simplePl: instances[0].data };
    }
  }
  const slice: Record<string, unknown> = {};
  for (const key of def.dealDataKeys) {
    if (key === "pfsInstances" || key === "simplePlInstances") continue;
    if (deal[key] !== undefined) slice[key] = deal[key];
  }
  return slice;
}

function buildDealPatchForAtomicBlock(
  blockId: AtomicPortalBlockId,
  values: SubmissionValues,
): Record<string, unknown> | null {
  const def = getAtomicPortalBlock(blockId);
  if (def.kind === "dealSection" && def.dealSectionId) {
    const keys = SECTION_KEYS[def.dealSectionId];
    const patch = pickKeys(values, keys);
    return Object.keys(patch).length > 0 ? patch : null;
  }
  if (def.kind === "calculator" && def.calculatorId) {
    const keys = SECTION_KEYS[def.calculatorId];
    const patch = pickKeys(values, keys);
    return Object.keys(patch).length > 0 ? patch : null;
  }
  return pickKeys(values, def.dealDataKeys);
}

async function hydrateConstructionBudgetBlock(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  values: SubmissionValues,
): Promise<void> {
  const header = asRecord(values.header);
  if (Object.keys(header).length > 0) {
    const now = Date.now();
    const projectTypeRaw =
      typeof header.projectType === "string" ? header.projectType.trim() : "";
    const timeframe =
      typeof header.completionTimeframeMonths === "string"
        ? header.completionTimeframeMonths.trim()
        : "";
    const patch = {
      applicantName:
        typeof header.applicantName === "string"
          ? header.applicantName.trim() || undefined
          : undefined,
      propertyAddress:
        typeof header.propertyAddress === "string"
          ? header.propertyAddress.trim() || undefined
          : undefined,
      contractor:
        typeof header.contractor === "string"
          ? header.contractor.trim() || undefined
          : undefined,
      projectType: isConstructionBudgetProjectType(projectTypeRaw)
        ? projectTypeRaw
        : undefined,
      plannedSummary:
        typeof header.plannedSummary === "string"
          ? header.plannedSummary.trim() || undefined
          : undefined,
      qualityOfFinishes:
        typeof header.qualityOfFinishes === "string"
          ? header.qualityOfFinishes.trim() || undefined
          : undefined,
      completionTimeframeMonths:
        timeframe && isValidCompletionTimeframeMonths(timeframe)
          ? timeframe
          : undefined,
      updatedAt: now,
    };
    const existing = await ctx.db
      .query("constructionBudgetSheets")
      .withIndex("by_file", (q) => q.eq("fileId", file._id))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("constructionBudgetSheets", {
        organizationId: file.organizationId,
        fileId: file._id,
        ...patch,
        createdAt: now,
      });
    }
  }

  const lines = values.lines;
  if (Array.isArray(lines) && lines.length > 0) {
    const now = Date.now();
    for (const [index, raw] of lines.entries()) {
      const line = asRecord(raw);
      const templateKey =
        typeof line.templateKey === "string" &&
        CONSTRUCTION_BUDGET_CATALOG_BY_KEY.has(line.templateKey)
          ? line.templateKey
          : undefined;
      const catalog = templateKey
        ? CONSTRUCTION_BUDGET_CATALOG_BY_KEY.get(templateKey)
        : undefined;
      const category =
        catalog?.label ??
        (typeof line.category === "string" ? line.category.trim() : "");
      if (!category) continue;
      const repairReplace =
        typeof line.repairReplace === "string" &&
        isConstructionBudgetRepairReplace(line.repairReplace)
          ? line.repairReplace
          : undefined;
      const unitOfMeasure =
        typeof line.unitOfMeasure === "string" &&
        isConstructionBudgetUnit(line.unitOfMeasure)
          ? line.unitOfMeasure
          : undefined;
      await ctx.db.insert("constructionBudgetLines", {
        organizationId: file.organizationId,
        fileId: file._id,
        category,
        description:
          typeof line.description === "string" ? line.description : undefined,
        budgetAmount:
          typeof line.budgetAmount === "string" ? line.budgetAmount : undefined,
        spentAmount:
          typeof line.spentAmount === "string" ? line.spentAmount : undefined,
        drawNumber:
          typeof line.drawNumber === "string" ? line.drawNumber : undefined,
        templateKey,
        repairReplace,
        quantity:
          typeof line.quantity === "string" ? line.quantity : undefined,
        unitOfMeasure,
        status:
          line.status === "planned" ||
          line.status === "in_progress" ||
          line.status === "complete" ||
          line.status === "on_hold"
            ? line.status
            : "planned",
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      });
    }
    return;
  }

  const notes =
    typeof values.clientPortalNotes === "string"
      ? values.clientPortalNotes.trim()
      : typeof values.notes === "string"
        ? values.notes.trim()
        : "";
  if (!notes) return;

  const now = Date.now();
  await ctx.db.insert("constructionBudgetLines", {
    organizationId: file.organizationId,
    fileId: file._id,
    category: "Client portal submission",
    description: notes,
    status: "planned",
    sortOrder: now,
    createdAt: now,
    updatedAt: now,
  });
}

async function hydrateInvestorExperienceBlock(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  values: SubmissionValues,
): Promise<void> {
  const deal = await resolveDealBaseForPipelinePatch(ctx, file);
  const borrowers: unknown[] = Array.isArray(deal.borrowers)
    ? (deal.borrowers as unknown[])
    : [];
  const primary = asRecord(borrowers[0]);
  const contactIdRaw = primary.contactId;
  if (typeof contactIdRaw !== "string" && typeof contactIdRaw !== "object") {
    const notes =
      typeof values.clientPortalNotes === "string"
        ? values.clientPortalNotes.trim()
        : typeof values.notes === "string"
          ? values.notes.trim()
          : "";
    if (!notes) return;
    await patchPipelineDealData(ctx, file, {
      borrowers: [
        {
          ...primary,
          clientPortalNotes: `Investor experience (pending contact link): ${notes}`,
        },
      ],
    });
    return;
  }

  const contactId = contactIdRaw as Id<"contacts">;
  const contact = await ctx.db.get(contactId);
  if (!contact) return;

  const projects = values.projects;
  const now = Date.now();
  const orgId = file.organizationId ?? contact.organizationId;

  const insertProject = async (
    patch: Record<string, unknown>,
    sortOrder: number,
  ) => {
    await ctx.db.insert("contactInvestorProjects", {
      organizationId: orgId,
      contactId,
      address:
        typeof patch.address === "string" ? patch.address : undefined,
      projectType:
        typeof patch.projectType === "string" ? patch.projectType : undefined,
      role: typeof patch.role === "string" ? patch.role : undefined,
      purchaseAmount:
        typeof patch.purchaseAmount === "string"
          ? patch.purchaseAmount
          : undefined,
      purchaseDate:
        typeof patch.purchaseDate === "string" ? patch.purchaseDate : undefined,
      saleAmount:
        typeof patch.saleAmount === "string" ? patch.saleAmount : undefined,
      saleDate:
        typeof patch.saleDate === "string" ? patch.saleDate : undefined,
      outcome:
        typeof patch.outcome === "string" ? patch.outcome : undefined,
      notes: typeof patch.notes === "string" ? patch.notes : undefined,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    });
  };

  if (Array.isArray(projects) && projects.length > 0) {
    for (const [index, raw] of projects.entries()) {
      const project = asRecord(raw);
      const address =
        typeof project.address === "string"
          ? project.address.trim()
          : typeof project.propertyAddress === "string"
            ? project.propertyAddress.trim()
            : "";
      if (!address) continue;
      await insertProject(
        {
          address,
          projectType: project.projectType ?? project.propertyType,
          role: project.role,
          purchaseAmount: project.purchaseAmount ?? project.purchasePrice,
          purchaseDate: project.purchaseDate,
          saleAmount: project.saleAmount ?? project.salePrice,
          saleDate: project.saleDate,
          outcome: project.outcome ?? project.netProfit,
          notes: project.notes,
        },
        index,
      );
    }
    return;
  }

  const notes =
    typeof values.clientPortalNotes === "string"
      ? values.clientPortalNotes.trim()
      : typeof values.notes === "string"
        ? values.notes.trim()
        : "";
  if (!notes) return;

  await insertProject(
    {
      address: "Client portal submission",
      notes,
    },
    now,
  );
}

async function hydratePfsStatementBlock(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  values: SubmissionValues,
  fileTask?: Doc<"documentVaultFileTasks"> | null,
): Promise<void> {
  const deal = await resolveDealBaseForPipelinePatch(ctx, file);
  const instances = normalizePfsInstances(deal);
  const target =
    (fileTask?.sourceKind === "pfs_instance"
      ? findPfsInstance(instances, fileTask.sourceInstanceId)
      : undefined) ??
    (fileTask
      ? findPfsInstanceByVaultTask(instances, String(fileTask._id))
      : undefined) ??
    (instances.length === 1 ? instances[0] : undefined);
  // Merge structured `values.pfs` into the matching PFS instance (legacy
  // `deal.pfs` when this is the first / only statement).
  if (!target) {
    if (instances.length > 1) return;
    const dealPatch = buildPfsDealPatchFromPortalSubmission(deal.pfs, values);
    if (!dealPatch) return;
    await patchPipelineDealData(ctx, file, dealPatch);
    return;
  }
  const dealPatch = buildPfsDealPatchFromPortalSubmission(target.data, values);
  if (!dealPatch) return;
  const nextInstances = replacePfsInstanceData(
    instances,
    target.id,
    dealPatch.pfs as never,
  );
  const mirrored = pfsDealPatchFromInstances(nextInstances);
  const isPrimary = mirrored.pfsInstances[0]?.id === target.id;
  await patchPipelineDealData(ctx, file, {
    pfsInstances: mirrored.pfsInstances,
    pfs: mirrored.pfs,
    ...(isPrimary && dealPatch.assets !== undefined
      ? { assets: dealPatch.assets }
      : {}),
    ...(isPrimary && dealPatch.liabilities !== undefined
      ? { liabilities: dealPatch.liabilities }
      : {}),
  });
}

async function hydrateSimplePlBlock(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  values: SubmissionValues,
  fileTask?: Doc<"documentVaultFileTasks"> | null,
): Promise<void> {
  const deal = await resolveDealBaseForPipelinePatch(ctx, file);
  const instances = normalizeSimplePlInstances(deal);
  const target =
    (fileTask?.sourceKind === "simple_pl_instance"
      ? findSimplePlInstance(instances, fileTask.sourceInstanceId)
      : undefined) ??
    (fileTask
      ? findSimplePlInstanceByVaultTask(instances, String(fileTask._id))
      : undefined) ??
    (instances.length === 1 ? instances[0] : undefined);
  const incoming =
    values.simplePl != null
      ? normalizeSimplePlStatement(values.simplePl)
      : values.pfs != null
        ? normalizeSimplePlStatement(values.pfs)
        : normalizeSimplePlStatement(values);
  if (!target) {
    await patchPipelineDealData(ctx, file, { simplePl: incoming });
    return;
  }
  const nextInstances = replaceSimplePlInstanceData(instances, target.id, {
    ...incoming,
    notes:
      typeof values.notes === "string"
        ? values.notes
        : incoming.notes ?? target.data.notes,
    clientPortalNotes:
      typeof values.clientPortalNotes === "string"
        ? values.clientPortalNotes
        : incoming.clientPortalNotes ?? target.data.clientPortalNotes,
  });
  const mirrored = simplePlDealPatchFromInstances(nextInstances);
  await patchPipelineDealData(ctx, file, {
    simplePlInstances: mirrored.simplePlInstances,
    simplePl: mirrored.simplePl,
  });
}

/**
 * After snapshotting broker state, merge client form data into only the
 * dealData nodes (or block tables) owned by the assigned atomic block.
 */
export async function hydrateLivePipelineBlockFromClientSubmission(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  blockId: string,
  formData: unknown,
  fileTask?: Doc<"documentVaultFileTasks"> | null,
): Promise<void> {
  const values = normalizeFormValues(formData);
  if (Object.keys(values).length === 0) return;

  const atoms = isAtomicPortalBlockId(blockId)
    ? [blockId]
    : normalizeToAtomicBlockIds(blockId, true);
  if (atoms.length === 0) return;

  for (const atom of atoms) {
    await hydrateSingleAtomicBlock(ctx, file, atom, values, fileTask);
  }
}

async function hydrateSingleAtomicBlock(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  blockId: AtomicPortalBlockId,
  values: SubmissionValues,
  fileTask?: Doc<"documentVaultFileTasks"> | null,
): Promise<void> {
  switch (blockId) {
    case "construction_budget":
      await hydrateConstructionBudgetBlock(ctx, file, values);
      return;
    case "investor_experience":
      await hydrateInvestorExperienceBlock(ctx, file, values);
      return;
    case "file_notes":
      await patchPipelineDealData(ctx, file, {
        clientPortalNotes:
          typeof values.notes === "string"
            ? values.notes
            : typeof values.clientPortalNotes === "string"
              ? values.clientPortalNotes
              : undefined,
      });
      return;
    case "licensing":
      {
        const deal = await resolveDealBaseForPipelinePatch(ctx, file);
        await patchPipelineDealData(ctx, file, {
          licensing: {
            ...asRecord(deal.licensing),
            clientPortalNotes:
              typeof values.notes === "string" ? values.notes : undefined,
          },
        });
      }
      return;
    case "pfs_statement":
      await hydratePfsStatementBlock(ctx, file, values, fileTask);
      return;
    case "simple_pl":
      await hydrateSimplePlBlock(ctx, file, values, fileTask);
      return;
    case "track_record":
      {
        const patch = pickKeys(values, ["trackRecord", "trackRecordMeta"]);
        if (Object.keys(patch).length > 0) {
          await patchPipelineDealData(ctx, file, patch);
        }
      }
      return;
    case "file_details":
    case "contacts":
      {
        const deal = await resolveDealBaseForPipelinePatch(ctx, file);
        const borrowers: unknown[] = Array.isArray(deal.borrowers)
          ? [...(deal.borrowers as unknown[])]
          : [];
        while (borrowers.length < 1) borrowers.push({});
        const prior = asRecord(borrowers[0]);
        const patch = pickKeys(values, [
          "firstName",
          "lastName",
          "email",
          "phone",
          "notes",
          "clientPortalNotes",
          "address",
          "city",
          "state",
          "zip",
        ]);
        if (Object.keys(patch).length > 0) {
          borrowers[0] = { ...prior, ...patch };
          await patchPipelineDealData(ctx, file, { borrowers });
        }
      }
      return;
    default: {
      const dealPatch = buildDealPatchForAtomicBlock(blockId, values);
      if (dealPatch && Object.keys(dealPatch).length > 0) {
        await patchPipelineDealData(ctx, file, dealPatch);
      }
    }
  }
}
