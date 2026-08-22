/**
 * Multi-timeframe Simple P&L helpers.
 * Each pipeline file can hold many first-class P&L documents (YTD, past years,
 * named periods). Legacy `dealData.simplePl` mirrors the first instance.
 */
import {
  applyScheduleCopyPlan,
  planScheduleCopy,
  type ScheduleCopyMode,
  type ScheduleCopyPlan,
} from "@/lib/schedule/copyToFile";
import {
  newScheduleRowId,
  normalizeContactIdList,
} from "@/lib/schedule/contactIds";
import {
  SIMPLE_PL_PERIOD_KIND_LABELS,
  computeSimplePl,
  createEmptySimplePlStatement,
  isSimplePlPeriodKind,
  normalizeSimplePlStatement,
  simplePlHasContent,
  type SimplePlPeriodKind,
  type SimplePlStatement,
} from "./simplePlModel";

export const SIMPLE_PL_INSTANCE_VERSION = 1 as const;

export type SimplePlInstance = {
  id: string;
  name: string;
  periodKind?: SimplePlPeriodKind;
  assignedContactIds?: string[];
  vaultFileTaskId?: string;
  data: SimplePlStatement;
};

export type SimplePlCopyMode = ScheduleCopyMode;
export type SimplePlCopyPlan = ScheduleCopyPlan<SimplePlInstance>;

export function newSimplePlInstanceId(): string {
  return newScheduleRowId("spl");
}

export function defaultSimplePlInstanceName(
  index: number,
  periodKind?: SimplePlPeriodKind,
): string {
  if (periodKind === "year_to_date") return "Year-to-date";
  if (periodKind === "prior_year") return index <= 1 ? "Past year" : `Past year ${index}`;
  if (periodKind === "custom") return index <= 0 ? "Named period" : `Named period ${index + 1}`;
  if (index <= 0) return "Year-to-date";
  if (index === 1) return "Past year";
  return `P&L ${index + 1}`;
}

export function simplePlInstanceDisplayName(instance: SimplePlInstance): string {
  const named = instance.name?.trim();
  if (named) return named;
  const company = instance.data.header.companyName?.trim();
  const ended = instance.data.header.periodEnded?.trim();
  if (company && ended) return `${company} · ${ended}`;
  if (ended) return ended;
  if (company) return company;
  const kind = instance.periodKind ?? instance.data.periodKind;
  if (kind) return SIMPLE_PL_PERIOD_KIND_LABELS[kind];
  return "Untitled P&L";
}

export function simplePlInstanceIsFilled(instance: SimplePlInstance): boolean {
  return simplePlHasContent(instance.data);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

export function normalizeSimplePlInstance(
  raw: unknown,
  fallbackIndex = 0,
): SimplePlInstance | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const id =
    typeof rec.id === "string" && rec.id.trim()
      ? rec.id.trim()
      : newSimplePlInstanceId();
  const dataRaw = rec.data ?? rec.simplePl ?? rec;
  const data = normalizeSimplePlStatement(dataRaw);
  const periodKind = isSimplePlPeriodKind(rec.periodKind)
    ? rec.periodKind
    : data.periodKind;
  const name =
    typeof rec.name === "string" && rec.name.trim()
      ? rec.name.trim()
      : defaultSimplePlInstanceName(fallbackIndex, periodKind);
  const assignedContactIds = normalizeContactIdList(rec.assignedContactIds);
  const vaultFileTaskId =
    typeof rec.vaultFileTaskId === "string" && rec.vaultFileTaskId.trim()
      ? rec.vaultFileTaskId.trim()
      : undefined;
  return {
    id,
    name,
    ...(periodKind ? { periodKind } : {}),
    ...(assignedContactIds.length > 0 ? { assignedContactIds } : {}),
    ...(vaultFileTaskId ? { vaultFileTaskId } : {}),
    data: { ...data, periodKind: periodKind ?? data.periodKind },
  };
}

/**
 * Read Simple P&L instances from deal / intake. Seeds a single YTD instance
 * from legacy `simplePl` when `simplePlInstances` is missing.
 */
export function normalizeSimplePlInstances(deal: unknown): SimplePlInstance[] {
  const rec = asRecord(deal);
  const rawList = rec?.simplePlInstances;
  if (Array.isArray(rawList) && rawList.length > 0) {
    const out: SimplePlInstance[] = [];
    const seen = new Set<string>();
    rawList.forEach((raw, index) => {
      const inst = normalizeSimplePlInstance(raw, index);
      if (!inst) return;
      let id = inst.id;
      if (seen.has(id)) id = newSimplePlInstanceId();
      seen.add(id);
      out.push({ ...inst, id });
    });
    if (out.length > 0) return out;
  }
  const legacy = rec?.simplePl;
  if (legacy != null) {
    const seeded = normalizeSimplePlStatement(legacy);
    return [
      {
        id: "legacy",
        name:
          seeded.header.periodEnded?.trim() ||
          defaultSimplePlInstanceName(0, seeded.periodKind),
        periodKind: seeded.periodKind,
        data: seeded,
      },
    ];
  }
  return [createEmptySimplePlInstance()];
}

export function createEmptySimplePlInstance(input?: {
  name?: string;
  periodKind?: SimplePlPeriodKind;
  assignedContactIds?: readonly string[];
}): SimplePlInstance {
  const periodKind = input?.periodKind ?? "year_to_date";
  const assignedContactIds = normalizeContactIdList(input?.assignedContactIds);
  return {
    id: newSimplePlInstanceId(),
    name: input?.name?.trim() || defaultSimplePlInstanceName(0, periodKind),
    periodKind,
    ...(assignedContactIds.length > 0 ? { assignedContactIds } : {}),
    data: createEmptySimplePlStatement({ periodKind }),
  };
}

export function cloneSimplePlInstanceForCopy(
  instance: SimplePlInstance,
): SimplePlInstance {
  const assignedContactIds = normalizeContactIdList(instance.assignedContactIds);
  return {
    id: newSimplePlInstanceId(),
    name: simplePlInstanceDisplayName(instance),
    periodKind: instance.periodKind ?? instance.data.periodKind,
    ...(assignedContactIds.length > 0 ? { assignedContactIds } : {}),
    data: normalizeSimplePlStatement(
      JSON.parse(JSON.stringify(instance.data)) as unknown,
    ),
  };
}

export function simplePlInstanceHasIdentity(instance: SimplePlInstance): boolean {
  return Boolean(instance.id?.trim());
}

export function upsertSimplePlInstance(
  instances: readonly SimplePlInstance[],
  next: SimplePlInstance,
): SimplePlInstance[] {
  const list = instances.map((inst) =>
    inst.id === next.id
      ? {
          ...next,
          assignedContactIds: normalizeContactIdList(next.assignedContactIds),
          data: normalizeSimplePlStatement(next.data),
        }
      : inst,
  );
  if (list.some((inst) => inst.id === next.id)) return list;
  return [
    ...list,
    {
      ...next,
      assignedContactIds: normalizeContactIdList(next.assignedContactIds),
      data: normalizeSimplePlStatement(next.data),
    },
  ];
}

export function removeSimplePlInstance(
  instances: readonly SimplePlInstance[],
  instanceId: string,
): SimplePlInstance[] {
  const next = instances.filter((inst) => inst.id !== instanceId);
  return next.length > 0 ? next : [createEmptySimplePlInstance()];
}

export function findSimplePlInstance(
  instances: readonly SimplePlInstance[],
  instanceId: string | null | undefined,
): SimplePlInstance | undefined {
  const id = instanceId?.trim();
  if (!id) return undefined;
  return instances.find((inst) => inst.id === id);
}

export function findSimplePlInstanceByVaultTask(
  instances: readonly SimplePlInstance[],
  fileTaskId: string | null | undefined,
): SimplePlInstance | undefined {
  const id = fileTaskId?.trim();
  if (!id) return undefined;
  return instances.find((inst) => inst.vaultFileTaskId === id);
}

export function primarySimplePlFromInstances(
  instances: readonly SimplePlInstance[],
): SimplePlStatement {
  return instances[0]?.data ?? createEmptySimplePlStatement();
}

export function simplePlDealPatchFromInstances(
  instances: readonly SimplePlInstance[],
): {
  simplePlInstances: SimplePlInstance[];
  simplePl: SimplePlStatement;
} {
  const normalized = instances.map((inst, index) => {
    const assignedContactIds = normalizeContactIdList(inst.assignedContactIds);
    const periodKind = inst.periodKind ?? inst.data.periodKind ?? "year_to_date";
    return {
      id: inst.id?.trim() || newSimplePlInstanceId(),
      name: inst.name?.trim() || defaultSimplePlInstanceName(index, periodKind),
      periodKind,
      ...(assignedContactIds.length > 0 ? { assignedContactIds } : {}),
      ...(inst.vaultFileTaskId?.trim()
        ? { vaultFileTaskId: inst.vaultFileTaskId.trim() }
        : {}),
      data: normalizeSimplePlStatement({
        ...inst.data,
        periodKind,
      }),
    };
  });
  return {
    simplePlInstances: normalized,
    simplePl: primarySimplePlFromInstances(normalized),
  };
}

export function planSimplePlCopy(input: {
  mode: SimplePlCopyMode;
  sourceInstances: readonly SimplePlInstance[] | undefined | null;
  instanceIndexes?: readonly number[];
}): SimplePlCopyPlan {
  return planScheduleCopy({
    mode: input.mode,
    sourceRows: input.sourceInstances,
    sourceMeta: { assignedContactIds: [] },
    rowIndexes: input.instanceIndexes,
    cloneRow: cloneSimplePlInstanceForCopy,
  });
}

export function applySimplePlCopyPlan(input: {
  targetInstances: readonly SimplePlInstance[] | undefined | null;
  plan: SimplePlCopyPlan;
}): SimplePlInstance[] {
  return applyScheduleCopyPlan({
    targetRows: input.targetInstances,
    targetMeta: { assignedContactIds: [] },
    plan: input.plan,
    rowHasIdentity: simplePlInstanceHasIdentity,
  }).rows;
}

export function replaceSimplePlInstanceData(
  instances: readonly SimplePlInstance[],
  instanceId: string,
  data: SimplePlStatement,
  extras?: Partial<
    Pick<SimplePlInstance, "name" | "assignedContactIds" | "vaultFileTaskId" | "periodKind">
  >,
): SimplePlInstance[] {
  const current =
    findSimplePlInstance(instances, instanceId) ??
    createEmptySimplePlInstance({ name: extras?.name, periodKind: extras?.periodKind });
  return upsertSimplePlInstance(instances, {
    ...current,
    id: instanceId,
    data,
    ...(extras?.name !== undefined ? { name: extras.name } : {}),
    ...(extras?.periodKind !== undefined ? { periodKind: extras.periodKind } : {}),
    ...(extras?.assignedContactIds !== undefined
      ? { assignedContactIds: [...extras.assignedContactIds] }
      : {}),
    ...(extras?.vaultFileTaskId !== undefined
      ? { vaultFileTaskId: extras.vaultFileTaskId }
      : {}),
  });
}

export function simplePlInstanceNetProfit(instance: SimplePlInstance): number {
  return computeSimplePl(instance.data).netProfitLoss;
}
