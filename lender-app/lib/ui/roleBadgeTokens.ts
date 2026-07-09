/**
 * Shared role / resource-type badge tokens (Phase 17.1).
 */
import { cn } from "@/lib/cn";

export type CollaboratorRoleKey =
  | "owner"
  | "co_owner"
  | "editor"
  | "viewer"
  | "pending";

export type ResourceTypeBadgeKey =
  | "task"
  | "pipeline"
  | "lender"
  | "referral"
  | "internal"
  | "event";

const COLLABORATOR_ROLE_CLASS: Record<CollaboratorRoleKey, string> = {
  owner: "border-brand-accent/40 bg-brand-accent/10 text-brand-accent",
  co_owner:
    "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  editor: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  viewer: "border-border bg-muted/50 text-muted-foreground",
  pending: "border-dashed border-border bg-muted/30 text-muted-foreground",
};

const COLLABORATOR_ROLE_LABEL: Record<CollaboratorRoleKey, string> = {
  owner: "Owner",
  co_owner: "Co-owner",
  editor: "Editor",
  viewer: "Viewer",
  pending: "Pending",
};

const RESOURCE_TYPE_CLASS: Record<ResourceTypeBadgeKey, string> = {
  task: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
  pipeline:
    "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100",
  lender:
    "border-violet-500/40 bg-violet-500/10 text-violet-900 dark:text-violet-100",
  referral:
    "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  internal:
    "border-border bg-muted/50 text-muted-foreground",
  event:
    "border-brand-accent/30 bg-brand-accent/5 text-brand-accent",
};

const RESOURCE_TYPE_LABEL: Record<ResourceTypeBadgeKey, string> = {
  task: "Task",
  pipeline: "File",
  lender: "Lender",
  referral: "Referral",
  internal: "Internal",
  event: "Event",
};

export function collaboratorRoleBadgeClass(role: string): string {
  const key = (role in COLLABORATOR_ROLE_CLASS
    ? role
    : "viewer") as CollaboratorRoleKey;
  return COLLABORATOR_ROLE_CLASS[key];
}

export function collaboratorRoleBadgeLabel(role: string): string {
  const key = (role in COLLABORATOR_ROLE_LABEL
    ? role
    : "viewer") as CollaboratorRoleKey;
  return COLLABORATOR_ROLE_LABEL[key] ?? role;
}

export function resourceTypeBadgeClass(type: ResourceTypeBadgeKey): string {
  return RESOURCE_TYPE_CLASS[type];
}

export function resourceTypeBadgeLabel(type: ResourceTypeBadgeKey): string {
  return RESOURCE_TYPE_LABEL[type];
}

export function roleBadgeBaseClass(...classes: (string | undefined)[]): string {
  return cn(
    "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
    ...classes,
  );
}
