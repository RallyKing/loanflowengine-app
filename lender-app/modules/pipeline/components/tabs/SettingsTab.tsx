"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  History,
  LayoutGrid,
  Share2,
  LogOut,
  Trash2,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { PipelineDrawerLayoutSettings } from "@/components/PipelineDrawerLayoutSettings";
import { PipelineFileSharingSection } from "@/components/PipelineFileSharingSection";
import { PipelineFileActivityPanel } from "@/components/PipelineFileActivityPanel";
import { cn } from "@/lib/cn";
import { premiumTabSectionSpaceClass } from "@/lib/pipeline/premiumWorkspaceUi";
import { SETTINGS_TAB_SECTION_IDS } from "@/lib/pipeline/fileWorkspaceTabRouting";
import type { UserPreferencesCollapseBehavior } from "@/lib/userPreferencesModel";
import type { PipelineDrawerLayoutV1 } from "@/lib/pipelineDrawerLayoutStorage";
import type { ReactNode } from "react";
import { settingsLayoutBlockMeta, fileHistoryBlockMeta, type CollapsibleBlockBadgeVariant } from "@/lib/pipeline/collapsibleBlockMetadata";

function SettingsSection({
  id,
  title,
  status,
  summary,
  description,
  icon,
  indicatorCount,
  badgeVariant,
  variant = "default",
  children,
  className,
}: {
  id: string;
  title: string;
  status: string;
  summary: string;
  description?: string;
  icon: ReactNode;
  indicatorCount?: number;
  badgeVariant?: CollapsibleBlockBadgeVariant;
  variant?: "default" | "danger";
  children: ReactNode;
  className?: string;
}) {
  return (
    <CollapsibleBlock
      id={id}
      title={title}
      status={status}
      summary={summary}
      icon={icon}
      indicatorCount={indicatorCount}
      badgeVariant={badgeVariant}
      variant={variant === "danger" ? "danger" : "default"}
      description={description}
      className={className}
      defaultOpen={false}
      lazyMount
      animated
    >
      {children}
    </CollapsibleBlock>
  );
}

export type SettingsTabProps = {
  fileId: Id<"pipeline">;
  organizationId?: Id<"organizations"> | null;
  memberUserKey?: string;
  readOnly: boolean;
  /** When true, Danger Zone offers Leave share instead of permanent Delete. */
  isSharedRecipient?: boolean;
  archivedAt?: number | null;
  archiving: boolean;
  archiveError: string | null;
  onToggleArchive: () => void;
  onDelete: () => void;
  onLeaveShare?: () => void;
  drawerLayout: PipelineDrawerLayoutV1;
  onDrawerLayoutChange: React.Dispatch<
    React.SetStateAction<PipelineDrawerLayoutV1>
  >;
  layoutNonHideableIds: readonly string[];
  planGatedBlockIds?: readonly string[];
  effectiveCollapseBehavior: UserPreferencesCollapseBehavior;
  onCollapseBehaviorChange: (
    behavior: UserPreferencesCollapseBehavior,
  ) => void | Promise<void>;
  fileSectionBulkBusy: boolean;
  onApplyFileCollapseExpand: (mode: "collapse" | "expand") => void;
  onResetDrawerToTemplate: () => void;
  drawerLayoutResetting: boolean;
  canResetTemplate: boolean;
  drawerBlockSuggestions?: ReactNode;
  className?: string;
};

export function SettingsTab({
  fileId,
  organizationId,
  memberUserKey,
  readOnly,
  isSharedRecipient = false,
  archivedAt,
  archiving,
  archiveError,
  onToggleArchive,
  onDelete,
  onLeaveShare,
  drawerLayout,
  onDrawerLayoutChange,
  layoutNonHideableIds,
  planGatedBlockIds,
  effectiveCollapseBehavior,
  onCollapseBehaviorChange,
  fileSectionBulkBusy,
  onApplyFileCollapseExpand,
  onResetDrawerToTemplate,
  drawerLayoutResetting,
  canResetTemplate,
  drawerBlockSuggestions,
  className,
}: SettingsTabProps) {
  const visibleDrawerBlocks = drawerLayout.order.filter(
    (id) => !drawerLayout.hidden.includes(id),
  ).length;
  const layoutMeta = settingsLayoutBlockMeta(
    effectiveCollapseBehavior,
    visibleDrawerBlocks,
  );

  const activityPeek = useQuery(api.pipelineFileActivity.listForFile, {
    fileId,
    limit: 1,
    ...(memberUserKey ? { memberUserKey } : {}),
  });
  const fileHistoryMeta = fileHistoryBlockMeta(activityPeek);

  return (
    <div
      id={SETTINGS_TAB_SECTION_IDS.root}
      className={cn("min-w-0 overflow-x-hidden", premiumTabSectionSpaceClass, className)}
      data-testid="pipeline-settings-tab"
      data-file-id={fileId}
    >
      <SettingsSection
        id={SETTINGS_TAB_SECTION_IDS.layout}
        title="Layout & defaults"
        status={layoutMeta.status}
        summary={layoutMeta.summary}
        indicatorCount={layoutMeta.indicatorCount}
        badgeVariant={layoutMeta.badgeVariant}
        description="Show or hide drawer sections, set default expand behavior, and reset to your org template."
        icon={<LayoutGrid className="h-4 w-4" aria-hidden />}
      >
        <div aria-busy={fileSectionBulkBusy} className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between">
            <label className="flex w-full min-w-0 flex-col gap-1 md:w-auto md:shrink-0">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Default sections
              </span>
              <select
                className="h-9 w-full rounded-dlc-sm border border-border bg-background px-2 text-base shadow-dlc-1 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 md:text-xs"
                value={effectiveCollapseBehavior}
                aria-label="Default pipeline drawer section expand mode"
                disabled={readOnly}
                onChange={(e) => {
                  const v = e.target.value;
                  if (
                    v === "all_open" ||
                    v === "all_closed" ||
                    v === "smart"
                  ) {
                    void onCollapseBehaviorChange(v);
                  }
                }}
              >
                <option value="all_open">All open</option>
                <option value="all_closed">All collapsed</option>
                <option value="smart">Open filled only</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={readOnly || fileSectionBulkBusy}
                onClick={() => onApplyFileCollapseExpand("collapse")}
              >
                Collapse all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={readOnly || fileSectionBulkBusy}
                onClick={() => onApplyFileCollapseExpand("expand")}
              >
                Expand all
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end md:justify-between">
            <div className="min-w-0 flex-1">
              <PipelineDrawerLayoutSettings
                layout={drawerLayout}
                onChange={onDrawerLayoutChange}
                nonHideableBlockIds={layoutNonHideableIds}
                planGatedBlockIds={planGatedBlockIds}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 self-start sm:self-auto"
              disabled={readOnly || drawerLayoutResetting || !canResetTemplate}
              onClick={() => onResetDrawerToTemplate()}
            >
              {drawerLayoutResetting ? "Resetting…" : "Reset to template"}
            </Button>
          </div>
          {drawerBlockSuggestions}
        </div>
      </SettingsSection>

      <SettingsSection
        id={SETTINGS_TAB_SECTION_IDS.sharing}
        title="Pipeline file access"
        status={organizationId && memberUserKey ? "ACL" : "Limited"}
        summary={
          organizationId && memberUserKey
            ? "Owner-scoped sharing for this file"
            : "Organization scope required for sharing"
        }
        description="Owner-scoped sharing for this file (ACL)."
        icon={<Share2 className="h-4 w-4" aria-hidden />}
      >
        {organizationId && memberUserKey ? (
          <PipelineFileSharingSection
            fileId={fileId}
            organizationId={organizationId}
            memberUserKey={memberUserKey}
            accessReadOnly={readOnly}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Sharing is available on organization-scoped files only.
          </p>
        )}
      </SettingsSection>

      <SettingsSection
        id={SETTINGS_TAB_SECTION_IDS.archive}
        title="Archive"
        status={archivedAt != null ? "Archived" : "Active"}
        summary={
          archivedAt != null
            ? `Archived ${new Date(archivedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}`
            : "Visible in default pipeline list"
        }
        description={
          archivedAt != null
            ? "Restore to bring this file back into the active pipeline, board, and ledger projections."
            : "Hide this file from the default pipeline list without losing history."
        }
        icon={
          archivedAt != null ? (
            <ArchiveRestore className="h-4 w-4" aria-hidden />
          ) : (
            <Archive className="h-4 w-4" aria-hidden />
          )
        }
      >
        {archivedAt != null ? (
          <p className="mb-3 text-xs text-muted-foreground">
            Archived{" "}
            <span className="font-medium text-foreground">
              {new Date(archivedAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
            .
          </p>
        ) : null}
        {archiveError ? (
          <p className="mb-3 text-sm text-destructive" role="alert">
            {archiveError}
          </p>
        ) : null}
        <Button
          type="button"
          variant={archivedAt != null ? "primary" : "outline"}
          size="sm"
          disabled={readOnly || archiving}
          onClick={() => onToggleArchive()}
          data-testid="pipeline-settings-archive-action"
        >
          {archivedAt != null ? (
            <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Archive className="h-3.5 w-3.5" aria-hidden />
          )}
          {archiving
            ? archivedAt != null
              ? "Restoring…"
              : "Archiving…"
            : archivedAt != null
              ? "Restore from archive"
              : "Archive file"}
        </Button>
      </SettingsSection>

      <SettingsSection
        id={SETTINGS_TAB_SECTION_IDS.dangerZone}
        title="Danger zone"
        status="Destructive"
        summary={
          isSharedRecipient
            ? "Leave this shared file — does not delete the owner’s copy"
            : "Permanent file removal — use with caution"
        }
        description={
          isSharedRecipient
            ? "Leaving removes only your access. The owner and other collaborators keep the file."
            : "Removing a file hides it from active pipeline work and may limit borrower portal visibility. Ledger references can remain for audit purposes."
        }
        icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
        variant="danger"
      >
        {isSharedRecipient ? (
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={!onLeaveShare}
            onClick={() => onLeaveShare?.()}
            data-testid="pipeline-settings-leave-share-action"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Leave share
          </Button>
        ) : (
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={readOnly}
            onClick={onDelete}
            data-testid="pipeline-settings-delete-action"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Delete file
          </Button>
        )}
      </SettingsSection>

      <SettingsSection
        id={SETTINGS_TAB_SECTION_IDS.fileHistory}
        title="File history"
        status={fileHistoryMeta.status}
        summary={fileHistoryMeta.summary}
        badgeVariant={fileHistoryMeta.badgeVariant}
        description="Recorded changes and undo when policy allows — the system audit trail for this file."
        icon={<History className="h-4 w-4" aria-hidden />}
      >
        <PipelineFileActivityPanel fileId={fileId} embedded />
      </SettingsSection>
    </div>
  );
}
