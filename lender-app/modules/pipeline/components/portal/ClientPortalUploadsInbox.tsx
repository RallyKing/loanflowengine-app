"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { Archive, ExternalLink, FileUp, Inbox, Loader2 } from "lucide-react";
import type { DocumentVaultNavigationFocus } from "@/lib/pipeline/documentVaultNavigation";

export type ClientPortalUploadsInboxProps = {
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  onNavigateToDocuments?: (
    focus: Omit<DocumentVaultNavigationFocus, "nonce">,
  ) => void;
};

type InboxSubTab = "unreviewed" | "archived";

type PortalUploadRow = {
  _id: Id<"clientPortalUploads">;
  fileName: string;
  contentType?: string;
  size?: number;
  createdAt: number;
  reviewStatus: "unreviewed" | "archived";
  clientEmail: string | null;
  promotedLibraryDocumentId: Id<"libraryDocuments"> | null;
};

function formatUploadSize(bytes: number | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function effectiveReviewStatus(
  row: PortalUploadRow,
  optimistic: ReadonlyMap<Id<"clientPortalUploads">, "unreviewed" | "archived">,
): "unreviewed" | "archived" {
  return optimistic.get(row._id) ?? row.reviewStatus;
}

function effectivePromotedLibraryDocumentId(
  row: PortalUploadRow,
  optimistic: ReadonlyMap<
    Id<"clientPortalUploads">,
    Id<"libraryDocuments">
  >,
): Id<"libraryDocuments"> | null {
  return optimistic.get(row._id) ?? row.promotedLibraryDocumentId;
}

export function ClientPortalUploadsInbox({
  pipelineFileId,
  memberUserKey,
  onNavigateToDocuments,
}: ClientPortalUploadsInboxProps) {
  const [activeSubTab, setActiveSubTab] = useState<InboxSubTab>("unreviewed");
  const [optimisticStatus, setOptimisticStatus] = useState<
    Map<Id<"clientPortalUploads">, "unreviewed" | "archived">
  >(() => new Map());
  const [optimisticPromoted, setOptimisticPromoted] = useState<
    Map<Id<"clientPortalUploads">, Id<"libraryDocuments">>
  >(() => new Map());
  const [busyIds, setBusyIds] = useState<Set<Id<"clientPortalUploads">>>(
    () => new Set(),
  );
  const [promotingIds, setPromotingIds] = useState<
    Set<Id<"clientPortalUploads">>
  >(() => new Set());
  const [actionErr, setActionErr] = useState<string | null>(null);

  const qArgs = useMemo(
    () =>
      memberUserKey
        ? { pipelineFileId, memberUserKey }
        : { pipelineFileId },
    [pipelineFileId, memberUserKey],
  );

  const uploads = useQuery(api.clientPortalAdmin.listPortalUploadsForBroker, qArgs);
  const updateStatus = useMutation(api.clientPortalAdmin.updatePortalUploadStatus);
  const promoteUpload = useMutation(
    api.clientPortalAdmin.promotePortalUploadToLibrary,
  );

  const rows = useMemo(() => uploads ?? [], [uploads]);

  useEffect(() => {
    if (uploads === undefined) return;
    setOptimisticStatus((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      for (const row of uploads) {
        if (next.get(row._id) === row.reviewStatus) {
          next.delete(row._id);
        }
      }
      return next.size === prev.size ? prev : next;
    });
    setOptimisticPromoted((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      for (const row of uploads) {
        const serverId = row.promotedLibraryDocumentId;
        if (serverId && next.get(row._id) === serverId) {
          next.delete(row._id);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [uploads]);

  const unreviewedRows = useMemo(
    () =>
      rows.filter(
        (row) => effectiveReviewStatus(row, optimisticStatus) === "unreviewed",
      ),
    [rows, optimisticStatus],
  );

  const archivedRows = useMemo(
    () =>
      rows.filter(
        (row) => effectiveReviewStatus(row, optimisticStatus) === "archived",
      ),
    [rows, optimisticStatus],
  );

  const handleArchive = useCallback(
    async (uploadId: Id<"clientPortalUploads">) => {
      if (!memberUserKey) return;
      setActionErr(null);
      setOptimisticStatus((prev) => {
        const next = new Map(prev);
        next.set(uploadId, "archived");
        return next;
      });
      setBusyIds((prev) => new Set(prev).add(uploadId));
      try {
        await updateStatus({
          uploadId,
          status: "archived",
          memberUserKey,
        });
      } catch (e) {
        setOptimisticStatus((prev) => {
          const next = new Map(prev);
          next.delete(uploadId);
          return next;
        });
        setActionErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(uploadId);
          return next;
        });
      }
    },
    [memberUserKey, updateStatus],
  );

  const handlePromote = useCallback(
    async (uploadId: Id<"clientPortalUploads">) => {
      if (!memberUserKey) return;
      setActionErr(null);
      setOptimisticStatus((prev) => {
        const next = new Map(prev);
        next.set(uploadId, "archived");
        return next;
      });
      setPromotingIds((prev) => new Set(prev).add(uploadId));
      setBusyIds((prev) => new Set(prev).add(uploadId));
      try {
        const res = await promoteUpload({
          uploadId,
          pipelineFileId,
          memberUserKey,
        });
        setOptimisticPromoted((prev) => {
          const next = new Map(prev);
          next.set(uploadId, res.libraryDocumentId);
          return next;
        });
      } catch (e) {
        setOptimisticStatus((prev) => {
          const next = new Map(prev);
          next.delete(uploadId);
          return next;
        });
        setActionErr(e instanceof Error ? e.message : String(e));
      } finally {
        setPromotingIds((prev) => {
          const next = new Set(prev);
          next.delete(uploadId);
          return next;
        });
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(uploadId);
          return next;
        });
      }
    },
    [memberUserKey, pipelineFileId, promoteUpload],
  );

  if (!memberUserKey) {
    return (
      <p className="text-xs text-muted-foreground">
        Sign in with your workspace account to review client uploads.
      </p>
    );
  }

  const subTabs: { id: InboxSubTab; label: string; count: number }[] = [
    {
      id: "unreviewed",
      label: "Action required",
      count: unreviewedRows.length,
    },
    {
      id: "archived",
      label: "Archived",
      count: archivedRows.length,
    },
  ];

  const visibleRows =
    activeSubTab === "unreviewed" ? unreviewedRows : archivedRows;

  return (
    <div
      className="dlc-surface-card min-w-0 rounded-dlc-md border border-border/80"
      data-testid="pipeline-portal-uploads-inbox-panel"
    >
      <div
        className="flex flex-wrap items-center gap-1 border-b border-border/70 px-2 py-2 sm:px-3"
        role="tablist"
        aria-label="Client upload triage"
        data-testid="pipeline-portal-uploads-inbox-tabs"
      >
        {subTabs.map((tab) => {
          const selected = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              data-testid={`pipeline-portal-uploads-tab-${tab.id}`}
              onClick={() => setActiveSubTab(tab.id)}
              className={cn(
                "inline-flex min-h-[2.25rem] shrink-0 items-center gap-1.5 rounded-dlc-sm px-2.5 py-1.5 text-xs font-semibold transition-colors duration-dlc-short ease-dlc-standard touch-manipulation sm:px-3",
                selected
                  ? "bg-dlc-surface-high text-foreground shadow-dlc-1"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  selected
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {uploads === undefined ? "…" : tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="px-3 py-3 sm:px-4 sm:py-4"
        role="tabpanel"
        data-testid={`pipeline-portal-uploads-panel-${activeSubTab}`}
      >
        {actionErr ? (
          <p className="mb-3 text-xs text-destructive" role="alert">
            {actionErr}
          </p>
        ) : null}

        {uploads === undefined ? (
          <p className="text-xs text-muted-foreground">Loading uploads…</p>
        ) : visibleRows.length === 0 ? (
          <div
            className="rounded-dlc-md border border-dashed border-border/60 bg-dlc-surface-high/40 px-4 py-8 text-center"
            data-testid="pipeline-portal-uploads-empty"
          >
            <Inbox
              className="mx-auto h-8 w-8 text-muted-foreground/60"
              aria-hidden
            />
            <p className="mt-2 text-sm font-medium text-foreground">
              {activeSubTab === "unreviewed"
                ? "No uploads waiting for review"
                : "No archived uploads yet"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              {activeSubTab === "unreviewed"
                ? "Consumer files from the external portal appear here newest first."
                : "Dismissed or promoted uploads move here — out of your active queue."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2" data-testid="pipeline-portal-uploads-list">
            {visibleRows.map((row) => {
              const isBusy = busyIds.has(row._id);
              const isPromoting = promotingIds.has(row._id);
              const promotedId = effectivePromotedLibraryDocumentId(
                row,
                optimisticPromoted,
              );

              return (
                <li
                  key={row._id}
                  className={cn(
                    "rounded-dlc-md border border-border/70 bg-background/60 px-3 py-2.5 transition-opacity duration-dlc-short",
                    isBusy && "opacity-70",
                  )}
                  data-testid={`pipeline-portal-upload-row-${row._id}`}
                  aria-busy={isBusy}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-2.5">
                      <FileUp
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {row.fileName}
                        </div>
                        <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          <div>
                            <dt className="sr-only">Size</dt>
                            <dd>{formatUploadSize(row.size)}</dd>
                          </div>
                          <div>
                            <dt className="sr-only">Uploaded</dt>
                            <dd>
                              {new Date(row.createdAt).toLocaleString()}
                            </dd>
                          </div>
                          {row.clientEmail ? (
                            <div>
                              <dt className="sr-only">Client</dt>
                              <dd className="truncate">{row.clientEmail}</dd>
                            </div>
                          ) : null}
                        </dl>
                        {activeSubTab === "archived" && promotedId ? (
                          <div className="mt-2">
                            {onNavigateToDocuments ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-dlc-sm bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/15"
                                data-testid={`pipeline-portal-upload-view-documents-${row._id}`}
                                onClick={() =>
                                  onNavigateToDocuments({
                                    category: "client_submitted",
                                    highlightDocumentId: promotedId,
                                  })
                                }
                              >
                                <ExternalLink
                                  className="h-3 w-3 shrink-0"
                                  aria-hidden
                                />
                                View in Documents
                              </button>
                            ) : (
                              <span
                                className="inline-flex items-center rounded-dlc-sm bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
                                data-testid={`pipeline-portal-upload-promoted-badge-${row._id}`}
                              >
                                Promoted to vault
                              </span>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {activeSubTab === "unreviewed" ? (
                      <div
                        className="flex shrink-0 flex-wrap gap-2"
                        data-testid={`pipeline-portal-upload-actions-${row._id}`}
                      >
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1.5"
                          disabled={isBusy}
                          data-testid={`pipeline-portal-upload-promote-${row._id}`}
                          onClick={() => void handlePromote(row._id)}
                        >
                          {isPromoting ? (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin"
                              aria-hidden
                            />
                          ) : null}
                          {isPromoting ? "Promoting…" : "Promote to Vault"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={isBusy}
                          data-testid={`pipeline-portal-upload-archive-${row._id}`}
                          onClick={() => void handleArchive(row._id)}
                        >
                          <Archive className="h-3.5 w-3.5" aria-hidden />
                          {busyIds.has(row._id) && !isPromoting
                            ? "Archiving…"
                            : "Dismiss / Archive"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
