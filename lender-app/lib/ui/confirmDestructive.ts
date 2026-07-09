import type { OperationalConfirmRequest } from "@/components/ui/OperationalConfirmDialog";

/** Minimal delete confirm payload for imperative `useOperationalConfirm().confirm()`. */
export function simpleDeleteConfirm(
  entityName: string,
  options?: {
    title?: string;
    impact?: string;
    variant?: OperationalConfirmRequest["variant"];
    confirmLabel?: string;
    cascade?: OperationalConfirmRequest["cascade"];
    preview?: OperationalConfirmRequest["preview"];
  },
): Omit<OperationalConfirmRequest, "onConfirm"> {
  return {
    variant: options?.variant ?? "delete",
    title: options?.title ?? "Delete item",
    entityName,
    impact: options?.impact ?? "This action cannot be undone.",
    confirmLabel: options?.confirmLabel,
    cascade: options?.cascade,
    preview: options?.preview,
  };
}

export function unlinkConfirm(
  entityName: string,
  impact: string,
): Omit<OperationalConfirmRequest, "onConfirm"> {
  return {
    variant: "unlink",
    title: "Remove link",
    entityName,
    impact,
    confirmLabel: "Remove link",
  };
}

export function revokeAccessConfirm(
  entityName: string,
  impact: string,
): Omit<OperationalConfirmRequest, "onConfirm"> {
  return {
    variant: "revoke",
    title: "Revoke access",
    entityName,
    impact,
    confirmLabel: "Revoke access",
  };
}

/** Pipeline file audit log note removal (Phase 20). */
export function deletePipelineNoteConfirm(): Omit<
  OperationalConfirmRequest,
  "onConfirm"
> {
  return {
    variant: "delete",
    title: "Delete Note",
    entityName: "this note",
    impact:
      "Are you sure you want to permanently delete this note? This will also remove any attached files. This action cannot be undone.",
    confirmLabel: "Delete note",
  };
}
