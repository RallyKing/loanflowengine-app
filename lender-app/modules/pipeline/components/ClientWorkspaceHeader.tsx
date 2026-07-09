"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChevronLeft, Users, UsersRound } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu";
import { ClientFastAddContactAction } from "@/components/pipeline/ClientFastAddContactAction";
import {
  ClientContactPreview,
  type ClientContactPreviewItem,
} from "@/components/pipeline/ClientContactPreview";
import { ClientGroupModal } from "@/components/pipeline/ClientGroupModal";
import { ClientTaskAggregateModal } from "@/components/pipeline/ClientTaskAggregateModal";
import { ContactProfileModal } from "@/components/pipeline/ContactProfileModal";
import { TaskRollupBadge } from "@/components/pipeline/tasks/HubTriageHighlightChrome";
import { useHubTriageHighlightMap } from "@/hooks/useHubTriageHighlightMap";
import { resolveTaskRollupCounts } from "@/lib/pipeline/hubTriageHighlight";
import { cn } from "@/lib/cn";
import { pipelineClientWorkspaceHref } from "@/lib/pipeline/routes";
import type { ClientWorkspaceAdditionalContact } from "@/lib/pipeline/clientWorkspaceTree";
import type { LinkedClientSummary } from "@/lib/pipelineClientRelationships";
import { touchTargetIconClass } from "@/lib/ui/touchTarget";

export type ClientWorkspaceHeaderProps = {
  hubBackHref: string;
  clientId: Id<"clients">;
  primaryContactId?: Id<"contacts">;
  /** Resolved CRM contact name — sole source for client title when set. */
  primaryContactName?: string | null;
  additionalContacts?: ClientWorkspaceAdditionalContact[];
  linkedEntities?: LinkedClientSummary[];
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  canEdit?: boolean;
  className?: string;
};

const linkedPillClass =
  "inline-flex h-8 max-w-[9rem] shrink-0 items-center gap-1 rounded-full border border-border/80 bg-dlc-surface-high px-2.5 text-xs font-medium shadow-dlc-1 transition-colors duration-dlc-short ease-dlc-standard sm:max-w-[11rem]";

/**
 * Phase 55.7+ — Client tier summary header with interactive contact previews.
 */
export function ClientWorkspaceHeader({
  hubBackHref,
  clientId,
  primaryContactId,
  primaryContactName,
  additionalContacts = [],
  linkedEntities = [],
  organizationId,
  memberUserKey,
  canEdit = false,
  className,
}: ClientWorkspaceHeaderProps) {
  const router = useRouter();
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [profileContactId, setProfileContactId] = useState<Id<"contacts"> | null>(
    null,
  );

  const taskAggregate = useQuery(
    api.pipelineClientWorkspace.getClientAggregatedTasks,
    organizationId && memberUserKey?.trim()
      ? {
          organizationId,
          clientId,
          memberUserKey: memberUserKey.trim(),
        }
      : "skip",
  );
  const activeTasksCount =
    taskAggregate === undefined ? null : (taskAggregate?.activeCount ?? 0);

  /** Phase Modular-D — overdue/status roll-up beside the active-tasks pill. */
  const triageHighlights = useHubTriageHighlightMap(
    organizationId,
    memberUserKey?.trim() || undefined,
  );
  const clientTaskCounts = resolveTaskRollupCounts(triageHighlights, {
    kind: "client",
    id: String(clientId),
  });

  const hasLinkedEntities = linkedEntities.length > 0;
  const linkedLabel = hasLinkedEntities
    ? linkedEntities.length === 1
      ? linkedEntities[0]!.displayName
      : `${linkedEntities.length} linked`
    : "No linked entities";
  const resolvedClientName = primaryContactName?.trim() || null;
  const hasPrimaryContact = Boolean(primaryContactId && resolvedClientName);
  const canMutate = Boolean(canEdit && organizationId && memberUserKey?.trim());
  const canViewContacts = Boolean(memberUserKey?.trim());

  const linkedAdditionalContactIds = useMemo(
    () => additionalContacts.map((row) => row.contactId),
    [additionalContacts],
  );

  const previewContacts = useMemo((): ClientContactPreviewItem[] => {
    const rows: ClientContactPreviewItem[] = [];
    if (primaryContactId && resolvedClientName) {
      rows.push({
        contactId: primaryContactId,
        name: resolvedClientName,
        isPrimary: true,
      });
    }
    for (const contact of additionalContacts) {
      if (primaryContactId && String(contact.contactId) === String(primaryContactId)) {
        continue;
      }
      rows.push({
        contactId: contact.contactId,
        name: contact.name,
      });
    }
    return rows;
  }, [additionalContacts, primaryContactId, resolvedClientName]);

  const openManageGroup = () => setGroupModalOpen(true);
  const openContactProfile = (contactId: Id<"contacts">) => {
    setProfileContactId(contactId);
  };

  return (
    <>
      <div
        data-testid="pipeline-client-workspace-header"
        className={cn(
          "sticky top-0 z-40 w-full min-w-0 border-b border-gray-300 bg-background dark:border-slate-600",
          className,
        )}
      >
        <header
          className={cn(
            "flex h-14 min-h-14 max-h-14 w-full min-w-0 items-center justify-between gap-2 overflow-hidden px-2 sm:px-3",
            "supports-[overflow-anchor:auto]:[overflow-anchor:none]",
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <Link
              href={hubBackHref}
              data-testid="pipeline-client-workspace-back-to-hub"
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-dlc-sm border border-border/90 bg-dlc-surface-high text-foreground shadow-dlc-1 transition-colors hover:bg-muted/80",
                touchTargetIconClass,
              )}
              title="Back to Pipeline Hub"
            >
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
            </Link>

            {/* Hierarchy trail root: Pipeline > [Client]. */}
            <nav
              aria-label="Breadcrumb"
              className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex"
              data-testid="pipeline-client-workspace-breadcrumb"
            >
              <Link
                href={hubBackHref}
                className="rounded-dlc-sm px-0.5 transition-colors hover:text-foreground"
              >
                Pipeline
              </Link>
              <span aria-hidden>›</span>
            </nav>

            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              {hasPrimaryContact ? (
                <h1
                  className="min-w-0 shrink truncate text-sm font-semibold leading-tight sm:text-base"
                  data-testid="pipeline-client-workspace-client-name"
                  title={resolvedClientName ?? undefined}
                >
                  {resolvedClientName}
                </h1>
              ) : canMutate ? (
                <button
                  type="button"
                  className="min-w-0 shrink truncate text-left text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  data-testid="pipeline-client-workspace-client-name-missing"
                  onClick={openManageGroup}
                >
                  Link a CRM contact
                </button>
              ) : (
                <span
                  className="min-w-0 shrink truncate text-sm text-muted-foreground"
                  data-testid="pipeline-client-workspace-client-name-missing"
                >
                  Link a CRM contact
                </span>
              )}

              {previewContacts.length > 0 ? (
                <ClientContactPreview
                  contacts={previewContacts}
                  className="hidden min-w-0 sm:flex"
                  onContactClick={
                    canViewContacts ? openContactProfile : undefined
                  }
                />
              ) : null}
            </div>

            {hasLinkedEntities ? (
              <DropdownMenu
                aria-label="Linked entities"
                align="start"
                trigger={
                  <button
                    type="button"
                    data-testid="pipeline-client-workspace-linked-entities"
                    className={cn(
                      linkedPillClass,
                      "text-foreground hover:bg-muted/70",
                    )}
                    title="View linked business entities"
                  >
                    <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 truncate">{linkedLabel}</span>
                  </button>
                }
              >
                {linkedEntities.map((entity) => (
                  <DropdownMenuItem
                    key={entity.clientId}
                    onClick={() =>
                      router.push(pipelineClientWorkspaceHref(entity.clientId))
                    }
                  >
                    {entity.displayName}
                  </DropdownMenuItem>
                ))}
              </DropdownMenu>
            ) : (
              <span
                data-testid="pipeline-client-workspace-linked-entities"
                className={cn(
                  linkedPillClass,
                  "hidden cursor-default text-muted-foreground opacity-90 sm:inline-flex",
                )}
                title="No linked business entities"
              >
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{linkedLabel}</span>
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {previewContacts.length > 0 ? (
              <ClientContactPreview
                contacts={previewContacts}
                className="sm:hidden"
                onContactClick={canViewContacts ? openContactProfile : undefined}
              />
            ) : null}
            <button
              type="button"
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-full border border-border/80 bg-dlc-surface-high px-2.5 text-xs font-medium tabular-nums shadow-dlc-1 transition-colors duration-dlc-short ease-dlc-standard",
                "cursor-pointer hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
              title="View all client tasks"
              data-testid="pipeline-client-workspace-triage-rollup"
              onClick={() => setTaskModalOpen(true)}
            >
              {activeTasksCount == null
                ? "Tasks —"
                : `${activeTasksCount} active task${activeTasksCount === 1 ? "" : "s"}`}
              <TaskRollupBadge
                counts={
                  clientTaskCounts &&
                  (clientTaskCounts.overdue > 0 ||
                    clientTaskCounts.topStatus === "in_progress")
                    ? clientTaskCounts
                    : null
                }
                className="ml-1.5"
              />
            </button>
            {canMutate ? (
              <>
                <ClientFastAddContactAction
                  clientId={clientId}
                  organizationId={organizationId!}
                  memberUserKey={memberUserKey!}
                  primaryContactId={primaryContactId}
                  linkedAdditionalContactIds={linkedAdditionalContactIds}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="hidden h-8 gap-1.5 px-2.5 text-xs sm:inline-flex"
                  title="Manage group"
                  data-testid="pipeline-client-workspace-manage-group"
                  onClick={openManageGroup}
                >
                  <UsersRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Manage group
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 shrink-0 p-0 sm:hidden",
                    touchTargetIconClass,
                  )}
                  title="Manage group"
                  aria-label="Manage group"
                  data-testid="pipeline-client-workspace-manage-group-mobile"
                  onClick={openManageGroup}
                >
                  <UsersRound className="h-4 w-4 shrink-0" aria-hidden />
                </Button>
              </>
            ) : null}
          </div>
        </header>
      </div>

      {organizationId && memberUserKey?.trim() ? (
        <ClientGroupModal
          open={groupModalOpen}
          onClose={() => setGroupModalOpen(false)}
          clientId={clientId}
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          canEdit={canEdit}
          primaryContactId={primaryContactId}
          primaryContactName={primaryContactName}
          additionalContacts={additionalContacts}
        />
      ) : null}

      {organizationId && memberUserKey?.trim() ? (
        <ClientTaskAggregateModal
          open={taskModalOpen}
          onClose={() => setTaskModalOpen(false)}
          clientId={clientId}
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          canEdit={canEdit}
        />
      ) : null}

      {memberUserKey?.trim() ? (
        <ContactProfileModal
          contactId={profileContactId}
          open={profileContactId != null}
          onClose={() => setProfileContactId(null)}
          memberUserKey={memberUserKey}
          canEdit={canEdit}
        />
      ) : null}
    </>
  );
}
