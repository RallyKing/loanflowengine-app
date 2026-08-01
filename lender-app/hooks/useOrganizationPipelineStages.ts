"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { MASTER_PLATFORM_ORGANIZATION_ID } from "@/lib/invariants/masterOrganizationFallback";
import { useConvexOrgQueryReady } from "@/lib/useConvexOrgQueryReady";

export type PipelineStageDisplay = {
  stage: Doc<"organizationPipelineStages">;
  subStages: Doc<"organizationPipelineSubStages">[];
};

export function formatPipelineStageCompactLabel(
  stage: Doc<"organizationPipelineStages"> | null | undefined,
  subStage: Doc<"organizationPipelineSubStages"> | null | undefined,
): string {
  if (!stage) return "Unknown";
  if (!subStage) return stage.name;
  return `${stage.name} › ${subStage.name}`;
}

export function buildPipelineStageIndex(
  bundle: {
    stages: Doc<"organizationPipelineStages">[];
    subStages: Doc<"organizationPipelineSubStages">[];
  } | null | undefined,
) {
  const stageById = new Map<
    Id<"organizationPipelineStages">,
    Doc<"organizationPipelineStages">
  >();
  const subById = new Map<
    Id<"organizationPipelineSubStages">,
    Doc<"organizationPipelineSubStages">
  >();
  const subsByParent = new Map<
    Id<"organizationPipelineStages">,
    Doc<"organizationPipelineSubStages">[]
  >();

  for (const s of bundle?.stages ?? []) {
    stageById.set(s._id, s);
  }
  for (const sub of bundle?.subStages ?? []) {
    subById.set(sub._id, sub);
    const list = subsByParent.get(sub.parentStageId) ?? [];
    list.push(sub);
    subsByParent.set(sub.parentStageId, list);
  }
  for (const [pid, list] of subsByParent) {
    list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    subsByParent.set(pid, list);
  }

  const activeStages = (bundle?.stages ?? [])
    .filter((s) => !s.isArchived)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const tree: PipelineStageDisplay[] = activeStages.map((stage) => ({
    stage,
    subStages: (subsByParent.get(stage._id) ?? []).filter((s) => !s.isArchived),
  }));

  return { stageById, subById, subsByParent, tree, activeStages };
}

export function useOrganizationPipelineStages() {
  const orgQueryReady = useConvexOrgQueryReady();
  const { activeOrganizationId, can } = useOrgPermissions();
  const memberUserKey = useActorUserKey();
  const ensureSeeded = useMutation(api.organizationPipelineStages.ensureSeeded);
  const seedAttempted = useRef<string | null>(null);

  const bundle = useQuery(
    api.organizationPipelineStages.listForOrganization,
    orgQueryReady && memberUserKey.trim()
      ? {
          organizationId: activeOrganizationId ?? MASTER_PLATFORM_ORGANIZATION_ID,
          memberUserKey,
        }
      : "skip",
  );

  useEffect(() => {
    if (!activeOrganizationId) return;
    if (bundle === undefined) return;
    if (bundle.stages.length > 0) return;
    if (seedAttempted.current === activeOrganizationId) return;
    seedAttempted.current = activeOrganizationId;
    void ensureSeeded({ organizationId: activeOrganizationId, memberUserKey });
  }, [activeOrganizationId, bundle, ensureSeeded, memberUserKey]);

  const index = useMemo(() => buildPipelineStageIndex(bundle), [bundle]);

  return {
    bundle,
    loading: bundle === undefined,
    ...index,
    canManageStageArchitecture: can("settings.manage"),
    canAssignStages: can("files.edit"),
  };
}

export function resolveRowStageWeight(
  row: {
    stageId?: Id<"organizationPipelineStages">;
    subStageId?: Id<"organizationPipelineSubStages">;
    status: string;
  },
  index: ReturnType<typeof buildPipelineStageIndex>,
): number {
  const stage = row.stageId ? index.stageById.get(row.stageId) : undefined;
  if (stage) {
    const sub = row.subStageId
      ? index.subById.get(row.subStageId)
      : undefined;
    return stage.order * 1000 + (sub?.order ?? 0);
  }
  const slug = row.status.split("::")[0] ?? row.status;
  const bySlug = index.activeStages.find((s) => s.slug === slug);
  if (bySlug) return bySlug.order * 1000;
  return 50_000;
}

export function rowMatchesStageFilters(
  row: {
    stageId?: Id<"organizationPipelineStages">;
    subStageId?: Id<"organizationPipelineSubStages">;
    status: string;
  },
  stageFilter: Set<string>,
  subStageFilter: Set<string>,
  index: ReturnType<typeof buildPipelineStageIndex>,
): boolean {
  const hasStage = stageFilter.size > 0;
  const hasSub = subStageFilter.size > 0;
  if (!hasStage && !hasSub) return true;

  if (hasSub) {
    const sid = row.subStageId ? String(row.subStageId) : "";
    if (sid && subStageFilter.has(sid)) return true;
    if (hasStage && !hasSub) {
      /* fall through to parent-only */
    } else {
      return false;
    }
  }

  if (hasStage) {
    if (row.stageId && stageFilter.has(String(row.stageId))) return true;
    const slug = row.status.split("::")[0] ?? row.status;
    for (const id of stageFilter) {
      const st = index.stageById.get(id as Id<"organizationPipelineStages">);
      if (st && st.slug === slug) return true;
    }
    return false;
  }
  return true;
}
