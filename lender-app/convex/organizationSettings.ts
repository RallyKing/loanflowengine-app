import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOrgPermission } from "./organizationRbac";
import { assertOrganizationId } from "./organizationValidators";
import { resolveMemberUserKey } from "./organizationAccess";
import {
  DEFAULT_TASK_COLOR_PRESETS,
  assertExactlyEightTaskColorPresets,
  normalizeTaskColorPresets,
  type TaskColorPreset,
} from "../lib/taskColorPresets";
import {
  DEFAULT_CONTACT_ROLES,
  normalizeContactRoles,
  type ContactRole,
} from "../lib/contact/contactRoles";
import {
  normalizeTaskSnoozeDefaults,
  type TaskSnoozeDefaults,
} from "../lib/taskSnoozePresets";

const orgArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.optional(v.string()),
};

const taskColorPresetValidator = v.object({
  id: v.string(),
  label: v.string(),
  hexCode: v.string(),
});

const contactRoleValidator = v.object({
  id: v.string(),
  displayName: v.string(),
  isSystemDefault: v.boolean(),
});

const taskSnoozeDefaultsValidator = v.object({
  timezone: v.string(),
  nextMorningHour: v.number(),
  nextMorningMinute: v.number(),
});

async function requireOrgReader(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  await assertOrganizationId(ctx, organizationId);
  const key = await resolveMemberUserKey(ctx, memberUserKey);
  if (!key) throw new Error("Not authenticated");
  await assertOrgPermission(ctx, organizationId, key, "files.view");
  return key;
}

async function requireOrgSettingsAdmin(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  const key = await requireOrgReader(ctx, organizationId, memberUserKey);
  await assertOrgPermission(ctx, organizationId, key, "settings.manage");
  return key;
}

export async function readTaskSnoozeDefaultsForOrg(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
): Promise<TaskSnoozeDefaults> {
  const existing = await ctx.db
    .query("organizationSettings")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .first();
  return normalizeTaskSnoozeDefaults(existing?.taskSnoozeDefaults);
}

export async function readTaskColorPresetsForOrg(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
): Promise<TaskColorPreset[]> {
  const existing = await ctx.db
    .query("organizationSettings")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .first();
  return existing?.taskColorPresets ?? DEFAULT_TASK_COLOR_PRESETS;
}

export async function ensureOrganizationSettings(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
): Promise<Doc<"organizationSettings">> {
  const existing = await ctx.db
    .query("organizationSettings")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .unique();
  if (existing) {
    if (!existing.contactRoles?.length) {
      const now = Date.now();
      await ctx.db.patch(existing._id, {
        contactRoles: DEFAULT_CONTACT_ROLES,
        updatedAt: now,
      });
      const patched = await ctx.db.get(existing._id);
      if (patched) return patched;
    }
    return existing;
  }
  const now = Date.now();
  const id = await ctx.db.insert("organizationSettings", {
    organizationId,
    taskColorPresets: DEFAULT_TASK_COLOR_PRESETS,
    contactRoles: DEFAULT_CONTACT_ROLES,
    updatedAt: now,
  });
  const inserted = await ctx.db.get(id);
  if (!inserted) throw new Error("Failed to seed organization settings");
  return inserted;
}

/** Read org task snooze defaults for attempt workflow (Phase 32.2). */
export const getTaskSnoozeDefaults = query({
  args: orgArgs,
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await requireOrgReader(ctx, organizationId, memberUserKey);
    return await readTaskSnoozeDefaultsForOrg(ctx, organizationId);
  },
});

/** Admin-only — update Next Morning preset time/timezone. */
export const updateTaskSnoozeDefaults = mutation({
  args: {
    ...orgArgs,
    taskSnoozeDefaults: taskSnoozeDefaultsValidator,
  },
  handler: async (ctx, { organizationId, memberUserKey, taskSnoozeDefaults }) => {
    const actor = await requireOrgSettingsAdmin(
      ctx,
      organizationId,
      memberUserKey,
    );
    const normalized = normalizeTaskSnoozeDefaults(taskSnoozeDefaults);
    const settings = await ensureOrganizationSettings(ctx, organizationId);
    const now = Date.now();
    await ctx.db.patch(settings._id, {
      taskSnoozeDefaults: normalized,
      updatedAt: now,
      updatedByUserKey: actor,
    });
    return { ok: true as const, taskSnoozeDefaults: normalized };
  },
});

/** Read org task color presets (defaults when not yet persisted). */
export const getTaskColorPresets = query({
  args: orgArgs,
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await requireOrgReader(ctx, organizationId, memberUserKey);
    return await readTaskColorPresetsForOrg(ctx, organizationId);
  },
});

/** Admin-only — update labels and hex codes for the 8 fixed preset ids. */
export const updateTaskColorPresets = mutation({
  args: {
    ...orgArgs,
    taskColorPresets: v.array(taskColorPresetValidator),
  },
  handler: async (ctx, { organizationId, memberUserKey, taskColorPresets }) => {
    const actor = await requireOrgSettingsAdmin(
      ctx,
      organizationId,
      memberUserKey,
    );
    assertExactlyEightTaskColorPresets(taskColorPresets);
    const normalized = normalizeTaskColorPresets(taskColorPresets);
    const settings = await ensureOrganizationSettings(ctx, organizationId);
    const now = Date.now();
    await ctx.db.patch(settings._id, {
      taskColorPresets: normalized,
      updatedAt: now,
      updatedByUserKey: actor,
    });
    return { ok: true as const, taskColorPresets: normalized };
  },
});

export function resolvePresetById(
  presets: TaskColorPreset[],
  colorId: string,
): TaskColorPreset | null {
  return presets.find((preset) => preset.id === colorId) ?? null;
}

export async function readContactRolesForOrg(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
): Promise<ContactRole[]> {
  const existing = await ctx.db
    .query("organizationSettings")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .first();
  return normalizeContactRoles(existing?.contactRoles);
}

/** Read org CRM contact roles (defaults when not yet persisted). */
export const getContactRoles = query({
  args: orgArgs,
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await requireOrgReader(ctx, organizationId, memberUserKey);
    return await readContactRolesForOrg(ctx, organizationId);
  },
});

/** Admin-only — update CRM contact role catalog. System default ids cannot be removed. */
export const updateContactRoles = mutation({
  args: {
    ...orgArgs,
    contactRoles: v.array(contactRoleValidator),
  },
  handler: async (ctx, { organizationId, memberUserKey, contactRoles }) => {
    const actor = await requireOrgSettingsAdmin(
      ctx,
      organizationId,
      memberUserKey,
    );
    const normalized = normalizeContactRoles(contactRoles);
    const settings = await ensureOrganizationSettings(ctx, organizationId);
    const now = Date.now();
    await ctx.db.patch(settings._id, {
      contactRoles: normalized,
      updatedAt: now,
      updatedByUserKey: actor,
    });
    return { ok: true as const, contactRoles: normalized };
  },
});
