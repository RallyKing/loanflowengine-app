"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { AttachmentPreviewDialog } from "@/components/AttachmentPreviewDialog";
import { OperationalCheckbox } from "@/components/ui/OperationalCheckbox";
import {
  MAX_LENDER_ATTACHMENT_BYTES,
  uploadLocalFilesViaConvexUrl,
} from "@/lib/uploadToConvexStorage";
import {
  downloadRemoteFile,
  downloadRemoteFilesZip,
} from "@/lib/library/downloadVaultDocumentsZip";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { unlinkConfirm } from "@/lib/ui/confirmDestructive";

type LenderFileRow = {
  _id: Id<"lenderAttachments">;
  fileName: string;
  contentType: string | undefined;
  size: number | undefined;
  label: string | undefined;
  notes: string | undefined;
  groupName: string | undefined;
  previewScale: number | undefined;
  createdAt: number;
  url: string | null;
};

function formatSize(n: number | undefined) {
  if (n == null || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function LenderDocsTab({
  lenderId,
  canUseHub,
  actionTitle,
}: {
  lenderId: Id<"lenders">;
  canUseHub: boolean;
  actionTitle: (hint: string) => string;
}) {
  const orgScope = useOrgConvexQueryArgs();
  const { confirm } = useOperationalConfirm();
  const listArgs = orgScope
    ? {
        lenderId,
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
      }
    : { lenderId };
  const files = useQuery(api.lenderFiles.list, listArgs);
  const generateUploadUrl = useMutation(api.lenderFiles.generateUploadUrl);
  const addFileM = useMutation(api.lenderFiles.addFile);
  const removeFileM = useMutation(api.lenderFiles.removeFile);
  const updateFileMetaM = useMutation(api.lenderFiles.updateFileMeta);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<LenderFileRow | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadGroup, setUploadGroup] = useState("");
  const [filterGroup, setFilterGroup] = useState<string>("__all__");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [downloadBusy, setDownloadBusy] = useState(false);

  const rows = (files ?? []) as LenderFileRow[];

  const groupNames = useMemo(() => {
    const set = new Set<string>();
    for (const f of rows) {
      if (f.groupName?.trim()) set.add(f.groupName.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const visible = useMemo(() => {
    if (filterGroup === "__all__") return rows;
    if (filterGroup === "__ungrouped__") {
      return rows.filter((r) => !r.groupName?.trim());
    }
    return rows.filter((r) => (r.groupName ?? "").trim() === filterGroup);
  }, [rows, filterGroup]);

  const grouped = useMemo(() => {
    const map = new Map<string, LenderFileRow[]>();
    for (const r of visible) {
      const key = r.groupName?.trim() || "Ungrouped";
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === "Ungrouped") return 1;
      if (b === "Ungrouped") return -1;
      return a.localeCompare(b);
    });
  }, [visible]);

  const downloadableVisible = useMemo(
    () => visible.filter((r) => Boolean(r.url)),
    [visible],
  );

  const selectedDownloadable = useMemo(
    () =>
      rows.filter((r) => selectedIds.has(String(r._id)) && Boolean(r.url)),
    [rows, selectedIds],
  );

  // Drop selection for files that no longer exist.
  useEffect(() => {
    if (files === undefined) return;
    const live = new Set(
      (files as LenderFileRow[]).map((r) => String(r._id)),
    );
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [files]);

  const allVisibleSelected =
    downloadableVisible.length > 0 &&
    downloadableVisible.every((r) => selectedIds.has(String(r._id)));

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const r of downloadableVisible) next.delete(String(r._id));
      } else {
        for (const r of downloadableVisible) next.add(String(r._id));
      }
      return next;
    });
  }

  async function processFiles(raw: File[]) {
    if (!raw.length || !canUseHub) return;
    setUploading(true);
    setErr(null);
    try {
      const { ok, failures, attempted } = await uploadLocalFilesViaConvexUrl({
        files: raw,
        generateUploadUrl: () => generateUploadUrl({}),
        onProgress: (current, total) => setUploadProgress({ current, total }),
        commitEach: async ({ storageId, fileName, contentType, size }) => {
          await addFileM({
            lenderId,
            storageId: storageId as Id<"_storage">,
            fileName,
            contentType,
            size,
            groupName: uploadGroup.trim() || undefined,
            ...(orgScope
              ? {
                  organizationId: orgScope.organizationId,
                  memberUserKey: orgScope.memberUserKey,
                }
              : {}),
          });
        },
      });
      if (failures.length > 0) {
        if (ok === 0) {
          setErr(
            attempted > 1
              ? `Upload failed: ${failures.join("; ")}`
              : failures[0] ?? "Upload failed",
          );
        } else {
          setErr(
            `Uploaded ${ok} of ${attempted} file(s). Not attached: ${failures.join("; ")}`,
          );
        }
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function patchMeta(
    id: Id<"lenderAttachments">,
    patch: {
      fileName?: string;
      label?: string;
      notes?: string;
      groupName?: string | null;
      previewScale?: number | null;
    },
  ) {
    await updateFileMetaM({
      id,
      ...patch,
      ...(orgScope
        ? {
            organizationId: orgScope.organizationId,
            memberUserKey: orgScope.memberUserKey,
          }
        : {}),
    });
  }

  async function handleDownloadOne(row: LenderFileRow) {
    if (!row.url) return;
    setErr(null);
    setDownloadBusy(true);
    try {
      await downloadRemoteFile(row.url, row.fileName);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloadBusy(false);
    }
  }

  async function handleBulkDownload() {
    if (selectedDownloadable.length === 0) return;
    setErr(null);
    setDownloadBusy(true);
    try {
      if (selectedDownloadable.length === 1) {
        const only = selectedDownloadable[0]!;
        await downloadRemoteFile(only.url!, only.fileName);
      } else {
        await downloadRemoteFilesZip(
          selectedDownloadable.map((r) => ({
            fileName: r.fileName,
            url: r.url!,
            zipPath: r.groupName?.trim()
              ? `${r.groupName.trim()}/${r.fileName}`
              : r.fileName,
          })),
          "lender-documents.zip",
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Bulk download failed");
    } finally {
      setDownloadBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <AttachmentPreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        actionTitle={actionTitle}
        onPreviewScaleChange={(scale) => {
          if (!previewFile) return;
          setPreviewFile({ ...previewFile, previewScale: scale });
          void patchMeta(previewFile._id, { previewScale: scale });
        }}
      />

      <p className="text-xs text-muted-foreground">
        Term sheets, guidelines, and other lender documents. Retitle, annotate,
        group, and resize preview. Per file up to{" "}
        {Math.round(MAX_LENDER_ATTACHMENT_BYTES / (1024 * 1024))} MB.
      </p>

      {!canUseHub && (
        <p
          className="rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          Connect to Convex to upload or edit documents.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[8rem] flex-1">
          <Label>Upload into group</Label>
          <Input
            className="mt-1"
            placeholder="e.g. Rate sheets"
            value={uploadGroup}
            onChange={(e) => setUploadGroup(e.target.value)}
            disabled={!canUseHub}
            list="lender-doc-groups"
          />
          <datalist id="lender-doc-groups">
            {groupNames.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
        <div className="min-w-[8rem]">
          <Label>Filter</Label>
          <select
            className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            aria-label="Filter documents by group"
          >
            <option value="__all__">All groups</option>
            <option value="__ungrouped__">Ungrouped</option>
            {groupNames.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className={`rounded-md border border-dashed p-3 transition-colors ${
          dragActive && canUseHub && !uploading
            ? "border-primary bg-primary/5"
            : "border-border/80 bg-muted/10"
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (canUseHub && !uploading) setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (canUseHub && !uploading) setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
          if (!canUseHub || uploading) return;
          void processFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Drop files here or add from device</span>
          </div>
          <div className="relative inline-flex h-10 shrink-0">
            <input
              type="file"
              multiple
              disabled={!canUseHub || uploading}
              onChange={(e) => {
                const arr = e.target.files ? Array.from(e.target.files) : [];
                void processFiles(arr);
                e.target.value = "";
              }}
              className="absolute inset-0 z-10 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              aria-label="Upload documents"
              title={actionTitle("Add documents to this lender")}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              tabIndex={-1}
              aria-hidden
              className="pointer-events-none relative z-0 min-w-[6.5rem]"
              disabled={!canUseHub || uploading}
            >
              <Paperclip className="h-3.5 w-3.5" />
              {uploading
                ? uploadProgress
                  ? `Uploading ${uploadProgress.current} / ${uploadProgress.total}…`
                  : "Uploading…"
                : "Add file(s)"}
            </Button>
          </div>
        </div>
      </div>

      {err && (
        <p className="text-xs text-destructive" role="alert">
          {err}
        </p>
      )}

      {files === undefined ? (
        <p className="text-sm text-muted-foreground">Loading documents…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents yet.</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No documents in this group filter.
        </p>
      ) : (
        <div className="space-y-5">
          {downloadableVisible.length > 0 && (
            <div className="sticky top-0 z-[1] flex flex-wrap items-center gap-2 rounded-md border border-border/80 bg-dlc-surface-high/95 px-3 py-2 shadow-dlc-1 backdrop-blur-sm supports-[backdrop-filter]:bg-dlc-surface-high/90">
              <label className="inline-flex min-h-10 items-center gap-2 text-xs font-medium text-foreground">
                <OperationalCheckbox
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate =
                        !allVisibleSelected &&
                        downloadableVisible.some((r) =>
                          selectedIds.has(String(r._id)),
                        );
                    }
                  }}
                  onChange={toggleSelectAllVisible}
                  aria-label="Select all visible documents"
                />
                Select all
              </label>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size} selected
                  </span>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="h-10 min-h-10 gap-1.5 px-3 text-xs sm:h-8 sm:min-h-0"
                    disabled={downloadBusy || selectedDownloadable.length === 0}
                    onClick={() => void handleBulkDownload()}
                    title={actionTitle("Download selected documents")}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {downloadBusy
                      ? "Downloading…"
                      : selectedDownloadable.length > 1
                        ? `Download ZIP (${selectedDownloadable.length})`
                        : "Download selected"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 min-h-10 px-2 text-xs sm:h-8 sm:min-h-0"
                    disabled={downloadBusy}
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear
                  </Button>
                </>
              )}
            </div>
          )}

          {grouped.map(([group, items]) => (
            <section key={group} aria-label={group}>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                {group}
              </h3>
              <ul className="space-y-3">
                {items.map((a) => {
                  const id = String(a._id);
                  const isSelected = selectedIds.has(id);
                  return (
                    <li
                      key={a._id}
                      className={`rounded-md border p-3 ${
                        isSelected
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/80 bg-muted/20"
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                        <div className="flex items-center gap-2 sm:pt-1">
                          <OperationalCheckbox
                            checked={isSelected}
                            disabled={!a.url}
                            onChange={(e) =>
                              toggleSelected(id, e.target.checked)
                            }
                            aria-label={`Select ${a.fileName}`}
                          />
                          <FileText
                            className="hidden h-8 w-8 shrink-0 text-muted-foreground sm:block"
                            aria-hidden
                          />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Input
                              className="h-8 min-w-0 flex-1 text-sm font-medium"
                              defaultValue={a.fileName}
                              title={actionTitle("Retitle document")}
                              readOnly={!canUseHub}
                              onBlur={(e) => {
                                const next = e.target.value.trim();
                                if (!next || next === a.fileName) return;
                                void patchMeta(a._id, { fileName: next });
                              }}
                            />
                            {a.url && (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1 px-2 text-xs"
                                  onClick={() => setPreviewFile(a)}
                                  title={actionTitle("Preview in app")}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  Preview
                                </Button>
                                <a
                                  href={a.url}
                                  download={a.fileName}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium text-primary hover:bg-muted"
                                  title={actionTitle("Open in new tab")}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Open
                                </a>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1 px-2 text-xs"
                                  disabled={downloadBusy}
                                  onClick={() => void handleDownloadOne(a)}
                                  title={actionTitle("Download file")}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  Download
                                </Button>
                              </>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatSize(a.size)}
                            {a.contentType ? ` · ${a.contentType}` : ""}
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Input
                              className="h-8 text-xs"
                              placeholder="Short label"
                              defaultValue={a.label ?? ""}
                              readOnly={!canUseHub}
                              onBlur={(e) => {
                                const next = e.target.value.trim();
                                const cur = a.label?.trim() ?? "";
                                if (next === cur) return;
                                void patchMeta(a._id, {
                                  label: next || undefined,
                                });
                              }}
                            />
                            <Input
                              className="h-8 text-xs"
                              placeholder="Group name"
                              defaultValue={a.groupName ?? ""}
                              readOnly={!canUseHub}
                              list="lender-doc-groups"
                              onBlur={(e) => {
                                const next = e.target.value.trim();
                                const cur = a.groupName?.trim() ?? "";
                                if (next === cur) return;
                                void patchMeta(a._id, {
                                  groupName: next || null,
                                });
                              }}
                            />
                          </div>
                          <Textarea
                            className="min-h-[3rem] text-xs"
                            placeholder="Notes on this document"
                            defaultValue={a.notes ?? ""}
                            readOnly={!canUseHub}
                            rows={2}
                            onBlur={(e) => {
                              const next = e.target.value.trim();
                              const cur = a.notes?.trim() ?? "";
                              if (next === cur) return;
                              void patchMeta(a._id, {
                                notes: next || undefined,
                              });
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0 self-end text-destructive hover:bg-destructive/10 sm:self-start"
                          disabled={!canUseHub}
                          onClick={() => {
                            void (async () => {
                              const ok = await confirm(
                                unlinkConfirm(
                                  a.fileName,
                                  "This file is removed from this lender.",
                                ),
                              );
                              if (!ok) return;
                              await removeFileM({
                                id: a._id,
                                ...(orgScope
                                  ? {
                                      organizationId: orgScope.organizationId,
                                      memberUserKey: orgScope.memberUserKey,
                                    }
                                  : {}),
                              });
                            })();
                          }}
                          title={actionTitle("Remove file")}
                          aria-label={`Remove ${a.fileName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
