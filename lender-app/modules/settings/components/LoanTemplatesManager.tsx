"use client";

/**
 * Phase Modular-E — loan strategy template management (/settings/loan-templates).
 *
 * Full editor over `pipelineFileUserTemplates`: drawer blocks + per-block
 * settings (same editor as the settings hub section), plus workflow extras —
 * default favorites, portal request checklist, and task playbook bindings —
 * consumed by the New File wizard. Built-in strategy templates are read-only.
 */

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { NewFileDrawerTemplateBlocksEditor } from "@/components/NewFileDrawerTemplateBlocksEditor";
import { TemplateBlockRegistryPicker } from "@/components/pipeline/TemplateBlockRegistryPicker";
import {
  hydrateSettingsFromRow,
  rowToIncludedOrder,
  sanitizePersistedSettings,
} from "@/components/UserPipelineFileTemplatesSection";
import {
  ALL_PIPELINE_BLOCK_IDS,
  getMandatoryPipelineBlockIds,
  getPipelineBlock,
  type PipelineBlockId,
} from "@/lib/pipelineBlockRegistry";
import { getEffectiveMandatoryPipelineBlockIds } from "@/lib/pipelineGlobalBlockPolicy";
import {
  buildInitialIncludedOrderForEditor,
  cloneBlockSettings,
  insertBlockAtRegistryPosition,
} from "@/lib/newFileDrawerTemplateEditorState";
import {
  listPipelineFileTemplates,
  type PipelineFileTemplate,
  type PipelineFileTemplateId,
} from "@/lib/pipelineFileTemplates";
import type { UserPreferencesV1 } from "@/lib/userPreferencesModel";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";
import { cn } from "@/lib/cn";

type ChecklistDraftItem = {
  title: string;
  description: string;
  folderName: string;
};

function checklistFromRow(
  row: Doc<"pipelineFileUserTemplates">,
): ChecklistDraftItem[] {
  return (row.portalRequestChecklist ?? []).map((item) => ({
    title: item.title,
    description: item.description ?? "",
    folderName: item.folderName ?? "",
  }));
}

export function LoanTemplatesManager() {
  const { confirm } = useOperationalConfirm();
  const {
    preferences,
    accountId,
    ready: prefsReady,
  } = useUserPreferences();
  const trimmed = accountId.trim();
  const canSync = trimmed.length > 0 && prefsReady;

  const orgScope = useOrgConvexQueryArgs();

  const list = useQuery(
    api.pipelineFileUserTemplates.listByAccountId,
    trimmed ? { accountId: trimmed } : "skip",
  );
  const resolved = useQuery(api.pipelineGlobalBlockConfig.getResolved, {});
  const playbookGroups =
    useQuery(
      api.taskTemplateLibrary.listTemplateGroups,
      orgScope
        ? {
            organizationId: orgScope.organizationId,
            memberUserKey: orgScope.memberUserKey,
          }
        : "skip",
    ) ?? [];

  const createT = useMutation(api.pipelineFileUserTemplates.create);
  const updateT = useMutation(api.pipelineFileUserTemplates.update);
  const removeT = useMutation(api.pipelineFileUserTemplates.remove);

  const nonHideable = useMemo(() => {
    if (resolved === undefined) {
      return new Set(getEffectiveMandatoryPipelineBlockIds(undefined));
    }
    return new Set(
      getEffectiveMandatoryPipelineBlockIds(resolved.adminRequiredBlockIds),
    );
  }, [resolved]);

  const registryMandatory = useMemo(
    () => new Set(getMandatoryPipelineBlockIds()),
    [],
  );

  const [editing, setEditing] = useState<
    | null
    | { mode: "new" }
    | { mode: "edit"; id: Id<"pipelineFileUserTemplates"> }
  >(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [includedOrder, setIncludedOrder] = useState<PipelineBlockId[]>([]);
  const [blockSettings, setBlockSettings] = useState<
    UserPreferencesV1["newFileDrawerSettings"]
  >({});
  const [favoriteIds, setFavoriteIds] = useState<PipelineBlockId[]>([]);
  const [checklist, setChecklist] = useState<ChecklistDraftItem[]>([]);
  const [playbookIds, setPlaybookIds] = useState<Id<"taskTemplateGroups">[]>(
    [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Built-in strategy viewer: which strategy is expanded + its draft toggles. */
  const [viewingBuiltIn, setViewingBuiltIn] =
    useState<PipelineFileTemplateId | null>(null);
  const [builtInDraft, setBuiltInDraft] = useState<PipelineBlockId[]>([]);

  const builtIns = listPipelineFileTemplates();
  const viewedTemplate = viewingBuiltIn
    ? builtIns.find((t) => t.templateId === viewingBuiltIn) ?? null
    : null;

  const openBuiltIn = useCallback(
    (t: PipelineFileTemplate) => {
      let draft = t.includedBlocks.filter((id): id is PipelineBlockId =>
        ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId),
      );
      for (const id of nonHideable) {
        draft = insertBlockAtRegistryPosition(draft, id);
      }
      setViewingBuiltIn(t.templateId);
      setBuiltInDraft(draft);
    },
    [nonHideable],
  );

  const toggleBuiltInBlock = useCallback(
    (id: PipelineBlockId, enabled: boolean) => {
      if (nonHideable.has(id)) return;
      setBuiltInDraft((prev) =>
        enabled
          ? insertBlockAtRegistryPosition(prev, id)
          : prev.filter((x) => x !== id),
      );
    },
    [nonHideable],
  );

  const openNew = useCallback(() => {
    if (!canSync) return;
    setEditing({ mode: "new" });
    setName("");
    setDescription("");
    setIncludedOrder(
      buildInitialIncludedOrderForEditor(preferences, nonHideable),
    );
    setBlockSettings(cloneBlockSettings(preferences.newFileDrawerSettings));
    setFavoriteIds([]);
    setChecklist([]);
    setPlaybookIds([]);
    setError(null);
  }, [canSync, preferences, nonHideable]);

  const openEdit = useCallback((row: Doc<"pipelineFileUserTemplates">) => {
    const inc = rowToIncludedOrder(row);
    setEditing({ mode: "edit", id: row._id });
    setName(row.name);
    setDescription(row.description ?? "");
    setIncludedOrder(inc);
    setBlockSettings(hydrateSettingsFromRow(row.defaultSettings, inc));
    setFavoriteIds(
      (row.favoriteBlockIds ?? []).filter((id): id is PipelineBlockId =>
        inc.includes(id as PipelineBlockId),
      ),
    );
    setChecklist(checklistFromRow(row));
    setPlaybookIds((row.taskTemplateGroupIds ?? []) as Id<"taskTemplateGroups">[]);
    setError(null);
  }, []);

  const closeEditor = useCallback(() => {
    setEditing(null);
    setError(null);
  }, []);

  /** Save the (possibly adjusted) built-in strategy as a new custom template. */
  const cloneBuiltIn = useCallback(() => {
    if (!viewedTemplate || !canSync) return;
    const draft = [...builtInDraft];
    setEditing({ mode: "new" });
    setName(`${viewedTemplate.name} (custom)`);
    setDescription(viewedTemplate.description);
    setIncludedOrder(draft);
    setBlockSettings(hydrateSettingsFromRow(viewedTemplate.defaultSettings, draft));
    setFavoriteIds(
      (viewedTemplate.favoriteBlockIds ?? []).filter((id) =>
        draft.includes(id),
      ),
    );
    setChecklist(
      (viewedTemplate.portalRequestChecklist ?? []).map((item) => ({
        title: item.title,
        description: item.description ?? "",
        folderName: item.folderName ?? "",
      })),
    );
    setPlaybookIds([]);
    setError(null);
    setViewingBuiltIn(null);
  }, [viewedTemplate, canSync, builtInDraft]);

  const toggleFavorite = useCallback((blockId: PipelineBlockId) => {
    setFavoriteIds((prev) =>
      prev.includes(blockId)
        ? prev.filter((id) => id !== blockId)
        : [...prev, blockId],
    );
  }, []);

  const togglePlaybook = useCallback((groupId: Id<"taskTemplateGroups">) => {
    setPlaybookIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  }, []);

  const patchChecklistItem = useCallback(
    (index: number, patch: Partial<ChecklistDraftItem>) => {
      setChecklist((prev) =>
        prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  const save = useCallback(async () => {
    if (!trimmed || !editing) return;
    const nm = name.trim();
    if (!nm) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const settingsOut = sanitizePersistedSettings(
        blockSettings,
        includedOrder,
      );
      const favoritesOut = favoriteIds.filter((id) =>
        includedOrder.includes(id),
      );
      const checklistOut = checklist
        .map((item) => ({
          title: item.title.trim(),
          description: item.description.trim() || undefined,
          folderName: item.folderName.trim() || undefined,
        }))
        .filter((item) => item.title.length > 0);
      const shared = {
        accountId: trimmed,
        name: nm,
        description: description.trim() || undefined,
        includedBlocks: includedOrder,
        defaultSettings: settingsOut,
        favoriteBlockIds: favoritesOut,
        portalRequestChecklist: checklistOut,
        taskTemplateGroupIds: playbookIds,
      };
      if (editing.mode === "new") {
        await createT(shared);
      } else {
        await updateT({ id: editing.id, ...shared });
      }
      closeEditor();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [
    trimmed,
    editing,
    name,
    description,
    includedOrder,
    blockSettings,
    favoriteIds,
    checklist,
    playbookIds,
    createT,
    updateT,
    closeEditor,
  ]);

  const removeRow = useCallback(
    async (id: Id<"pipelineFileUserTemplates">) => {
      if (!trimmed) return;
      const row = list?.find((t) => t._id === id);
      const ok = await confirm({
        ...simpleDeleteConfirm(row?.name?.trim() || "this template", {
          title: "Delete loan template",
          impact: "This loan strategy template is permanently removed.",
        }),
      });
      if (!ok) return;
      try {
        await removeT({ id, accountId: trimmed });
        if (editing?.mode === "edit" && editing.id === id) closeEditor();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [trimmed, removeT, editing, closeEditor, list, confirm],
  );

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Built-in strategy templates
        </h2>
        <p className="text-xs text-muted-foreground">
          Ready-made layouts for common loan strategies. Click a strategy to
          see every block it enables across the file tabs, adjust it, and
          clone it as your own template.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {builtIns.map((t) => {
            const active = viewingBuiltIn === t.templateId;
            return (
              <li key={t.templateId}>
                <button
                  type="button"
                  onClick={() =>
                    active ? setViewingBuiltIn(null) : openBuiltIn(t)
                  }
                  aria-expanded={active}
                  className={cn(
                    "w-full rounded-dlc-md border px-3 py-2.5 text-left shadow-dlc-1 transition-colors duration-dlc-standard",
                    active
                      ? "border-primary/60 bg-primary/5"
                      : "border-border/70 bg-dlc-surface hover:border-primary/35",
                  )}
                >
                  <p className="text-sm font-medium text-foreground">
                    {t.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t.description}
                  </p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {t.includedBlocks.length} blocks
                    {t.favoriteBlockIds && t.favoriteBlockIds.length > 0
                      ? ` · ${t.favoriteBlockIds.length} favorites`
                      : ""}
                    {t.portalRequestChecklist &&
                    t.portalRequestChecklist.length > 0
                      ? ` · ${t.portalRequestChecklist.length} portal requests`
                      : ""}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        {viewedTemplate ? (
          <div className="space-y-3 rounded-dlc-md border border-border/70 bg-muted/10 p-3 sm:p-4">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {viewedTemplate.name} — blocks by tab
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Toggles show what this strategy enables by default. Adjust
                  anything, then clone to save it as your own reusable
                  template — the built-in stays unchanged.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={cloneBuiltIn}
                  disabled={!canSync}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Clone to custom template
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setViewingBuiltIn(null)}
                >
                  Close
                </Button>
              </div>
            </div>
            <TemplateBlockRegistryPicker
              includedIds={new Set(builtInDraft)}
              onToggle={toggleBuiltInBlock}
              lockedIds={nonHideable}
              registryMandatory={registryMandatory}
            />
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          My loan templates
        </h2>
        <p className="text-xs text-muted-foreground">
          Custom strategy templates: drawer blocks and order, default
          favorites, borrower portal document checklist, and task playbooks
          applied on file creation.
        </p>

        {!canSync ? (
          <p className="text-xs text-muted-foreground" role="status">
            Account unavailable — cannot manage loan templates.
          </p>
        ) : list === undefined ? (
          <p className="text-xs text-muted-foreground">Loading templates…</p>
        ) : editing ? (
          <div className="space-y-4 rounded-dlc-md border border-border/70 bg-muted/10 p-3 sm:p-4">
            <div>
              <label
                className="text-xs font-medium text-foreground"
                htmlFor="ltmpl-name"
              >
                Template name *
              </label>
              <Input
                id="ltmpl-name"
                className="mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bridge — heavy rehab"
              />
            </div>
            <div>
              <label
                className="text-xs font-medium text-foreground"
                htmlFor="ltmpl-desc"
              >
                Description
              </label>
              <Input
                id="ltmpl-desc"
                className="mt-1"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <NewFileDrawerTemplateBlocksEditor
              includedOrder={includedOrder}
              setIncludedOrder={setIncludedOrder}
              blockSettings={blockSettings}
              setBlockSettings={setBlockSettings}
              nonHideable={nonHideable}
              registryMandatory={registryMandatory}
            />

            <div className="space-y-1.5 border-t border-border/60 pt-3">
              <p className="text-xs font-medium text-foreground">
                Default favorites
              </p>
              <p className="text-[11px] text-muted-foreground">
                Pre-pinned to the file favorites bar for files created with
                this template.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {includedOrder.map((blockId) => {
                  const active = favoriteIds.includes(blockId);
                  return (
                    <button
                      key={blockId}
                      type="button"
                      onClick={() => toggleFavorite(blockId)}
                      aria-pressed={active}
                      className={cn(
                        "inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors duration-dlc-standard",
                        active
                          ? "border-primary/50 bg-primary/10 text-foreground"
                          : "border-border/70 bg-background text-muted-foreground hover:border-primary/35",
                      )}
                    >
                      <Star
                        className={cn(
                          "h-3 w-3",
                          active
                            ? "fill-amber-400 text-amber-500"
                            : "text-muted-foreground",
                        )}
                        aria-hidden
                      />
                      {getPipelineBlock(blockId).label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5 border-t border-border/60 pt-3">
              <p className="text-xs font-medium text-foreground">
                Portal request checklist
              </p>
              <p className="text-[11px] text-muted-foreground">
                Document requests queued for the borrower portal when the
                client is invited on a file created with this template.
              </p>
              <ul className="space-y-2">
                {checklist.map((item, i) => (
                  <li
                    key={i}
                    className="space-y-1.5 rounded-md border border-border/60 bg-background p-2"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={item.title}
                        onChange={(e) =>
                          patchChecklistItem(i, { title: e.target.value })
                        }
                        placeholder="Request title *"
                        aria-label={`Checklist item ${i + 1} title`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setChecklist((prev) =>
                            prev.filter((_, idx) => idx !== i),
                          )
                        }
                        aria-label={`Remove checklist item ${i + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      <Input
                        value={item.description}
                        onChange={(e) =>
                          patchChecklistItem(i, {
                            description: e.target.value,
                          })
                        }
                        placeholder="Instructions (optional)"
                        aria-label={`Checklist item ${i + 1} instructions`}
                      />
                      <Input
                        value={item.folderName}
                        onChange={(e) =>
                          patchChecklistItem(i, { folderName: e.target.value })
                        }
                        placeholder="Vault folder (optional)"
                        aria-label={`Checklist item ${i + 1} folder`}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setChecklist((prev) => [
                    ...prev,
                    { title: "", description: "", folderName: "" },
                  ])
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add request
              </Button>
            </div>

            <div className="space-y-1.5 border-t border-border/60 pt-3">
              <p className="text-xs font-medium text-foreground">
                Task playbooks
              </p>
              <p className="text-[11px] text-muted-foreground">
                Task template groups applied automatically on file creation.
              </p>
              {!orgScope ? (
                <p className="text-[11px] text-muted-foreground">
                  Join an organization to bind task playbooks.
                </p>
              ) : playbookGroups.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No playbook groups yet — create them in the task library.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {playbookGroups.map((g) => {
                    const active = playbookIds.includes(g._id);
                    return (
                      <button
                        key={g._id}
                        type="button"
                        onClick={() => togglePlaybook(g._id)}
                        aria-pressed={active}
                        className={cn(
                          "inline-flex min-h-8 items-center rounded-full border px-2.5 text-xs transition-colors duration-dlc-standard",
                          active
                            ? "border-primary/50 bg-primary/10 text-foreground"
                            : "border-border/70 bg-background text-muted-foreground hover:border-primary/35",
                        )}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save template"}
              </Button>
              <Button type="button" variant="outline" onClick={closeEditor}>
                Cancel
              </Button>
              {editing.mode === "edit" ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void removeRow(editing.id)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {list.map((row) => (
                <li
                  key={row._id}
                  className="flex flex-wrap items-center gap-2 rounded-dlc-md border border-border/60 bg-dlc-surface px-3 py-2 text-sm shadow-dlc-1"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.description ? `${row.description} · ` : ""}
                      {row.includedBlocks.length} blocks
                      {(row.favoriteBlockIds?.length ?? 0) > 0
                        ? ` · ${row.favoriteBlockIds?.length} favorites`
                        : ""}
                      {(row.portalRequestChecklist?.length ?? 0) > 0
                        ? ` · ${row.portalRequestChecklist?.length} portal requests`
                        : ""}
                      {(row.taskTemplateGroupIds?.length ?? 0) > 0
                        ? ` · ${row.taskTemplateGroupIds?.length} playbooks`
                        : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => void removeRow(row._id)}
                    aria-label={`Delete ${row.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
              {list.length === 0 ? (
                <li className="rounded-dlc-md border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
                  No custom loan templates yet.
                </li>
              ) : null}
            </ul>
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={openNew}
              disabled={!canSync}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              New loan template
            </Button>
          </>
        )}
      </section>
    </div>
  );
}
