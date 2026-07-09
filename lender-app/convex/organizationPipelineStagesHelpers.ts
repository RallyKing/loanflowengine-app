import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { LEGACY_FUNNEL_STAGE_SEEDS, slugifyStageName } from "../lib/pipeline/legacyStageSeed";
import { LEGACY_STATUS_MAP, normalizeStatusKey } from "../lib/pipelineStatus";
import { ensureWritableOrgFeedScope, normalizeActorKey } from "./activityFeed";

export type OrgStageBundle = {
  stages: Doc<"organizationPipelineStages">[];
  subStages: Doc<"organizationPipelineSubStages">[];
};

export async function listOrgStageBundle(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
): Promise<OrgStageBundle> {
  const stages = await ctx.db
    .query("organizationPipelineStages")
    .withIndex("by_organization_order", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  stages.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const subStages = await ctx.db
    .query("organizationPipelineSubStages")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  subStages.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  return { stages, subStages };
}

export async function orgHasPipelineStages(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
): Promise<boolean> {
  const row = await ctx.db
    .query("organizationPipelineStages")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .first();
  return row != null;
}

export async function seedDefaultOrgPipelineStages(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  actorUserKey: string,
): Promise<{ seeded: boolean; stageCount: number }> {
  if (await orgHasPipelineStages(ctx, organizationId)) {
    return { seeded: false, stageCount: 0 };
  }
  const now = Date.now();
  let stageCount = 0;
  for (const seed of LEGACY_FUNNEL_STAGE_SEEDS) {
    await ctx.db.insert("organizationPipelineStages", {
      organizationId,
      name: seed.name,
      slug: seed.slug,
      color: seed.color,
      icon: seed.icon,
      order: seed.order,
      isDefault: seed.isDefault,
      isArchived: false,
      createdBy: actorUserKey,
      updatedBy: actorUserKey,
      createdAt: now,
      updatedAt: now,
    });
    stageCount += 1;
  }
  return { seeded: true, stageCount };
}

export async function appendStageArchitectureActivity(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    kind:
      | "stage_created"
      | "stage_updated"
      | "stage_deleted"
      | "substage_created"
      | "substage_updated"
      | "substage_deleted";
    summary: string;
    actorUserKey: string;
    detail?: string;
  },
) {
  const scope = { kind: "org" as const, id: args.organizationId as string };
  if (!(await ensureWritableOrgFeedScope(ctx, scope))) return;
  await ctx.db.insert("activityFeed", {
    at: Date.now(),
    scopeKind: "org",
    scopeId: scope.id,
    category: "file",
    kind: args.kind,
    summary: args.summary.slice(0, 240),
    ...(args.detail ? { detail: args.detail.slice(0, 2000) } : {}),
    actorKey: normalizeActorKey(args.actorUserKey),
  });
}

export function resolveLegacyStatusToSlug(raw: string): string {
  const key = normalizeStatusKey(raw);
  const mapped = LEGACY_STATUS_MAP[key];
  if (mapped) return mapped;
  if (LEGACY_FUNNEL_STAGE_SEEDS.some((s) => s.slug === key)) return key;
  return key;
}

export async function findStageBySlug(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  slug: string,
): Promise<Doc<"organizationPipelineStages"> | null> {
  const rows = await ctx.db
    .query("organizationPipelineStages")
    .withIndex("by_organization_slug", (q) =>
      q.eq("organizationId", organizationId).eq("slug", slug),
    )
    .collect();
  return rows.find((r) => !r.isArchived) ?? rows[0] ?? null;
}

export async function resolveDefaultStageId(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
): Promise<Id<"organizationPipelineStages"> | null> {
  const rows = await ctx.db
    .query("organizationPipelineStages")
    .withIndex("by_organization_order", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  const active = rows.filter((r) => !r.isArchived);
  const def = active.find((r) => r.isDefault) ?? active[0];
  return def?._id ?? null;
}

export function uniqueStageSlug(base: string, taken: Set<string>): string {
  let slug = slugifyStageName(base);
  if (!taken.has(slug)) return slug;
  let i = 2;
  while (taken.has(`${slug}_${i}`)) i += 1;
  return `${slug}_${i}`;
}

export async function syncPipelineStatusFromStage(
  ctx: MutationCtx,
  stageId: Id<"organizationPipelineStages"> | undefined,
  subStageId: Id<"organizationPipelineSubStages"> | undefined,
): Promise<string | undefined> {
  if (!stageId) return undefined;
  const stage = await ctx.db.get(stageId);
  if (!stage) return undefined;
  if (!subStageId) return stage.slug;
  const sub = await ctx.db.get(subStageId);
  if (!sub) return stage.slug;
  return `${stage.slug}::${sub.slug}`;
}
