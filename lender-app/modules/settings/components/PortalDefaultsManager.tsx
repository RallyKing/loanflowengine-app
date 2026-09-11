"use client";

/**
 * Settings → Portal defaults editor.
 * CRUD for org-scoped portal default templates (client / lender / referrer / deal partner).
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Archive, LayoutTemplate, Pencil, Plus, RotateCcw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { cn } from "@/lib/cn";
import {
  PORTAL_DEFAULT_TYPES,
  PORTAL_DEFAULT_TYPE_LABELS,
  emptyPortalDefaultConfig,
  summarizePortalDefaultConfig,
  type PortalDefaultConfig,
  type PortalDefaultType,
} from "@/lib/portalDefaults";
import { PORTAL_REQUEST_CHECKLISTS } from "@/lib/portalRequestChecklists";

type ChecklistDraftItem = {
  title: string;
  description: string;
  folderName: string;
};

type EditorState = {
  id: Id<"portalDefaults"> | null;
  name: string;
  description: string;
  portalType: PortalDefaultType;
  config: PortalDefaultConfig;
  customChecklist: ChecklistDraftItem[];
};

function blankEditor(portalType: PortalDefaultType = "client"): EditorState {
  return {
    id: null,
    name: "",
    description: "",
    portalType,
    config: emptyPortalDefaultConfig(portalType),
    customChecklist: [],
  };
}

export function PortalDefaultsManager() {
  const { confirm } = useOperationalConfirm();
  const orgScope = useOrgConvexQueryArgs();
  const [typeFilter, setTypeFilter] = useState<PortalDefaultType | "all">(
    "all",
  );
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listArgs = orgScope
    ? {
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        includeArchived: showArchived,
        ...(typeFilter !== "all" ? { portalType: typeFilter } : {}),
      }
    : "skip";

  const rows = useQuery(api.portalDefaults.listForOrganization, listArgs);
  const createM = useMutation(api.portalDefaults.create);
  const updateM = useMutation(api.portalDefaults.update);
  const archiveM = useMutation(api.portalDefaults.archive);
  const restoreM = useMutation(api.portalDefaults.restore);

  const filtered = useMemo(() => rows ?? [], [rows]);

  const openCreate = useCallback((portalType: PortalDefaultType) => {
    setError(null);
    setEditor(blankEditor(portalType));
  }, []);

  const openEdit = useCallback(
    (row: NonNullable<typeof rows>[number]) => {
      setError(null);
      const base = emptyPortalDefaultConfig(row.portalType);
      const raw =
        row.config && typeof row.config === "object"
          ? (row.config as PortalDefaultConfig)
          : {};
      const merged: PortalDefaultConfig = { ...base, ...raw };
      const custom = (merged.requestChecklist ?? []).map((item) => ({
        title: item?.title ?? "",
        description: item?.description ?? "",
        folderName: item?.folderName ?? "",
      }));
      setEditor({
        id: row._id,
        name: row.name ?? "",
        description: row.description ?? "",
        portalType: row.portalType,
        config: merged,
        customChecklist: custom,
      });
    },
    [rows],
  );

  const patchConfig = useCallback(
    (patch: Partial<PortalDefaultConfig>) => {
      setEditor((prev) =>
        prev ? { ...prev, config: { ...prev.config, ...patch } } : prev,
      );
    },
    [],
  );

  const save = useCallback(async () => {
    if (!orgScope || !editor) return;
    const name = editor.name.trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const config: PortalDefaultConfig = { ...editor.config };
      if (editor.portalType === "client") {
        const custom = editor.customChecklist
          .map((item) => ({
            title: item.title.trim(),
            description: item.description.trim() || undefined,
            folderName: item.folderName.trim() || undefined,
          }))
          .filter((item) => item.title);
        if (custom.length > 0 && !config.checklistId) {
          config.requestChecklist = custom;
        } else if (config.checklistId) {
          config.requestChecklist = undefined;
        }
      }
      if (editor.id) {
        await updateM({
          id: editor.id,
          name,
          description: editor.description.trim() || undefined,
          config,
          memberUserKey: orgScope.memberUserKey,
        });
      } else {
        await createM({
          organizationId: orgScope.organizationId,
          name,
          description: editor.description.trim() || undefined,
          portalType: editor.portalType,
          config,
          memberUserKey: orgScope.memberUserKey,
        });
      }
      setEditor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }, [createM, editor, orgScope, updateM]);

  const onArchive = useCallback(
    async (id: Id<"portalDefaults">, name: string) => {
      if (!orgScope) return;
      const ok = await confirm(
        simpleDeleteConfirm(name, {
          title: "Archive portal default?",
          impact:
            "Archived defaults stay in history but cannot be newly assigned. Existing contact assignments keep the id until cleared.",
          confirmLabel: "Archive",
          variant: "delete",
        }),
      );
      if (!ok) return;
      setBusy(true);
      try {
        await archiveM({ id, memberUserKey: orgScope.memberUserKey });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Archive failed");
      } finally {
        setBusy(false);
      }
    },
    [archiveM, confirm, orgScope],
  );

  const onRestore = useCallback(
    async (id: Id<"portalDefaults">) => {
      if (!orgScope) return;
      setBusy(true);
      try {
        await restoreM({ id, memberUserKey: orgScope.memberUserKey });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Restore failed");
      } finally {
        setBusy(false);
      }
    },
    [orgScope, restoreM],
  );

  if (!orgScope) {
    return (
      <p className="text-sm text-muted-foreground">
        Organization context is required to manage portal defaults.
      </p>
    );
  }

  return (
    <div className="space-y-6" data-testid="portal-defaults-manager">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Filter by portal type"
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(
                e.target.value === "all"
                  ? "all"
                  : (e.target.value as PortalDefaultType),
              )
            }
            className="min-h-10 w-full max-w-xs sm:w-48"
          >
            <option value="all">All types</option>
            {PORTAL_DEFAULT_TYPES.map((t) => (
              <option key={t} value={t}>
                {PORTAL_DEFAULT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
          <label className="inline-flex min-h-10 items-center gap-2 rounded-dlc-md border border-border bg-background px-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Show archived
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {PORTAL_DEFAULT_TYPES.map((t) => (
            <Button
              key={t}
              type="button"
              variant="outline"
              className="min-h-10"
              onClick={() => openCreate(t)}
              data-testid={`portal-defaults-new-${t}`}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              New {PORTAL_DEFAULT_TYPE_LABELS[t].toLowerCase()}
            </Button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="rounded-dlc-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {editor ? (
        <div
          className="space-y-4 rounded-dlc-lg border border-border bg-dlc-surface-high p-4 shadow-dlc-1 sm:p-5"
          data-testid="portal-defaults-editor"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {editor.id ? "Edit portal default" : "New portal default"}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {PORTAL_DEFAULT_TYPE_LABELS[editor.portalType]} template
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditor(null)}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Label htmlFor="pd-name">
              Name
              <Input
                id="pd-name"
                value={editor.name}
                onChange={(e) => {
                  // Capture before setState — React nulls currentTarget after the handler.
                  const name = e.currentTarget.value;
                  setEditor((p) => (p ? { ...p, name } : p));
                }}
                placeholder="e.g. Standard borrower invite"
                className="mt-1.5 min-h-10"
                disabled={busy}
              />
            </Label>
            {!editor.id ? (
              <Label htmlFor="pd-type">
                Portal type
                <Select
                  id="pd-type"
                  value={editor.portalType}
                  onChange={(e) => {
                    const portalType = e.target.value as PortalDefaultType;
                    setEditor((p) =>
                      p
                        ? {
                            ...p,
                            portalType,
                            config: emptyPortalDefaultConfig(portalType),
                            customChecklist: [],
                          }
                        : p,
                    );
                  }}
                  className="mt-1.5 min-h-10"
                  disabled={busy}
                >
                  {PORTAL_DEFAULT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {PORTAL_DEFAULT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Label>
            ) : (
              <div>
                <p className="text-sm font-medium text-foreground">Portal type</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {PORTAL_DEFAULT_TYPE_LABELS[editor.portalType]}
                </p>
              </div>
            )}
          </div>

          <Label htmlFor="pd-desc">
            Description
            <Textarea
              id="pd-desc"
              value={editor.description}
              onChange={(e) => {
                const description = e.currentTarget.value;
                setEditor((p) => (p ? { ...p, description } : p));
              }}
              rows={2}
              className="mt-1.5"
              disabled={busy}
              placeholder="Optional notes for your team"
            />
          </Label>

          <Label htmlFor="pd-welcome">
            Welcome message
            <Textarea
              id="pd-welcome"
              value={editor.config.welcomeMessage ?? ""}
              onChange={(e) => {
                const welcomeMessage = e.currentTarget.value;
                patchConfig({ welcomeMessage });
              }}
              rows={3}
              className="mt-1.5"
              disabled={busy}
              placeholder="Shown when the recipient opens their portal"
            />
          </Label>

          {editor.portalType === "client" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Label htmlFor="pd-perm">
                Permission
                <Select
                  id="pd-perm"
                  value={editor.config.permission ?? "view_upload"}
                  onChange={(e) =>
                    patchConfig({
                      permission: e.target.value as "view" | "view_upload",
                    })
                  }
                  className="mt-1.5 min-h-10"
                  disabled={busy}
                >
                  <option value="view">View only</option>
                  <option value="view_upload">View + upload</option>
                </Select>
              </Label>
              <Label htmlFor="pd-link-exp">
                Link expiry
                <Select
                  id="pd-link-exp"
                  value={editor.config.linkExpiresPreset ?? "24h"}
                  onChange={(e) =>
                    patchConfig({
                      linkExpiresPreset: e.target.value as
                        | "1h"
                        | "24h"
                        | "7d"
                        | "30d",
                    })
                  }
                  className="mt-1.5 min-h-10"
                  disabled={busy}
                >
                  <option value="1h">1 hour</option>
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                </Select>
              </Label>
              <Label htmlFor="pd-grant-exp">
                Grant access
                <Select
                  id="pd-grant-exp"
                  value={editor.config.grantExpiresPreset ?? "never"}
                  onChange={(e) =>
                    patchConfig({
                      grantExpiresPreset: e.target.value as
                        | "never"
                        | "30d"
                        | "90d",
                    })
                  }
                  className="mt-1.5 min-h-10"
                  disabled={busy}
                >
                  <option value="never">Until revoked</option>
                  <option value="30d">30 days</option>
                  <option value="90d">90 days</option>
                </Select>
              </Label>
              <Label htmlFor="pd-checklist">
                Document checklist
                <Select
                  id="pd-checklist"
                  value={editor.config.checklistId ?? ""}
                  onChange={(e) =>
                    patchConfig({
                      checklistId: e.target.value || undefined,
                    })
                  }
                  className="mt-1.5 min-h-10"
                  disabled={busy}
                >
                  <option value="">Custom items below</option>
                  {PORTAL_REQUEST_CHECKLISTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Label>
              {!editor.config.checklistId ? (
                <div className="sm:col-span-2 space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Custom request items
                  </p>
                  {editor.customChecklist.map((item, idx) => (
                    <div
                      key={idx}
                      className="grid gap-2 rounded-dlc-md border border-border/70 p-3 sm:grid-cols-3"
                    >
                      <Input
                        value={item.title}
                        placeholder="Title"
                        className="min-h-10"
                        onChange={(e) => {
                          const title = e.currentTarget.value;
                          setEditor((p) => {
                            if (!p) return p;
                            const next = [...p.customChecklist];
                            next[idx] = { ...next[idx]!, title };
                            return { ...p, customChecklist: next };
                          });
                        }}
                      />
                      <Input
                        value={item.description}
                        placeholder="Description"
                        className="min-h-10"
                        onChange={(e) => {
                          const description = e.currentTarget.value;
                          setEditor((p) => {
                            if (!p) return p;
                            const next = [...p.customChecklist];
                            next[idx] = { ...next[idx]!, description };
                            return { ...p, customChecklist: next };
                          });
                        }}
                      />
                      <Input
                        value={item.folderName}
                        placeholder="Vault folder"
                        className="min-h-10"
                        onChange={(e) => {
                          const folderName = e.currentTarget.value;
                          setEditor((p) => {
                            if (!p) return p;
                            const next = [...p.customChecklist];
                            next[idx] = { ...next[idx]!, folderName };
                            return { ...p, customChecklist: next };
                          });
                        }}
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-10"
                    onClick={() =>
                      setEditor((p) =>
                        p
                          ? {
                              ...p,
                              customChecklist: [
                                ...p.customChecklist,
                                { title: "", description: "", folderName: "" },
                              ],
                            }
                          : p,
                      )
                    }
                  >
                    Add request item
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {editor.portalType === "lender" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Label htmlFor="pd-lender-perm">
                Delivery permission
                <Select
                  id="pd-lender-perm"
                  value={editor.config.lenderPermission ?? "view_only"}
                  onChange={(e) =>
                    patchConfig({
                      lenderPermission: e.target.value as
                        | "view_only"
                        | "downloadable",
                    })
                  }
                  className="mt-1.5 min-h-10"
                  disabled={busy}
                >
                  <option value="view_only">View only</option>
                  <option value="downloadable">Downloadable</option>
                </Select>
              </Label>
              <label className="mt-6 inline-flex min-h-10 items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={Boolean(editor.config.includeAllDocumentsByDefault)}
                  onChange={(e) =>
                    patchConfig({
                      includeAllDocumentsByDefault: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-border"
                  disabled={busy}
                />
                Include all file documents by default
              </label>
            </div>
          ) : null}

          {editor.portalType === "referrer" ||
          editor.portalType === "deal_partner" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="inline-flex min-h-10 items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={Boolean(editor.config.showDealSummary)}
                  onChange={(e) =>
                    patchConfig({ showDealSummary: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-border"
                  disabled={busy}
                />
                Show deal summary
              </label>
              <label className="inline-flex min-h-10 items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={Boolean(editor.config.allowMessaging)}
                  onChange={(e) =>
                    patchConfig({ allowMessaging: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-border"
                  disabled={busy}
                />
                Allow messaging
              </label>
              <Label htmlFor="pd-status-vis">
                Status visibility
                <Select
                  id="pd-status-vis"
                  value={editor.config.statusVisibility ?? "basic"}
                  onChange={(e) =>
                    patchConfig({
                      statusVisibility: e.target.value as
                        | "basic"
                        | "detailed",
                    })
                  }
                  className="mt-1.5 min-h-10"
                  disabled={busy}
                >
                  <option value="basic">Basic</option>
                  <option value="detailed">Detailed</option>
                </Select>
              </Label>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              data-testid="portal-defaults-save"
            >
              {busy ? "Saving…" : editor.id ? "Save changes" : "Create default"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Saved defaults
          {rows === undefined ? "…" : ` (${filtered.length})`}
        </h2>
        {rows === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="rounded-dlc-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No portal defaults yet. Create one for each role type your team
            invites.
          </p>
        ) : (
          <ul className="divide-y divide-border/70 rounded-dlc-lg border border-border bg-dlc-surface">
            {filtered.map((row) => (
              <li
                key={row._id}
                className={cn(
                  "flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                  row.archivedAt != null && "opacity-60",
                )}
                data-testid={`portal-default-row-${row._id}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {row.name}
                    </p>
                    <span className="rounded-dlc-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {PORTAL_DEFAULT_TYPE_LABELS[row.portalType]}
                    </span>
                    {row.archivedAt != null ? (
                      <span className="text-xs text-amber-700">Archived</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {"sectionSummary" in row && row.sectionSummary
                      ? String(row.sectionSummary)
                      : summarizePortalDefaultConfig(
                          row.portalType,
                          row.config as PortalDefaultConfig,
                        )}
                  </p>
                  {row.description ? (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {row.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.archivedAt == null ? (
                    <>
                      <Link
                        href={`/settings/portal-defaults/${row._id}/builder`}
                        data-testid={`portal-defaults-builder-${row._id}`}
                        className="inline-flex min-h-10 items-center justify-center rounded-dlc-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-dlc-1 transition-colors hover:bg-primary/90"
                      >
                        <LayoutTemplate
                          className="mr-1.5 h-3.5 w-3.5"
                          aria-hidden
                        />
                        Page builder
                      </Link>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-10"
                        onClick={() => openEdit(row)}
                        disabled={busy}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        Invite settings
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-10 text-destructive"
                        onClick={() => void onArchive(row._id, row.name)}
                        disabled={busy}
                      >
                        <Archive className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        Archive
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-10"
                      onClick={() => void onRestore(row._id)}
                      disabled={busy}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Restore
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Assign defaults on a{" "}
        <Link href="/contacts" className="text-primary underline">
          contact
        </Link>
        . Linked contacts then appear under Portals &amp; Progress on the
        pipeline file.
      </p>
    </div>
  );
}
