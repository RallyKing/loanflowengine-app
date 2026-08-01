import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOrgPermission } from "./organizationRbac";
import { assertOrganizationId } from "./organizationValidators";
import {
  isSuperAdmin,
  requireOrgReaderKey,
} from "./authUtils";
import { readTaskColorPresetsForOrg } from "./organizationSettings";
import { isTaskColorPresetId } from "../lib/taskColorPresets";
import { normalizeTriageLabelHex } from "../lib/triageLabelColor";

const orgArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.optional(v.string()),
};

async function requireOrgReader(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  await assertOrganizationId(ctx, organizationId);
  return requireOrgReaderKey(
    ctx,
    organizationId,
    memberUserKey,
    "organizationTriageLabels.requireOrgReader",
  );
}

/** Settings admins or file editors may manage triage labels inline (Phase 24.2B). */
async function requireOrgTriageLabelEditor(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  if (await isSuperAdmin(ctx, memberUserKey)) {
    return requireOrgReader(ctx, organizationId, memberUserKey);
  }
  const key = await requireOrgReader(ctx, organizationId, memberUserKey);
  try {
    await assertOrgPermission(ctx, organizationId, key, "settings.manage");
    return key;
  } catch {
    await assertOrgPermission(ctx, organizationId, key, "files.edit");
    return key;
  }
}

async function assertValidLabelColor(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  colorId: string,
): Promise<void> {
  const trimmed = colorId.trim();
  if (!trimmed) throw new Error("colorId is required");
  const presets = await readTaskColorPresetsForOrg(ctx, organizationId);
  const allowed = new Set(presets.map((preset) => preset.id));
  if (!allowed.has(trimmed) || !isTaskColorPresetId(trimmed)) {
    throw new Error("colorId must be one of the 8 organization color presets");
  }
}

async function resolveLabelColorFields(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  args: {
    colorId?: string;
    customHexCode?: string;
  },
): Promise<{ colorId: string; customHexCode?: string }> {
  const presets = await readTaskColorPresetsForOrg(ctx, organizationId);
  const fallbackId = presets[0]?.id ?? "triage-urgent-red";
  const custom = normalizeTriageLabelHex(args.customHexCode);
  if (custom) {
    const colorId = args.colorId?.trim() ?? fallbackId;
    await assertValidLabelColor(ctx, organizationId, colorId);
    return { colorId, customHexCode: custom };
  }
  const colorId = args.colorId?.trim();
  if (!colorId) throw new Error("colorId or customHexCode is required");
  await assertValidLabelColor(ctx, organizationId, colorId);
  return { colorId };
}

function sortTriageLabelRows(
  rows: Doc<"organizationTriageLabels">[],
): Doc<"organizationTriageLabels">[] {
  return [...rows].sort((a, b) => {
    const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.label.localeCompare(b.label);
  });
}

function activeTriageLabelRows(
  rows: Doc<"organizationTriageLabels">[],
): Doc<"organizationTriageLabels">[] {
  return sortTriageLabelRows(rows.filter((row) => row.archivedAt == null));
}

async function nextSortOrder(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
): Promise<number> {
  const rows = await ctx.db
    .query("organizationTriageLabels")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  let max = 0;
  for (const row of rows) {
    if (row.sortOrder != null && row.sortOrder > max) max = row.sortOrder;
  }
  return max + 10;
}

/** Org triage labels for composer dropdown and highlight resolution. */
export const listTriageLabels = query({
  args: {
    ...orgArgs,
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, { organizationId, memberUserKey, includeArchived }) => {
    await requireOrgReader(ctx, organizationId, memberUserKey);
    const rows = await ctx.db
      .query("organizationTriageLabels")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
    if (includeArchived) return sortTriageLabelRows(rows);
    return activeTriageLabelRows(rows);
  },
});

/** Create or update a triage label (settings or inline file workspace). */
export const upsertTriageLabel = mutation({
  args: {
    ...orgArgs,
    labelId: v.optional(v.id("organizationTriageLabels")),
    label: v.string(),
    colorId: v.optional(v.string()),
    customHexCode: v.optional(v.string()),
    severityWeight: v.optional(v.number()),
  },
  handler: async (
    ctx,
    {
      organizationId,
      memberUserKey,
      labelId,
      label,
      colorId,
      customHexCode,
      severityWeight,
    },
  ) => {
    const actor = await requireOrgTriageLabelEditor(
      ctx,
      organizationId,
      memberUserKey,
    );
    const trimmedLabel = label.trim();
    if (!trimmedLabel) throw new Error("Label is required");
    const colorFields = await resolveLabelColorFields(ctx, organizationId, {
      colorId,
      customHexCode,
    });

    const weight =
      severityWeight != null && Number.isFinite(severityWeight) && severityWeight > 0
        ? Math.round(severityWeight)
        : undefined;

    const now = Date.now();
    if (labelId) {
      const existing = await ctx.db.get(labelId);
      if (!existing || existing.organizationId !== organizationId) {
        throw new Error("Triage label not found for this organization");
      }
      await ctx.db.patch(labelId, {
        label: trimmedLabel,
        colorId: colorFields.colorId,
        ...(colorFields.customHexCode
          ? { customHexCode: colorFields.customHexCode }
          : { customHexCode: undefined }),
        ...(weight != null ? { severityWeight: weight } : {}),
        archivedAt: undefined,
        updatedAt: now,
        updatedByUserKey: actor,
      });
      return { id: labelId };
    }

    const id = await ctx.db.insert("organizationTriageLabels", {
      organizationId,
      label: trimmedLabel,
      colorId: colorFields.colorId,
      ...(colorFields.customHexCode
        ? { customHexCode: colorFields.customHexCode }
        : {}),
      ...(weight != null ? { severityWeight: weight } : {}),
      sortOrder: await nextSortOrder(ctx, organizationId),
      updatedAt: now,
      updatedByUserKey: actor,
    });
    return { id };
  },
});

/** Soft-archive a label — existing task assignments remain until cleared. */
export const archiveTriageLabel = mutation({
  args: {
    ...orgArgs,
    labelId: v.id("organizationTriageLabels"),
  },
  handler: async (ctx, { organizationId, memberUserKey, labelId }) => {
    const actor = await requireOrgTriageLabelEditor(
      ctx,
      organizationId,
      memberUserKey,
    );
    const existing = await ctx.db.get(labelId);
    if (!existing || existing.organizationId !== organizationId) {
      throw new Error("Triage label not found for this organization");
    }
    const now = Date.now();
    await ctx.db.patch(labelId, {
      archivedAt: now,
      updatedAt: now,
      updatedByUserKey: actor,
    });
    return { ok: true as const };
  },
});

/** Persist composer / manager label order. */
export const reorderTriageLabels = mutation({
  args: {
    ...orgArgs,
    orderedLabelIds: v.array(v.id("organizationTriageLabels")),
  },
  handler: async (ctx, { organizationId, memberUserKey, orderedLabelIds }) => {
    const actor = await requireOrgTriageLabelEditor(
      ctx,
      organizationId,
      memberUserKey,
    );
    const now = Date.now();
    let order = 0;
    for (const labelId of orderedLabelIds) {
      const row = await ctx.db.get(labelId);
      if (!row || row.organizationId !== organizationId) continue;
      order += 10;
      await ctx.db.patch(labelId, {
        sortOrder: order,
        updatedAt: now,
        updatedByUserKey: actor,
      });
    }
    return { ok: true as const };
  },
});

export async function loadTriageLabelsForOrg(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
): Promise<Map<string, Doc<"organizationTriageLabels">>> {
  const rows = await ctx.db
    .query("organizationTriageLabels")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  return new Map(
    activeTriageLabelRows(rows).map((row) => [String(row._id), row]),
  );
}
