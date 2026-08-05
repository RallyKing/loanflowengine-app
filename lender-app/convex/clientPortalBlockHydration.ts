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
    allowed.add("notes");
    allowed.add("clientPortalNotes");
  }
  if (blockId === "investor_experience") {
    allowed.add("projects");
    allowed.add("notes");
    allowed.add("clientPortalNotes");
  }
  if (blockId === "pfs_statement") {
    ["assets", "liabilities", "pfs", "notes", "clientPortalNotes"].forEach((k) =>
      allowed.add(k),
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
): Record<string, unknown> {
  const def = getAtomicPortalBlock(blockId);
  const deal = dealData ?? {};
  const slice: Record<string, unknown> = {};
  for (const key of def.dealDataKeys) {
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
  const lines = values.lines;
  if (Array.isArray(lines) && lines.length > 0) {
    const now = Date.now();
    for (const [index, raw] of lines.entries()) {
      const line = asRecord(raw);
      const category =
        typeof line.category === "string" ? line.category.trim() : "";
      if (!category) continue;
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
): Promise<void> {
  const deal = await resolveDealBaseForPipelinePatch(ctx, file);
  // Merge structured `values.pfs` (header phones, city/state/zip, schedules…)
  // into dealData.pfs. Prior bug ignored `pfs` and nested legacy row arrays
  // under the statement document, so residence/business phone never synced.
  const dealPatch = buildPfsDealPatchFromPortalSubmission(deal.pfs, values);
  if (!dealPatch) return;
  await patchPipelineDealData(ctx, file, dealPatch);
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
): Promise<void> {
  const values = normalizeFormValues(formData);
  if (Object.keys(values).length === 0) return;

  const atoms = isAtomicPortalBlockId(blockId)
    ? [blockId]
    : normalizeToAtomicBlockIds(blockId, true);
  if (atoms.length === 0) return;

  for (const atom of atoms) {
    await hydrateSingleAtomicBlock(ctx, file, atom, values);
  }
}

async function hydrateSingleAtomicBlock(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  blockId: AtomicPortalBlockId,
  values: SubmissionValues,
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
      await hydratePfsStatementBlock(ctx, file, values);
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
