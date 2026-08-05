"use client";

import { useCallback, useLayoutEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { Settings2, Inbox, MessageSquare, ShieldCheck } from "lucide-react";
import { FileMessagingPanel } from "@/components/FileMessagingPanel";
import { UnifiedCommunicationPanel } from "@/components/communications/UnifiedCommunicationPanel";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ClientPortalInviteBlock } from "@/components/ClientPortalInviteBlock";
import { ClientPortalUploadsInbox } from "@/components/pipeline/portal/ClientPortalUploadsInbox";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import {
  SortableSectionItem,
  SortableSectionList,
} from "@/components/pipeline/workspace/SortableSectionList";
import { cn } from "@/lib/cn";
import {
  CLIENT_PORTAL_SECTION_IDS,
  CLIENT_PORTAL_SECTION_LABELS,
  DEFAULT_CLIENT_PORTAL_SECTION_ORDER,
  isClientPortalSectionVisible,
  normalizeClientPortalSectionOrder,
  parseClientPortalTabLayoutFromUnknown,
  resetClientPortalTabLayout,
  toggleClientPortalSectionHidden,
  type ClientPortalSectionId,
} from "@/lib/file/clientPortalTabLayout";
import {
  DealWorkspaceSaveStatus,
  useDealWorkspaceEditor,
} from "@/lib/file/useDealWorkspaceEditor";
import { clientPortalBlockMeta, communicationsBlockMeta, type CollapsibleBlockBadgeVariant } from "@/lib/pipeline/collapsibleBlockMetadata";
import { CLIENT_PORTAL_TAB_SECTION_IDS } from "@/lib/pipeline/fileWorkspaceTabRouting";
import {
  premiumSectionStackClass,
  premiumTabSectionSpaceClass,
  premiumTabStackClass,
  premiumWorkspaceCanvasClass,
} from "@/lib/pipeline/premiumWorkspaceUi";
import type { DocumentVaultNavigationFocus } from "@/lib/pipeline/documentVaultNavigation";

export type ClientPortalSectionRenderer = (dragHandle: ReactNode) => ReactNode;

export type RegisterClientPortalSections = (
  sections: Partial<
    Record<ClientPortalSectionId, ClientPortalSectionRenderer>
  >,
  contentSig?: string,
) => void;

export type ClientPortalTabProps = {
  fileId: Id<"pipeline">;
  memberUserKey?: string;
  organizationId?: Id<"organizations"> | null;
  /** Switch to Tab 4 Documents with optional category + row highlight. */
  onNavigateToDocuments?: (
    focus: Omit<DocumentVaultNavigationFocus, "nonce">,
  ) => void;
  className?: string;
  /** Skip canvas + toolbar when nested in Portals tab. */
  embedded?: boolean;
  /** Parent owns DnD — register section renderers instead of SortableSectionList. */
  suppressInternalDnd?: boolean;
  onRegisterSections?: RegisterClientPortalSections;
};

function clientPortalAnchorForSection(
  sectionId: ClientPortalSectionId,
): string {
  switch (sectionId) {
    case "safeDefaults":
      return "pipeline-portal-safe-defaults";
    case "linkSecurity":
      return "pipeline-client-portal-link-security";
    case "uploadsInbox":
      return "pipeline-client-portal-uploads-inbox";
    case "communications":
      return CLIENT_PORTAL_TAB_SECTION_IDS.communications;
    default:
      return `pipeline-client-portal-${sectionId}`;
  }
}

function ClientPortalLayoutMenuItem({
  sectionId,
  label,
  visible,
  onToggle,
}: {
  sectionId: ClientPortalSectionId;
  label: string;
  visible: boolean;
  onToggle: (sectionId: ClientPortalSectionId) => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={visible}
      data-testid={`pipeline-client-portal-layout-toggle-${sectionId}`}
      className={cn(
        "flex w-full min-h-10 items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground",
        "transition-colors duration-dlc-short ease-dlc-standard hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
      )}
      onClick={() => onToggle(sectionId)}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-dlc-sm border border-border",
          visible && "border-primary bg-primary text-primary-foreground",
        )}
        aria-hidden
      >
        {visible ? (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6l3 3 5-5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      <span className="min-w-0">{label}</span>
    </button>
  );
}

function ClientPortalCollapsibleSection({
  id,
  title,
  status,
  summary,
  description,
  icon,
  indicatorCount,
  badgeVariant,
  headerRight,
  children,
}: {
  id: string;
  title: string;
  status: string;
  summary: string;
  description?: ReactNode;
  icon?: ReactNode;
  indicatorCount?: number;
  badgeVariant?: CollapsibleBlockBadgeVariant;
  headerRight?: ReactNode;
  children: ReactNode;
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
      headerRight={headerRight}
      lazyMount
      animated
      defaultOpen={false}
      description={description}
      contentClassName="space-y-4"
    >
      {children}
    </CollapsibleBlock>
  );
}

function isGrantPastExpiry(ts: number | undefined): boolean {
  if (ts == null) return false;
  return ts < Date.now();
}

export function ClientPortalTab({
  fileId,
  memberUserKey,
  organizationId,
  onNavigateToDocuments,
  className,
  embedded = false,
  suppressInternalDnd = false,
  onRegisterSections,
}: ClientPortalTabProps) {
  const { draft, saving, savedAt, isDirty, patchClientPortalTabLayout } =
    useDealWorkspaceEditor();

  const qArgs = useMemo(
    () =>
      memberUserKey
        ? { pipelineFileId: fileId, memberUserKey }
        : { pipelineFileId: fileId },
    [fileId, memberUserKey],
  );

  const access = useQuery(api.clientPortalAdmin.listAccessForFile, qArgs);

  const portalLayout = useMemo(
    () => parseClientPortalTabLayoutFromUnknown(draft?.clientPortalTabLayout),
    [draft?.clientPortalTabLayout],
  );

  const visibleSectionIds = useMemo(
    () =>
      portalLayout.order.filter((id) =>
        isClientPortalSectionVisible(portalLayout, id),
      ),
    [portalLayout],
  );

  const activeGrantCount =
    access === undefined
      ? null
      : access.filter((g) => !isGrantPastExpiry(g.grantExpiresAt)).length;

  const hasActiveGrant = activeGrantCount != null && activeGrantCount > 0;

  const onToggleSectionVisibility = useCallback(
    (sectionId: ClientPortalSectionId) => {
      patchClientPortalTabLayout((prev) =>
        toggleClientPortalSectionHidden(prev, sectionId),
      );
    },
    [patchClientPortalTabLayout],
  );

  const onResetLayout = useCallback(() => {
    patchClientPortalTabLayout(() => resetClientPortalTabLayout());
  }, [patchClientPortalTabLayout]);

  const onPortalDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = String(active.id) as ClientPortalSectionId;
      const overId = String(over.id) as ClientPortalSectionId;

      patchClientPortalTabLayout((prev) => {
        const oldIndex = prev.order.indexOf(activeId);
        const newIndex = prev.order.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0) return prev;
        return normalizeClientPortalSectionOrder(
          prev,
          arrayMove(prev.order, oldIndex, newIndex),
        );
      });
    },
    [patchClientPortalTabLayout],
  );

  const portalMeta = clientPortalBlockMeta(activeGrantCount);

  const internalThreads = useQuery(
    api.fileMessages.listThreadRoots,
    memberUserKey
      ? {
          pipelineFileId: fileId,
          memberUserKey,
          audience: "internal" as const,
          limit: 40,
        }
      : "skip",
  );

  const commHistoryArgs = useMemo(() => {
    if (!organizationId) return "skip" as const;
    return {
      organizationId,
      ...(memberUserKey ? { memberUserKey } : {}),
      relatedPipelineFileId: fileId,
      limit: 40,
    };
  }, [fileId, memberUserKey, organizationId]);

  const commHistory = useQuery(api.communications.listHistory, commHistoryArgs);

  const communicationsMeta = useMemo(() => {
    const internalCount = internalThreads?.length ?? 0;
    const outboundCount = commHistory?.length ?? 0;
    const threadCount =
      internalThreads === undefined && commHistory === undefined
        ? undefined
        : internalCount + outboundCount;
    let lastMessageAt: number | undefined;
    const internalLatest = internalThreads?.[0]?.message.createdAt;
    const outboundLatest = commHistory?.[0]?.at;
    if (internalLatest != null) lastMessageAt = internalLatest;
    if (outboundLatest != null) {
      lastMessageAt =
        lastMessageAt == null
          ? outboundLatest
          : Math.max(lastMessageAt, outboundLatest);
    }
    return communicationsBlockMeta(threadCount, lastMessageAt);
  }, [commHistory, internalThreads]);

  const renderPortalSection = (
    sectionId: ClientPortalSectionId,
    dragHandle?: ReactNode,
  ) => {
    const anchorId = clientPortalAnchorForSection(sectionId);
    const headerRight = dragHandle ?? undefined;

    switch (sectionId) {
      case "safeDefaults":
        return (
          <ClientPortalCollapsibleSection
            id={anchorId}
            title={CLIENT_PORTAL_SECTION_LABELS.safeDefaults}
            status={portalMeta.status}
            summary={portalMeta.summary}
            indicatorCount={portalMeta.indicatorCount}
            badgeVariant={portalMeta.badgeVariant}
            icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
            headerRight={headerRight}
            description="Nothing internal is published automatically — clients only see a redacted file summary until you post updates or requests."
          >
            <div className="flex gap-3">
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-dlc-accent"
                aria-hidden
              />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Safe defaults — nothing internal is published automatically
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Clients only see a redacted file summary (stage, property,
                  scenario). Lender names, internal milestones, tasks, and broker
                  notes stay private until you post a{" "}
                  <span className="font-medium text-foreground/90">
                    status update
                  </span>{" "}
                  or{" "}
                  <span className="font-medium text-foreground/90">
                    client request
                  </span>{" "}
                  below.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {access === undefined ? (
                    "Checking portal access…"
                  ) : hasActiveGrant ? (
                    <>
                      <span className="font-medium text-foreground">
                        {activeGrantCount} active grant
                        {activeGrantCount === 1 ? "" : "s"}
                      </span>{" "}
                      — external link{activeGrantCount === 1 ? "" : "s"} can
                      reach this file.
                    </>
                  ) : (
                    "No active client portal grants — invite a client to enable external access."
                  )}
                </p>
              </div>
            </div>
          </ClientPortalCollapsibleSection>
        );
      case "linkSecurity":
        return (
          <ClientPortalCollapsibleSection
            id={anchorId}
            title={CLIENT_PORTAL_SECTION_LABELS.linkSecurity}
            status={hasActiveGrant ? "Secured" : "Setup"}
            summary={
              hasActiveGrant
                ? `${activeGrantCount} active magic link${activeGrantCount === 1 ? "" : "s"}`
                : "Configure TTL, permissions, and grants"
            }
            icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
            headerRight={headerRight}
            description={
              <>
                Magic-link TTL, grant permission (view vs upload), expiration,
                and active{" "}
                <code className="rounded bg-muted px-1 text-[10px]">
                  clientPortalGrants
                </code>{" "}
                rows for this file.
              </>
            }
          >
            <ClientPortalInviteBlock
              layout="tab"
              pipelineFileId={fileId}
              memberUserKey={memberUserKey}
            />
          </ClientPortalCollapsibleSection>
        );
      case "uploadsInbox":
        return (
          <ClientPortalCollapsibleSection
            id={anchorId}
            title={CLIENT_PORTAL_SECTION_LABELS.uploadsInbox}
            status="Inbox"
            summary="Consumer portal uploads — separate from Document Vault"
            icon={<Inbox className="h-4 w-4" aria-hidden />}
            headerRight={headerRight}
            description={
              <>
                <Inbox
                  className="mr-1 inline h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                Consumer files submitted through the external portal land in a
                separate stream from your Document Vault.
              </>
            }
          >
            <ClientPortalUploadsInbox
              pipelineFileId={fileId}
              memberUserKey={memberUserKey}
              onNavigateToDocuments={onNavigateToDocuments}
            />
          </ClientPortalCollapsibleSection>
        );
      case "communications":
        return (
          <ClientPortalCollapsibleSection
            id={anchorId}
            title="Communications"
            status={communicationsMeta.status}
            summary={communicationsMeta.summary}
            indicatorCount={communicationsMeta.indicatorCount}
            badgeVariant={communicationsMeta.badgeVariant}
            icon={<MessageSquare className="h-4 w-4" aria-hidden />}
            headerRight={headerRight}
            description="Internal file threads plus outbound email and portal messages."
          >
            <div className={premiumTabSectionSpaceClass}>
              <div className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  File messaging
                </h3>
                <FileMessagingPanel
                  embedded
                  pipelineFileId={fileId}
                  memberUserKey={memberUserKey}
                />
              </div>
              {organizationId && memberUserKey ? (
                <div className="space-y-2 border-t border-border/60 pt-6">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Outbound communications
                  </h3>
                  <UnifiedCommunicationPanel
                    organizationId={organizationId}
                    memberUserKey={memberUserKey}
                    relatedPipelineFileId={fileId}
                  />
                </div>
              ) : (
                <p className="border-t border-border/60 pt-6 text-sm text-muted-foreground">
                  Select an organization to compose outbound email and portal
                  messages.
                </p>
              )}
            </div>
          </ClientPortalCollapsibleSection>
        );
      default:
        return null;
    }
  };

  const registerSig = useMemo(
    () =>
      [
        String(activeGrantCount ?? ""),
        portalMeta.status,
        portalMeta.summary,
        communicationsMeta.status,
        communicationsMeta.summary,
        String(communicationsMeta.indicatorCount ?? ""),
        visibleSectionIds.join(","),
      ].join("|"),
    [
      activeGrantCount,
      communicationsMeta,
      portalMeta,
      visibleSectionIds,
    ],
  );

  useLayoutEffect(() => {
    if (!suppressInternalDnd || !onRegisterSections) return;
    const sections: Partial<
      Record<ClientPortalSectionId, ClientPortalSectionRenderer>
    > = {};
    for (const sectionId of CLIENT_PORTAL_SECTION_IDS) {
      sections[sectionId] = (dragHandle) =>
        renderPortalSection(sectionId, dragHandle);
    }
    onRegisterSections(sections, registerSig);
    // renderPortalSection closes over latest access/meta via registerSig.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional register on registerSig
  }, [
    onRegisterSections,
    registerSig,
    suppressInternalDnd,
    fileId,
    memberUserKey,
    organizationId,
  ]);

  if (suppressInternalDnd) {
    return null;
  }

  const sectionsBody =
    visibleSectionIds.length > 0 ? (
      <SortableSectionList
        itemIds={visibleSectionIds}
        onDragEnd={onPortalDragEnd}
      >
        <div
          className={premiumSectionStackClass}
          aria-label="Client portal sections"
        >
          {visibleSectionIds.map((sectionId) => (
            <SortableSectionItem key={sectionId} id={sectionId}>
              {(dragHandle) => renderPortalSection(sectionId, dragHandle)}
            </SortableSectionItem>
          ))}
        </div>
      </SortableSectionList>
    ) : null;

  if (embedded) {
    return (
      <div
        className={cn("min-w-0", className)}
        data-testid="pipeline-portals-client-portal-sections"
      >
        {sectionsBody}
      </div>
    );
  }

  return (
    <div
      id="pipeline-client-portal-control-room"
      className={cn(
        premiumWorkspaceCanvasClass,
        "flex min-w-0 flex-col",
        premiumTabStackClass,
        className,
      )}
      data-testid="pipeline-client-portal-tab"
    >
      <div
        className="flex min-w-0 flex-wrap items-center justify-end gap-2 px-0.5 pb-1"
        data-testid="pipeline-client-portal-tab-toolbar"
      >
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu
            aria-label="Portals layout settings"
            align="start"
            className="min-w-[14rem]"
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 shrink-0 p-0 text-muted-foreground"
                data-testid="pipeline-client-portal-layout-control"
                aria-label="Portals layout settings"
              >
                <Settings2 className="h-4 w-4" aria-hidden />
              </Button>
            }
          >
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Section visibility
            </div>
            <DropdownMenuSeparator />
            {CLIENT_PORTAL_SECTION_IDS.map((sectionId) => (
              <ClientPortalLayoutMenuItem
                key={sectionId}
                sectionId={sectionId}
                label={CLIENT_PORTAL_SECTION_LABELS[sectionId]}
                visible={isClientPortalSectionVisible(portalLayout, sectionId)}
                onToggle={onToggleSectionVisibility}
              />
            ))}
            <DropdownMenuSeparator />
            <button
              type="button"
              role="menuitem"
              data-testid="pipeline-client-portal-layout-reset"
              className={cn(
                "flex w-full min-h-10 items-center px-3 py-2 text-left text-sm text-foreground",
                "transition-colors duration-dlc-short ease-dlc-standard hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
              )}
              onClick={onResetLayout}
            >
              Reset to defaults
            </button>
          </DropdownMenu>
        </div>
        <DealWorkspaceSaveStatus
          saving={saving}
          savedAt={savedAt}
          isDirty={isDirty}
        />
      </div>

      {sectionsBody}
    </div>
  );
}

/** Phase 53.6 — external tab label is "Portals"; alias for symmetry. */
export const PortalsTab = ClientPortalTab;
export type PortalsTabProps = ClientPortalTabProps;
