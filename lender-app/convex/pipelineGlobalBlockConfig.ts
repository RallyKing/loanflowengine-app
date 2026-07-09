import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizePipelineDrawerLayout,
  type PipelineDrawerLayoutV1,
} from "../lib/pipelineDrawerLayoutStorage";
import type { PipelineBlockId } from "../lib/pipelineBlockRegistry";
import {
  finalizeFileDrawerLayoutForPersist,
  getPipelineGlobalBlockConfigRow,
  layoutToDbFields,
  resolvedConfigFromRow,
  writePipelineGlobalBlockConfig,
} from "./pipelineGlobalBlockConfigHelpers";
import {
  assertGlobalTemplateSyncAllowedForOrg,
  assertOrgScopedGlobalBlockConfigAllowed,
} from "./organizationPlan";
import { assertOrgPermission } from "./organizationRbac";

const drawerLayoutInput = v.object({
  v: v.literal(1),
  order: v.array(v.string()),
  hidden: v.array(v.string()),
  expanded: v.optional(v.record(v.string(), v.boolean())),
  settings: v.optional(v.record(v.string(), v.any())),
});

function drawerExpandedForDb(
  expanded: Partial<Record<PipelineBlockId, boolean>> | Record<string, boolean> | undefined
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!expanded || typeof expanded !== "object") return out;
  for (const [k, v0] of Object.entries(expanded)) {
    if (typeof v0 === "boolean") out[k] = v0;
  }
  return out;
}

/** Resolved global block policy + defaults (singleton row optional). */
export const getResolved = query({
  args: {},
  handler: async (ctx) => {
    const row = await getPipelineGlobalBlockConfigRow(ctx);
    return {
      ...resolvedConfigFromRow(row),
      hasPersistedRow: row != null,
    };
  },
});

export const patch = mutation({
  args: {
    disabledBlockIds: v.array(v.string()),
    adminRequiredBlockIds: v.array(v.string()),
    newFileDrawerLayout: drawerLayoutInput,
    /** When set with `actorUserKey`, requires `blocks.manage` in that org. */
    rbacOrganizationId: v.optional(v.id("organizations")),
    actorUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.rbacOrganizationId) {
      await assertOrgPermission(
        ctx,
        args.rbacOrganizationId,
        args.actorUserKey,
        "blocks.manage",
      );
    }
    const layout = normalizePipelineDrawerLayout(args.newFileDrawerLayout);
    if (args.rbacOrganizationId) {
      await assertOrgScopedGlobalBlockConfigAllowed(
        ctx,
        args.rbacOrganizationId,
        layout,
        args.adminRequiredBlockIds,
      );
    }
    await writePipelineGlobalBlockConfig(ctx, {
      disabledBlockIds: args.disabledBlockIds,
      adminRequiredBlockIds: args.adminRequiredBlockIds,
      newFileDrawerLayout: layout,
    });
    return { ok: true as const };
  },
});

/**
 * Overwrites every pipeline file’s `fileDrawerLayout` with the current global
 * “new file” template. Optionally keeps prior expanded/collapsed choices per
 * section when the block id still exists in the template order.
 */
export const syncNewFileDrawerLayoutToAllPipelineFiles = mutation({
  args: {
    preservePerFileExpanded: v.optional(v.boolean()),
    rbacOrganizationId: v.optional(v.id("organizations")),
    actorUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { preservePerFileExpanded, rbacOrganizationId, actorUserKey }) => {
    if (rbacOrganizationId) {
      await assertOrgPermission(
        ctx,
        rbacOrganizationId,
        actorUserKey,
        "blocks.manage",
      );
    }
    const row = await getPipelineGlobalBlockConfigRow(ctx);
    const template = resolvedConfigFromRow(row).newFileDrawerLayout;
    if (rbacOrganizationId) {
      await assertGlobalTemplateSyncAllowedForOrg(
        ctx,
        rbacOrganizationId,
        template,
      );
    }
    let rows = await ctx.db.query("pipeline").collect();
    if (rbacOrganizationId) {
      rows = rows.filter((p) => p.organizationId === rbacOrganizationId);
    }
    const now = Date.now();
    let updated = 0;
    for (const p of rows) {
      let expanded = drawerExpandedForDb(template.expanded);
      if (preservePerFileExpanded && p.fileDrawerLayout?.expanded) {
        const next = { ...expanded };
        const allowed = new Set<string>(template.order);
        for (const [k, v0] of Object.entries(p.fileDrawerLayout.expanded)) {
          if (typeof v0 === "boolean" && allowed.has(k)) {
            next[k] = v0;
          }
        }
        expanded = next;
      }
      const curNorm = p.fileDrawerLayout
        ? normalizePipelineDrawerLayout(p.fileDrawerLayout)
        : null;
      const mergedLayout: PipelineDrawerLayoutV1 = normalizePipelineDrawerLayout({
        v: 1,
        order: template.order,
        hidden: template.hidden,
        expanded,
        settings: {
          ...(template.settings ?? {}),
          ...(curNorm?.settings ?? {}),
        },
      });
      await ctx.db.patch(p._id, {
        fileDrawerLayout: {
          v: 1,
          ...layoutToDbFields(mergedLayout),
        },
        updatedAt: now,
      });
      updated++;
    }
    return { updated };
  },
});

/** Re-applies global disabled / mandatory rules to every file without changing order/hidden intent beyond policy. */
export const reapplyGlobalPolicyToAllFileDrawerLayouts = mutation({
  args: {
    rbacOrganizationId: v.optional(v.id("organizations")),
    actorUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { rbacOrganizationId, actorUserKey }) => {
    if (rbacOrganizationId) {
      await assertOrgPermission(
        ctx,
        rbacOrganizationId,
        actorUserKey,
        "blocks.manage",
      );
    }
    let rows = await ctx.db.query("pipeline").collect();
    if (rbacOrganizationId) {
      rows = rows.filter((p) => p.organizationId === rbacOrganizationId);
    }
    const now = Date.now();
    let updated = 0;
    for (const p of rows) {
      const cur = p.fileDrawerLayout
        ? normalizePipelineDrawerLayout(p.fileDrawerLayout)
        : normalizePipelineDrawerLayout({ v: 1, order: [], hidden: [], expanded: {} });
      const next = await finalizeFileDrawerLayoutForPersist(ctx, cur);
      await ctx.db.patch(p._id, {
        fileDrawerLayout: {
          v: 1,
          ...layoutToDbFields(next),
        },
        updatedAt: now,
      });
      updated++;
    }
    return { updated };
  },
});
