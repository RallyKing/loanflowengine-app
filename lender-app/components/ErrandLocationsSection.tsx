"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InlineText } from "@/components/inline";
import { cn } from "@/lib/cn";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";

const DRAG_STORE = "application/x-lender-errand-store";
const DRAG_ITEM = "application/x-lender-errand-item";

export type ErrandItemRow = {
  id: string;
  name: string;
  completed: boolean;
  quantity?: string;
  note?: string;
};

export type ErrandLocationRow = {
  id: string;
  name: string;
  completed?: boolean;
  items: ErrandItemRow[];
};

function newStableId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isStoreDone(loc: ErrandLocationRow): boolean {
  if (loc.completed) return true;
  return (
    loc.items.length > 0 && loc.items.every((i) => i.completed)
  );
}

type ErrandPatchFields = {
  id: Id<"tasks">;
  errandLocations?: Doc<"tasks">["errandLocations"] | null;
};

type PatchFn = (fields: ErrandPatchFields) => Promise<void>;

function moveIndex<T>(arr: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= arr.length ||
    to >= arr.length
  ) {
    return arr;
  }
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

export function ErrandLocationsSection({
  task,
  onCommit,
  onOpenTask,
}: {
  task: Doc<"tasks">;
  onCommit: PatchFn;
  /** After duplicate / split, open the new task in the drawer. */
  onOpenTask?: (id: Id<"tasks">) => void;
}) {
  const locations = useMemo(
    () => (task.errandLocations ?? []) as ErrandLocationRow[],
    [task.errandLocations],
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [draftByLoc, setDraftByLoc] = useState<Record<string, string>>({});
  const [newStoreDraft, setNewStoreDraft] = useState("");
  const [storeDropIdx, setStoreDropIdx] = useState<number | null>(null);
  const itemInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const duplicateRun = useMutation(api.tasks.duplicateErrandGroceryTask);
  const moveUnchecked = useMutation(api.tasks.moveErrandUncheckedToNewTask);
  const actorKeyRaw = useActorUserKey();
  const { activeOrganizationId } = useOrgPermissions();
  const orgArgs = useMemo(() => {
    if (!activeOrganizationId || !actorKeyRaw.trim()) return null;
    return {
      organizationId: activeOrganizationId,
      memberUserKey: actorKeyRaw.trim(),
    };
  }, [activeOrganizationId, actorKeyRaw]);
  const { confirm } = useOperationalConfirm();

  const commit = useCallback(
    async (next: ErrandLocationRow[]) => {
      await onCommit({
        id: task._id,
        errandLocations: next.length > 0 ? (next as Doc<"tasks">["errandLocations"]) : null,
      });
    },
    [onCommit, task._id]
  );

  const totalItems = useMemo(
    () => locations.reduce((s, l) => s + l.items.length, 0),
    [locations]
  );
  const doneItems = useMemo(
    () =>
      locations.reduce(
        (s, l) => s + l.items.filter((i) => i.completed).length,
        0
      ),
    [locations]
  );
  const storesDone = useMemo(
    () => locations.filter((l) => isStoreDone(l)).length,
    [locations]
  );

  const toggleCollapsed = (locId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(locId)) next.delete(locId);
      else next.add(locId);
      return next;
    });
  };

  const setDraft = (locId: string, v: string) => {
    setDraftByLoc((d) => ({ ...d, [locId]: v }));
  };

  const addLocationByName = (rawName: string) => {
    const name = rawName.trim() || "New store";
    void commit([
      ...locations,
      { id: newStableId(), name, completed: false, items: [] },
    ]);
  };

  const addLocation = () => {
    void commit([
      ...locations,
      { id: newStableId(), name: "New store", completed: false, items: [] },
    ]);
  };

  const duplicateLocation = (idx: number) => {
    const src = locations[idx];
    if (!src) return;
    const clone: ErrandLocationRow = {
      id: newStableId(),
      name: src.name ? `${src.name} (copy)` : "Store (copy)",
      completed: false,
      items: src.items.map((it) => ({
        id: newStableId(),
        name: it.name,
        completed: false,
        quantity: it.quantity,
        note: it.note,
      })),
    };
    const next = [...locations];
    next.splice(idx + 1, 0, clone);
    void commit(next);
  };

  const removeLocation = (idx: number) => {
    void commit(locations.filter((_, j) => j !== idx));
  };

  const moveLocation = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= locations.length) return;
    void commit(moveIndex(locations, idx, j));
  };

  const reorderStore = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    if (from >= locations.length || to >= locations.length) return;
    void commit(moveIndex(locations, from, to));
  };

  const renameLocation = (idx: number, name: string) => {
    const next = locations.map((l, j) =>
      j === idx ? { ...l, name } : l
    );
    void commit(next);
  };

  const toggleStoreComplete = (idx: number, done: boolean) => {
    const loc = locations[idx];
    if (!loc) return;
    const next = locations.map((l, j) => {
      if (j !== idx) return l;
      if (done) {
        return {
          ...l,
          completed: true,
          items: l.items.map((it) => ({ ...it, completed: true })),
        };
      }
      return {
        ...l,
        completed: false,
        items: l.items.map((it) => ({ ...it, completed: false })),
      };
    });
    void commit(next);
  };

  const clearCompletedInLocation = async (idx: number) => {
    const loc = locations[idx];
    const storeName = loc?.name?.trim() || "this store";
    const ok = await confirm({
      ...simpleDeleteConfirm(storeName, {
        title: "Clear checked items",
        impact:
          "All checked items at this store are removed. This cannot be undone.",
        confirmLabel: "Clear checked",
      }),
    });
    if (!ok) return;
    if (!loc) return;
    const items = loc.items.filter((i) => !i.completed);
    void commit(
      locations.map((l, j) => (j === idx ? { ...l, items, completed: false } : l))
    );
  };

  const clearAllCompletedEverywhere = async () => {
    const ok = await confirm({
      ...simpleDeleteConfirm("all stores", {
        title: "Clear checked items",
        impact:
          "Every checked item is removed from all stores. Empty stores disappear. This cannot be undone.",
        confirmLabel: "Clear checked",
      }),
    });
    if (!ok) return;
    const next = locations
      .map((loc) => ({
        ...loc,
        completed: false,
        items: loc.items.filter((i) => !i.completed),
      }))
      .filter((loc) => loc.items.length > 0);
    void commit(next);
  };

  const sortItemsAlpha = (idx: number) => {
    const loc = locations[idx];
    if (!loc) return;
    const items = [...loc.items].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    void commit(locations.map((l, j) => (j === idx ? { ...l, items } : l)));
  };

  const updateItems = (locIdx: number, items: ErrandItemRow[]) => {
    void commit(
      locations.map((l, j) => (j === locIdx ? { ...l, items } : l))
    );
  };

  const addItem = (locIdx: number, name: string, locId: string) => {
    const t = name.trim();
    if (!t) return;
    const loc = locations[locIdx];
    if (!loc) return;
    void commit(
      locations.map((l, j) =>
        j === locIdx
          ? {
              ...l,
              completed: false,
              items: [
                ...l.items,
                {
                  id: newStableId(),
                  name: t,
                  completed: false,
                },
              ],
            }
          : l
      )
    );
    queueMicrotask(() => itemInputRefs.current[locId]?.focus());
  };

  const toggleItem = (locIdx: number, itemIdx: number, completed: boolean) => {
    const loc = locations[locIdx];
    if (!loc) return;
    updateItems(
      locIdx,
      loc.items.map((it, j) =>
        j === itemIdx ? { ...it, completed } : it
      )
    );
  };

  const renameItem = (locIdx: number, itemIdx: number, name: string) => {
    const loc = locations[locIdx];
    if (!loc) return;
    updateItems(
      locIdx,
      loc.items.map((it, j) => (j === itemIdx ? { ...it, name } : it))
    );
  };

  const patchItemMeta = (
    locIdx: number,
    itemIdx: number,
    patch: Partial<Pick<ErrandItemRow, "quantity" | "note">>
  ) => {
    const loc = locations[locIdx];
    if (!loc) return;
    updateItems(
      locIdx,
      loc.items.map((it, j) =>
        j === itemIdx ? { ...it, ...patch } : it
      )
    );
  };

  const removeItem = (locIdx: number, itemIdx: number) => {
    const loc = locations[locIdx];
    if (!loc) return;
    updateItems(
      locIdx,
      loc.items.filter((_, j) => j !== itemIdx)
    );
  };

  const moveItem = (locIdx: number, itemIdx: number, dir: -1 | 1) => {
    const loc = locations[locIdx];
    if (!loc) return;
    const j = itemIdx + dir;
    if (j < 0 || j >= loc.items.length) return;
    updateItems(locIdx, moveIndex(loc.items, itemIdx, j));
  };

  const reorderItem = (locIdx: number, from: number, to: number) => {
    const loc = locations[locIdx];
    if (!loc) return;
    if (from === to) return;
    updateItems(locIdx, moveIndex(loc.items, from, to));
  };

  const onDuplicateEntireTask = async () => {
    if (!orgArgs) {
      window.alert("Select an organization to duplicate this run.");
      return;
    }
    const ok = await confirm({
      title: "Duplicate run",
      entityName: task.title?.trim() || "Errands run",
      impact:
        "Creates a new task in the same quadrant with the same store list.",
      confirmLabel: "Duplicate run",
    });
    if (!ok) return;
    try {
      const { id } = await duplicateRun({ id: task._id, ...orgArgs });
      onOpenTask?.(id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const onMoveUnchecked = async () => {
    if (!orgArgs) {
      window.alert("Select an organization to move items.");
      return;
    }
    const ok = await confirm({
      title: "Move unchecked items",
      entityName: task.title?.trim() || "this run",
      impact:
        "Creates a new errands task with every unchecked item (by store) and removes those items from this run. Checked items stay here.",
      confirmLabel: "Move unchecked",
    });
    if (!ok) return;
    try {
      const { newTaskId } = await moveUnchecked({ id: task._id, ...orgArgs });
      onOpenTask?.(newTaskId);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const uncheckedCount = useMemo(
    () =>
      locations.reduce(
        (s, l) => s + l.items.filter((i) => !i.completed).length,
        0
      ),
    [locations]
  );

  return (
    <div className="errand-locations-root space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Input
            placeholder="New store name — Enter to add"
            value={newStoreDraft}
            onChange={(e) => setNewStoreDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const t = newStoreDraft.trim();
              if (!t) return;
              addLocationByName(t);
              setNewStoreDraft("");
            }}
            className="max-w-md flex-1"
            aria-label="Quick-add store"
          />
          <Button type="button" size="sm" variant="outline" onClick={() => void addLocation()}>
            <Plus className="h-3.5 w-3.5" />
            Add store
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {locations.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {storesDone}/{locations.length} stores · {doneItems}/{totalItems} items
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={doneItems === 0}
            onClick={() => void clearAllCompletedEverywhere()}
            title="Remove all checked items everywhere"
          >
            Clear all checked
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uncheckedCount === 0}
            onClick={() => void onMoveUnchecked()}
            title="Move unchecked items to a new task"
          >
            Move unchecked to new task
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void onDuplicateEntireTask()}
            title="Duplicate this run"
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate run
          </Button>
        </div>
      </div>

      {locations.length === 0 ? (
        <p className="rounded-md border border-dashed border-emerald-800/20 bg-emerald-950/5 p-3 text-center text-sm text-muted-foreground dark:border-emerald-500/20 dark:bg-emerald-950/25">
          Type a store name above and press Enter, or click Add store. Then add
          items under each stop — Enter keeps you in the item field for rapid
          entry. Drag the grip handle to reorder stores or items.
        </p>
      ) : (
        <ul className="space-y-4" aria-label="Errand locations">
          {locations.map((loc, li) => {
            const doneHere = loc.items.filter((i) => i.completed).length;
            const storeDone = isStoreDone(loc);
            const isColl = collapsed.has(loc.id);
            const draft = draftByLoc[loc.id] ?? "";
            return (
              <li
                key={loc.id}
                className={cn(
                  "overflow-hidden rounded-lg border bg-emerald-950/[0.04] shadow-sm transition-colors dark:bg-emerald-950/20",
                  storeDone
                    ? "border-emerald-600/50 ring-1 ring-emerald-600/35 dark:border-emerald-500/50"
                    : "border-emerald-900/15 dark:border-emerald-500/20",
                  storeDropIdx === li && "ring-2 ring-primary"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setStoreDropIdx(li);
                }}
                onDragLeave={(e) => {
                  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                    setStoreDropIdx((v) => (v === li ? null : v));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setStoreDropIdx(null);
                  const raw = e.dataTransfer.getData(DRAG_STORE);
                  if (!raw) return;
                  const from = parseInt(raw, 10);
                  if (Number.isNaN(from)) return;
                  reorderStore(from, li);
                }}
              >
                <div
                  className={cn(
                    "flex flex-wrap items-center gap-2 border-b-2 px-3 py-2.5 dark:border-emerald-500/35",
                    storeDone
                      ? "border-emerald-600/40 bg-emerald-600/10 dark:bg-emerald-900/40"
                      : "border-emerald-700/25 bg-emerald-950/10 dark:bg-emerald-950/30"
                  )}
                >
                  <span
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData(DRAG_STORE, String(li));
                    }}
                    onDragEnd={() => setStoreDropIdx(null)}
                    className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
                    title="Drag to reorder stores"
                  >
                    <GripVertical className="h-4 w-4 shrink-0" aria-hidden />
                  </span>
                  <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted"
                    aria-expanded={!isColl}
                    onClick={() => toggleCollapsed(loc.id)}
                    title={isColl ? "Expand" : "Collapse"}
                  >
                    {isColl ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  <label className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs font-medium hover:bg-muted">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-input accent-primary"
                      checked={storeDone}
                      onChange={(e) =>
                        void toggleStoreComplete(li, e.target.checked)
                      }
                      aria-label={`Mark store ${loc.name} complete`}
                    />
                    Done
                  </label>
                  <div className="min-w-0 flex-1">
                    <InlineText
                      value={loc.name}
                      onCommit={(next) => void renameLocation(li, next)}
                      ariaLabel={`Rename store ${li + 1}`}
                      displayClassName={cn(
                        "text-base font-semibold tracking-tight",
                        storeDone && "text-muted-foreground line-through"
                      )}
                    />
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {loc.items.length === 0
                      ? "0 items"
                      : `${doneHere}/${loc.items.length}`}
                  </span>
                  <div className="flex shrink-0 flex-wrap items-center gap-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      disabled={li === 0}
                      onClick={() => void moveLocation(li, -1)}
                      title="Move store up"
                      aria-label="Move store up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      disabled={li >= locations.length - 1}
                      onClick={() => void moveLocation(li, 1)}
                      title="Move store down"
                      aria-label="Move store down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      onClick={() => void duplicateLocation(li)}
                      title="Duplicate this store list"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      disabled={!loc.items.some((i) => i.completed)}
                      onClick={() => void clearCompletedInLocation(li)}
                      title="Remove checked items at this store"
                    >
                      Clear done
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      disabled={loc.items.length < 2}
                      onClick={() => void sortItemsAlpha(li)}
                      title="Sort items A–Z"
                    >
                      A–Z
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0 text-destructive hover:text-destructive"
                      onClick={() => void removeLocation(li)}
                      title="Remove store"
                      aria-label="Remove store"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {!isColl && (
                  <div className="border-t border-border/30 px-3 py-2.5">
                    {loc.items.length === 0 ? (
                      <p className="mb-2 text-xs text-muted-foreground">
                        No items yet — type below and press Enter.
                      </p>
                    ) : (
                      <ul
                        className="mb-2 space-y-1 border-l-2 border-emerald-700/20 pl-3 dark:border-emerald-500/30"
                        aria-label={`Items at ${loc.name}`}
                      >
                        {loc.items.map((it, ii) => (
                          <li
                            key={it.id}
                            className="flex flex-wrap items-end gap-2 rounded-md px-1 py-1 hover:bg-muted/40"
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const raw = e.dataTransfer.getData(DRAG_ITEM);
                              if (!raw) return;
                              let parsed: { si: number; ii: number };
                              try {
                                parsed = JSON.parse(raw) as { si: number; ii: number };
                              } catch {
                                return;
                              }
                              if (parsed.si !== li) return;
                              reorderItem(li, parsed.ii, ii);
                            }}
                          >
                            <span
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation();
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData(
                                  DRAG_ITEM,
                                  JSON.stringify({ si: li, ii })
                                );
                              }}
                              className="cursor-grab pb-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                              title="Drag to reorder"
                            >
                              <GripVertical className="h-3.5 w-3.5" aria-hidden />
                            </span>
                            <input
                              type="checkbox"
                              className="mb-0.5 h-5 w-5 shrink-0 rounded border-input accent-primary"
                              checked={it.completed}
                              onChange={(e) =>
                                void toggleItem(li, ii, e.target.checked)
                              }
                              aria-label={`${it.completed ? "Uncheck" : "Check"} ${it.name}`}
                            />
                            <div className="min-w-0 flex-[2]">
                              <InlineText
                                value={it.name}
                                onCommit={(next) =>
                                  void renameItem(li, ii, next)
                                }
                                ariaLabel={`Edit item ${ii + 1}`}
                                displayClassName={cn(
                                  "text-sm",
                                  it.completed &&
                                    "text-muted-foreground line-through"
                                )}
                              />
                            </div>
                            <Input
                              defaultValue={it.quantity ?? ""}
                              key={`${it.id}-q-${it.quantity ?? ""}`}
                              onBlur={(e) =>
                                void patchItemMeta(li, ii, {
                                  quantity: e.target.value.trim() || undefined,
                                })
                              }
                              placeholder="Qty"
                              className="h-8 w-16 shrink-0 px-2 text-xs"
                              aria-label={`Quantity for ${it.name}`}
                            />
                            <Input
                              defaultValue={it.note ?? ""}
                              key={`${it.id}-note-${it.note ?? ""}`}
                              onBlur={(e) =>
                                void patchItemMeta(li, ii, {
                                  note: e.target.value.trim() || undefined,
                                })
                              }
                              placeholder="Note"
                              className="h-8 min-w-[6rem] max-w-[10rem] flex-1 px-2 text-xs"
                              aria-label={`Note for ${it.name}`}
                            />
                            <div className="flex shrink-0 gap-0.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 px-0"
                                disabled={ii === 0}
                                onClick={() => void moveItem(li, ii, -1)}
                                aria-label="Move item up"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 px-0"
                                disabled={ii >= loc.items.length - 1}
                                onClick={() => void moveItem(li, ii, 1)}
                                aria-label="Move item down"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 px-0 text-muted-foreground hover:text-destructive"
                                onClick={() => void removeItem(li, ii)}
                                aria-label="Remove item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex gap-2">
                      <Input
                        ref={(el) => {
                          itemInputRefs.current[loc.id] = el;
                        }}
                        placeholder="Add item, Enter to add another…"
                        value={draft}
                        onChange={(e) => setDraft(loc.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          addItem(li, draft, loc.id);
                          setDraft(loc.id, "");
                        }}
                        aria-label={`New item for ${loc.name}`}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={!draft.trim()}
                        onClick={() => {
                          addItem(li, draft, loc.id);
                          setDraft(loc.id, "");
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
