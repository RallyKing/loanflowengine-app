/**
 * PFS ↔ Forms & Applications / Document Vault title linking.
 * Each first-class PFS instance owns a distinct titled intake form and vault task.
 */
import {
  pfsInstanceDisplayName,
  type PfsInstance,
} from "./pfsInstances";

export const PFS_INTAKE_FORM_FIELD_KEYS = [
  "borrower_first_name",
  "borrower_last_name",
  "borrower_email",
  "guarantor_pfs_total_assets",
  "guarantor_pfs_total_liabilities",
  "guarantor_pfs_net_worth",
] as const;

export function pfsAssociatedFormTitle(
  instance: Pick<PfsInstance, "name" | "data">,
): string {
  const display = pfsInstanceDisplayName(instance).trim();
  if (!display) return "PFS 1";
  if (/^pfs(\s|:|$|\d)/i.test(display)) return display.slice(0, 200);
  return `PFS: ${display}`.slice(0, 200);
}

export function pfsInstanceNameFromFormTitle(formTitle: string): string {
  const trimmed = formTitle.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Untitled PFS";
  const stripped = trimmed.replace(/^pfs\s*:\s*/i, "").trim();
  return (stripped || trimmed).slice(0, 200);
}

export function isGenericPfsFormTitle(title: string): boolean {
  const t = title.trim().toLowerCase().replace(/\s+/g, " ");
  return (
    t === "personal financial statement" ||
    t === "complete: personal financial statement" ||
    t === "complete: pfs" ||
    t === "pfs" ||
    t === "pfs 1" ||
    t === "untitled pfs"
  );
}

export function titlesMatchPfsInstance(
  title: string,
  instance: Pick<PfsInstance, "name" | "data">,
): boolean {
  const t = title.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return false;
  const display = pfsInstanceDisplayName(instance).trim().toLowerCase();
  const associated = pfsAssociatedFormTitle(instance).trim().toLowerCase();
  if (!display) return false;
  if (t === associated || t === display) return true;
  if (t === `complete: ${display}` || t === `complete: ${associated}`) return true;
  const stripped = t.replace(/^complete:\s*/, "").replace(/^pfs\s*:\s*/, "");
  return stripped === display || stripped === associated.replace(/^pfs\s*:\s*/, "");
}

export type PfsLinkableForm = {
  id: string;
  name: string;
  sourceKind?: string | null;
  sourceInstanceId?: string | null;
};

export type PfsLinkableVaultTask = {
  id: string;
  title: string;
  sourceKind?: string | null;
  sourceInstanceId?: string | null;
  assignedBlockIds?: readonly string[] | null;
  isArchived?: boolean;
  status?: string;
  taskType?: string | null;
};

export type PfsAssociationPlanItem = {
  instanceId: string;
  title: string;
  formId?: string;
  createForm: boolean;
  renameForm: boolean;
  vaultFileTaskId?: string;
  createVaultTask: boolean;
  renameVaultTask: boolean;
};

function isLivePfsBlockTask(task: PfsLinkableVaultTask): boolean {
  if (task.isArchived) return false;
  if (task.status === "complete") return false;
  const type = task.taskType ?? "document_upload";
  if (type !== "block_assignment") return false;
  const blocks = task.assignedBlockIds ?? [];
  return blocks.length === 1 && blocks[0] === "pfs_statement";
}

function formAlreadySourced(form: PfsLinkableForm): boolean {
  return Boolean(
    form.sourceKind === "pfs_instance" && form.sourceInstanceId?.trim(),
  );
}

function taskAlreadySourced(task: PfsLinkableVaultTask): boolean {
  return Boolean(
    task.sourceKind === "pfs_instance" && task.sourceInstanceId?.trim(),
  );
}

/**
 * Plan distinct form + vault-task links for every PFS on a file.
 * Never assigns the same form/task to two instances. Prefers existing
 * sourceInstanceId matches, then title matches, then one unclaimed generic
 * PFS form/task, then create.
 */
export function planPfsAssociations(args: {
  instances: readonly PfsInstance[];
  forms: readonly PfsLinkableForm[];
  vaultTasks: readonly PfsLinkableVaultTask[];
}): PfsAssociationPlanItem[] {
  const claimedFormIds = new Set<string>();
  const claimedTaskIds = new Set<string>();
  for (const inst of args.instances) {
    if (inst.intakeFormId?.trim()) claimedFormIds.add(inst.intakeFormId.trim());
    if (inst.vaultFileTaskId?.trim()) {
      claimedTaskIds.add(inst.vaultFileTaskId.trim());
    }
  }

  let genericFormClaimed = false;
  let genericTaskClaimed = false;

  return args.instances.map((inst) => {
    const title = pfsAssociatedFormTitle(inst);
    let formId = inst.intakeFormId?.trim() || undefined;
    let createForm = false;
    let renameForm = false;

    if (formId) {
      const existing = args.forms.find((f) => f.id === formId);
      if (!existing) {
        formId = undefined;
      } else {
        claimedFormIds.add(formId);
        renameForm = existing.name.trim() !== title;
      }
    }

    if (!formId) {
      const bySource = args.forms.find(
        (f) =>
          f.sourceKind === "pfs_instance" &&
          f.sourceInstanceId === inst.id &&
          !claimedFormIds.has(f.id),
      );
      if (bySource) {
        formId = bySource.id;
        claimedFormIds.add(formId);
        renameForm = bySource.name.trim() !== title;
      }
    }

    if (!formId) {
      const byTitle = args.forms.find(
        (f) =>
          !claimedFormIds.has(f.id) &&
          !formAlreadySourced(f) &&
          titlesMatchPfsInstance(f.name, inst),
      );
      if (byTitle) {
        formId = byTitle.id;
        claimedFormIds.add(formId);
        renameForm = byTitle.name.trim() !== title;
      }
    }

    if (!formId && !genericFormClaimed) {
      const generic = args.forms.find(
        (f) =>
          !claimedFormIds.has(f.id) &&
          !formAlreadySourced(f) &&
          isGenericPfsFormTitle(f.name),
      );
      if (generic) {
        formId = generic.id;
        claimedFormIds.add(formId);
        genericFormClaimed = true;
        renameForm = generic.name.trim() !== title;
      }
    }

    if (!formId) createForm = true;

    let vaultFileTaskId = inst.vaultFileTaskId?.trim() || undefined;
    let createVaultTask = false;
    let renameVaultTask = false;

    if (vaultFileTaskId) {
      const existing = args.vaultTasks.find((t) => t.id === vaultFileTaskId);
      if (!existing || existing.isArchived) {
        vaultFileTaskId = undefined;
      } else {
        claimedTaskIds.add(vaultFileTaskId);
        renameVaultTask = existing.title.trim() !== title;
      }
    }

    if (!vaultFileTaskId) {
      const bySource = args.vaultTasks.find(
        (t) =>
          isLivePfsBlockTask(t) &&
          t.sourceKind === "pfs_instance" &&
          t.sourceInstanceId === inst.id &&
          !claimedTaskIds.has(t.id),
      );
      if (bySource) {
        vaultFileTaskId = bySource.id;
        claimedTaskIds.add(vaultFileTaskId);
        renameVaultTask = bySource.title.trim() !== title;
      }
    }

    if (!vaultFileTaskId) {
      const byTitle = args.vaultTasks.find(
        (t) =>
          isLivePfsBlockTask(t) &&
          !claimedTaskIds.has(t.id) &&
          !taskAlreadySourced(t) &&
          titlesMatchPfsInstance(t.title, inst),
      );
      if (byTitle) {
        vaultFileTaskId = byTitle.id;
        claimedTaskIds.add(vaultFileTaskId);
        renameVaultTask = byTitle.title.trim() !== title;
      }
    }

    if (!vaultFileTaskId && !genericTaskClaimed) {
      const generic = args.vaultTasks.find(
        (t) =>
          isLivePfsBlockTask(t) &&
          !claimedTaskIds.has(t.id) &&
          !taskAlreadySourced(t) &&
          isGenericPfsFormTitle(t.title),
      );
      if (generic) {
        vaultFileTaskId = generic.id;
        claimedTaskIds.add(vaultFileTaskId);
        genericTaskClaimed = true;
        renameVaultTask = generic.title.trim() !== title;
      }
    }

    if (!vaultFileTaskId) createVaultTask = true;

    return {
      instanceId: inst.id,
      title,
      formId,
      createForm,
      renameForm,
      vaultFileTaskId,
      createVaultTask,
      renameVaultTask,
    };
  });
}
