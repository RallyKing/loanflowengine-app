import type { Id } from "@/convex/_generated/dataModel";
import type { CollapsibleBlockBadgeVariant } from "@/lib/pipeline/collapsibleBlockMetadata";
import { getPipelineStatusInfo } from "@/lib/pipelineStatus";

export type ClientWorkspaceAdditionalContact = {
  linkId: Id<"clientContactLinks">;
  contactId: Id<"contacts">;
  name: string;
  email?: string;
  phone?: string;
  contactRoleId?: string;
  role: string;
  notes?: string;
  sortOrder: number;
};

/** Slim file node from `getClientWorkspaceTree`. */
export type ClientWorkspaceTreeFile = {
  _id: Id<"pipeline">;
  fileName: string;
  status: string;
  fundingAmount?: number;
  stageId?: Id<"organizationPipelineStages">;
  subStageId?: Id<"organizationPipelineSubStages">;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
  ownerUserId?: string;
  archivedAt?: number | null;
  workspaceSortOrder?: number;
  createdAt: number;
  updatedAt: number;
  /** Resolved stage label (org stage name or canonical status). */
  stageLabel?: string;
  ownerDisplayUsername?: string;
  triageBadgeVariant?: CollapsibleBlockBadgeVariant;
};

/** Project node with nested files from `getClientWorkspaceTree`. */
export type ClientWorkspaceTreeProject = {
  _id: Id<"projects">;
  clientId: Id<"clients">;
  title: string;
  normalizedTitle: string;
  purpose?: string;
  status: "active" | "on_hold" | "completed" | "cancelled";
  targetFunding?: number;
  completionPercent?: number;
  ownerUserId: string;
  workspaceSortOrder?: number;
  createdAt: number;
  updatedAt: number;
  files: ClientWorkspaceTreeFile[];
};

const PROJECT_STATUS_LABEL: Record<
  ClientWorkspaceTreeProject["status"],
  string
> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function projectWorkspaceStatusLabel(
  status: ClientWorkspaceTreeProject["status"] | "unassigned",
): string {
  if (status === "unassigned") return "Unassigned";
  return PROJECT_STATUS_LABEL[status] ?? "Active";
}

export function projectWorkspaceBadgeVariant(
  status: ClientWorkspaceTreeProject["status"] | "unassigned",
): CollapsibleBlockBadgeVariant {
  switch (status) {
    case "active":
      return "success";
    case "on_hold":
      return "warning";
    case "completed":
      return "secondary";
    case "cancelled":
      return "outline";
    case "unassigned":
      return "secondary";
    default:
      return "secondary";
  }
}

export function fileWorkspaceStatusLabel(file: ClientWorkspaceTreeFile): string {
  const fromTree = file.stageLabel?.trim();
  if (fromTree) return fromTree;
  return getPipelineStatusInfo(file.status).label;
}

export function fileWorkspaceBadgeVariant(
  file: ClientWorkspaceTreeFile,
): CollapsibleBlockBadgeVariant {
  return file.triageBadgeVariant ?? "default";
}

export function fileWorkspaceOwnerSummary(file: ClientWorkspaceTreeFile): string {
  const owner = file.ownerDisplayUsername?.trim();
  if (owner) return owner;
  const raw = file.ownerUserId?.trim();
  if (raw) return raw;
  return "Unassigned";
}

export function projectWorkspaceFundingSummary(
  targetFunding?: number | null,
  fileCount?: number,
): string {
  if (targetFunding != null && Number.isFinite(targetFunding) && targetFunding > 0) {
    return `Target: $${targetFunding.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })}`;
  }
  if (fileCount != null && fileCount > 0) {
    return `${fileCount} loan file${fileCount === 1 ? "" : "s"}`;
  }
  return "No target set";
}
