"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { NewFileDrawerTemplateBlocksEditor } from "@/components/NewFileDrawerTemplateBlocksEditor";
import {
  ALL_PIPELINE_BLOCK_IDS,
  getMandatoryPipelineBlockIds,
  PIPELINE_BLOCKS,
  type PipelineBlockId,
} from "@/lib/pipelineBlockRegistry";
import { getEffectiveMandatoryPipelineBlockIds } from "@/lib/pipelineGlobalBlockPolicy";
import { mergeBlockSettingsWithSchemaDefaults } from "@/lib/pipelineBlockSettingsSchema";
import {
  buildInitialIncludedOrderForEditor,
  cloneBlockSettings,
} from "@/lib/newFileDrawerTemplateEditorState";
import type { UserPreferencesV1 } from "@/lib/userPreferencesModel";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";

export function sanitizePersistedSettings(
  draft: UserPreferencesV1["newFileDrawerSettings"],
  included: PipelineBlockId[],
): UserPreferencesV1["newFileDrawerSettings"] {
  const allow = new Set(included);
  const out: UserPreferencesV1["newFileDrawerSettings"] = {};
  for (const [k, v] of Object.entries(draft)) {
    if (!allow.has(k as PipelineBlockId)) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const block = PIPELINE_BLOCKS.find((b) => b.blockId === k);
    const merged = mergeBlockSettingsWithSchemaDefaults(
      block?.settingsSchema ?? null,
      v,
    );
    if (Object.keys(merged).length > 0) {
      out[k as PipelineBlockId] = merged;
    }
  }
  return out;
}

export function hydrateSettingsFromRow(
  stored: unknown,
  included: PipelineBlockId[],
): UserPreferencesV1["newFileDrawerSettings"] {
  const out: UserPreferencesV1["newFileDrawerSettings"] = {};
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return out;
  }
  const o = stored as Record<string, unknown>;
  for (const id of included) {
    const raw = o[id];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const block = PIPELINE_BLOCKS.find((b) => b.blockId === id);
    out[id] = mergeBlockSettingsWithSchemaDefaults(
      block?.settingsSchema ?? null,
      raw as Record<string, unknown>,
    );
  }
  return out;
}

export function rowToIncludedOrder(row: Doc<"pipelineFileUserTemplates">): PipelineBlockId[] {
  const fromBlocks = row.includedBlocks.filter((id): id is PipelineBlockId =>
    ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId),
  );
  if (fromBlocks.length > 0) return fromBlocks;
  return [...getMandatoryPipelineBlockIds()];
}

type Props = {
  accountId: string;
  canSync: boolean;
  preferences: UserPreferencesV1;
  prefsReady: boolean;
};

export function UserPipelineFileTemplatesSection({
  accountId,
  canSync,
  preferences,
  prefsReady,
}: Props) {
  const { confirm } = useOperationalConfirm();
  const trimmed = accountId.trim();
  const list = useQuery(
    api.pipelineFileUserTemplates.listByAccountId,
    trimmed ? { accountId: trimmed } : "skip",
  );
  const createT = useMutation(api.pipelineFileUserTemplates.create);
  const updateT = useMutation(api.pipelineFileUserTemplates.update);
  const removeT = useMutation(api.pipelineFileUserTemplates.remove);
  const resolved = useQuery(api.pipelineGlobalBlockConfig.getResolved, {});

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
    null | { mode: "new" } | { mode: "edit"; id: Id<"pipelineFileUserTemplates"> }
  >(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [includedOrder, setIncludedOrder] = useState<PipelineBlockId[]>([]);
  const [blockSettings, setBlockSettings] = useState<
    UserPreferencesV1["newFileDrawerSettings"]
  >({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openNew = useCallback(() => {
    if (!prefsReady || !canSync) return;
    setEditing({ mode: "new" });
    setName("");
    setDescription("");
    setIncludedOrder(buildInitialIncludedOrderForEditor(preferences, nonHideable));
    setBlockSettings(cloneBlockSettings(preferences.newFileDrawerSettings));
    setError(null);
  }, [prefsReady, canSync, preferences, nonHideable]);

  const openEdit = useCallback(
    (row: Doc<"pipelineFileUserTemplates">) => {
      const inc = rowToIncludedOrder(row);
      setEditing({ mode: "edit", id: row._id });
      setName(row.name);
      setDescription(row.description ?? "");
      setIncludedOrder(inc);
      setBlockSettings(hydrateSettingsFromRow(row.defaultSettings, inc));
      setError(null);
    },
    [],
  );

  const closeEditor = useCallback(() => {
    setEditing(null);
    setError(null);
  }, []);

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
      const settingsOut = sanitizePersistedSettings(blockSettings, includedOrder);
      if (editing.mode === "new") {
        await createT({
          accountId: trimmed,
          name: nm,
          description: description.trim() || undefined,
          includedBlocks: includedOrder,
          defaultSettings: settingsOut,
        });
      } else {
        await updateT({
          id: editing.id,
          accountId: trimmed,
          name: nm,
          description: description.trim() || undefined,
          includedBlocks: includedOrder,
          defaultSettings: settingsOut,
        });
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
          title: "Delete template",
          impact: "This file template is permanently removed.",
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
    <div className="max-w-xl space-y-3 border-t border-border/60 pt-4">
      <p className="text-sm font-medium text-foreground">My file templates</p>
      <p className="text-xs text-muted-foreground">
        Save named drawer layouts (blocks, order, and defaults) for quick selection
        when you create a new pipeline file. Built-in templates in the app are
        unchanged. For favorites, portal checklists, and task playbooks, use{" "}
        <Link
          href="/settings/loan-templates"
          className="text-primary underline"
        >
          loan strategy templates
        </Link>
        .
      </p>

      {!canSync || !trimmed ? (
        <p className="text-xs text-muted-foreground" role="status">
          Account id unavailable — cannot save personal templates.
        </p>
      ) : list === undefined ? (
        <p className="text-xs text-muted-foreground">Loading templates…</p>
      ) : editing ? (
        <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3">
          <div>
            <label className="text-xs font-medium text-foreground" htmlFor="utmpl-name">
              Template name *
            </label>
            <Input
              id="utmpl-name"
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My refi layout"
            />
          </div>
          <div>
            <label
              className="text-xs font-medium text-foreground"
              htmlFor="utmpl-desc"
            >
              Description
            </label>
            <Input
              id="utmpl-desc"
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
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void save()}
              disabled={saving}
            >
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
                className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{row.name}</p>
                  {row.description ? (
                    <p className="text-xs text-muted-foreground">{row.description}</p>
                  ) : null}
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
            disabled={!prefsReady}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            New template
          </Button>
        </>
      )}
    </div>
  );
}
