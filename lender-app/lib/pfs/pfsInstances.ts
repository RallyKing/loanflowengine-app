/**
 * Multi-instance Personal Financial Statement helpers.
 * Each pipeline file can hold many first-class PFS documents (one per borrower).
 * Legacy `dealData.pfs` mirrors the first instance for older readers.
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
  computePersonalFinancialStatement,
  createEmptyPersonalFinancialStatement,
  normalizePersonalFinancialStatement,
  type PersonalFinancialStatement,
} from "./personalFinancialStatementModel";

export const PFS_INSTANCE_VERSION = 1 as const;

export type PfsInstance = {
  id: string;
  name: string;
  assignedContactIds?: string[];
  vaultFileTaskId?: string;
  /** Forms & Applications `intakeForms` row titled for this PFS. */
  intakeFormId?: string;
  data: PersonalFinancialStatement;
};

export type PfsCopyMode = ScheduleCopyMode;
export type PfsCopyPlan = ScheduleCopyPlan<PfsInstance>;

export function newPfsInstanceId(): string {
  return newScheduleRowId("pfs");
}

export function defaultPfsInstanceName(index: number): string {
  return index <= 0 ? "PFS 1" : `PFS ${index + 1}`;
}

export function pfsInstanceDisplayName(
  instance: Pick<PfsInstance, "name" | "data">,
): string {
  const named = instance.name?.trim();
  if (named) return named;
  const headerNames = instance.data.header.names?.trim();
  if (headerNames) return headerNames;
  return "Untitled PFS";
}

export function pfsInstanceIsFilled(instance: PfsInstance): boolean {
  const computed = computePersonalFinancialStatement(instance.data);
  return (
    computed.totalAssets > 0 ||
    computed.totalLiabilities > 0 ||
    Boolean(instance.data.header.names?.trim()) ||
    Boolean(instance.name?.trim() && instance.name.trim() !== "PFS 1")
  );
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

export function normalizePfsInstance(
  raw: unknown,
  fallbackIndex = 0,
): PfsInstance | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const id =
    typeof rec.id === "string" && rec.id.trim()
      ? rec.id.trim()
      : newPfsInstanceId();
  const dataRaw = rec.data ?? rec.pfs ?? rec;
  const data = normalizePersonalFinancialStatement(dataRaw);
  const name =
    typeof rec.name === "string" && rec.name.trim()
      ? rec.name.trim()
      : data.header.names?.trim() || defaultPfsInstanceName(fallbackIndex);
  const assignedContactIds = normalizeContactIdList(rec.assignedContactIds);
  const vaultFileTaskId =
    typeof rec.vaultFileTaskId === "string" && rec.vaultFileTaskId.trim()
      ? rec.vaultFileTaskId.trim()
      : undefined;
  const intakeFormId =
    typeof rec.intakeFormId === "string" && rec.intakeFormId.trim()
      ? rec.intakeFormId.trim()
      : undefined;
  return {
    id,
    name,
    ...(assignedContactIds.length > 0 ? { assignedContactIds } : {}),
    ...(vaultFileTaskId ? { vaultFileTaskId } : {}),
    ...(intakeFormId ? { intakeFormId } : {}),
    data,
  };
}

/**
 * Read PFS instances from deal / intake. Seeds a single instance from legacy
 * `pfs` when `pfsInstances` is missing.
 */
export function normalizePfsInstances(deal: unknown): PfsInstance[] {
  const rec = asRecord(deal);
  const rawList = rec?.pfsInstances;
  if (Array.isArray(rawList) && rawList.length > 0) {
    const out: PfsInstance[] = [];
    const seen = new Set<string>();
    rawList.forEach((raw, index) => {
      const inst = normalizePfsInstance(raw, index);
      if (!inst) return;
      let id = inst.id;
      if (seen.has(id)) id = newPfsInstanceId();
      seen.add(id);
      out.push({ ...inst, id });
    });
    if (out.length > 0) return out;
  }
  const legacy = rec?.pfs;
  const seeded = normalizePersonalFinancialStatement(legacy);
  return [
    {
      id: "legacy",
      name: seeded.header.names?.trim() || defaultPfsInstanceName(0),
      data: seeded,
    },
  ];
}

export function createEmptyPfsInstance(input?: {
  name?: string;
  assignedContactIds?: readonly string[];
}): PfsInstance {
  const assignedContactIds = normalizeContactIdList(input?.assignedContactIds);
  return {
    id: newPfsInstanceId(),
    name: input?.name?.trim() || defaultPfsInstanceName(0),
    ...(assignedContactIds.length > 0 ? { assignedContactIds } : {}),
    data: createEmptyPersonalFinancialStatement(),
  };
}

export function clonePfsInstanceForCopy(instance: PfsInstance): PfsInstance {
  const assignedContactIds = normalizeContactIdList(instance.assignedContactIds);
  return {
    id: newPfsInstanceId(),
    name: pfsInstanceDisplayName(instance),
    ...(assignedContactIds.length > 0 ? { assignedContactIds } : {}),
    data: normalizePersonalFinancialStatement(
      JSON.parse(JSON.stringify(instance.data)) as unknown,
    ),
  };
}

export function pfsInstanceHasIdentity(instance: PfsInstance): boolean {
  return Boolean(instance.id?.trim());
}

export function upsertPfsInstance(
  instances: readonly PfsInstance[],
  next: PfsInstance,
): PfsInstance[] {
  const list = instances.map((inst) =>
    inst.id === next.id
      ? {
          ...next,
          assignedContactIds: normalizeContactIdList(next.assignedContactIds),
          data: normalizePersonalFinancialStatement(next.data),
        }
      : inst,
  );
  if (list.some((inst) => inst.id === next.id)) return list;
  return [
    ...list,
    {
      ...next,
      assignedContactIds: normalizeContactIdList(next.assignedContactIds),
      data: normalizePersonalFinancialStatement(next.data),
    },
  ];
}

export function removePfsInstance(
  instances: readonly PfsInstance[],
  instanceId: string,
): PfsInstance[] {
  const next = instances.filter((inst) => inst.id !== instanceId);
  return next.length > 0 ? next : [createEmptyPfsInstance()];
}

export function findPfsInstance(
  instances: readonly PfsInstance[],
  instanceId: string | null | undefined,
): PfsInstance | undefined {
  const id = instanceId?.trim();
  if (!id) return undefined;
  return instances.find((inst) => inst.id === id);
}

export function findPfsInstanceByVaultTask(
  instances: readonly PfsInstance[],
  fileTaskId: string | null | undefined,
): PfsInstance | undefined {
  const id = fileTaskId?.trim();
  if (!id) return undefined;
  return instances.find((inst) => inst.vaultFileTaskId === id);
}

/** Legacy `dealData.pfs` mirror — first instance (or empty statement). */
export function primaryPfsFromInstances(
  instances: readonly PfsInstance[],
): PersonalFinancialStatement {
  return (
    instances[0]?.data ?? createEmptyPersonalFinancialStatement()
  );
}

export function pfsDealPatchFromInstances(instances: readonly PfsInstance[]): {
  pfsInstances: PfsInstance[];
  pfs: PersonalFinancialStatement;
} {
  const normalized = instances.map((inst, index) => {
    const assignedContactIds = normalizeContactIdList(inst.assignedContactIds);
    return {
      id: inst.id?.trim() || newPfsInstanceId(),
      name: inst.name?.trim() || defaultPfsInstanceName(index),
      ...(assignedContactIds.length > 0 ? { assignedContactIds } : {}),
      ...(inst.vaultFileTaskId?.trim()
        ? { vaultFileTaskId: inst.vaultFileTaskId.trim() }
        : {}),
      ...(inst.intakeFormId?.trim()
        ? { intakeFormId: inst.intakeFormId.trim() }
        : {}),
      data: normalizePersonalFinancialStatement(inst.data),
    };
  });
  return {
    pfsInstances: normalized,
    pfs: primaryPfsFromInstances(normalized),
  };
}

export function planPfsCopy(input: {
  mode: PfsCopyMode;
  sourceInstances: readonly PfsInstance[] | undefined | null;
  instanceIndexes?: readonly number[];
}): PfsCopyPlan {
  return planScheduleCopy({
    mode: input.mode,
    sourceRows: input.sourceInstances,
    sourceMeta: { assignedContactIds: [] },
    rowIndexes: input.instanceIndexes,
    cloneRow: clonePfsInstanceForCopy,
  });
}

export function applyPfsCopyPlan(input: {
  targetInstances: readonly PfsInstance[] | undefined | null;
  plan: PfsCopyPlan;
}): PfsInstance[] {
  return applyScheduleCopyPlan({
    targetRows: input.targetInstances,
    targetMeta: { assignedContactIds: [] },
    plan: input.plan,
    rowHasIdentity: pfsInstanceHasIdentity,
  }).rows;
}

export function replacePfsInstanceData(
  instances: readonly PfsInstance[],
  instanceId: string,
  data: PersonalFinancialStatement,
  extras?: Partial<
    Pick<PfsInstance, "name" | "assignedContactIds" | "vaultFileTaskId" | "intakeFormId">
  >,
): PfsInstance[] {
  return upsertPfsInstance(instances, {
    ...(findPfsInstance(instances, instanceId) ??
      createEmptyPfsInstance({ name: extras?.name })),
    id: instanceId,
    data,
    ...(extras?.name !== undefined ? { name: extras.name } : {}),
    ...(extras?.assignedContactIds !== undefined
      ? { assignedContactIds: [...extras.assignedContactIds] }
      : {}),
    ...(extras?.vaultFileTaskId !== undefined
      ? { vaultFileTaskId: extras.vaultFileTaskId }
      : {}),
    ...(extras?.intakeFormId !== undefined
      ? { intakeFormId: extras.intakeFormId }
      : {}),
  });
}
