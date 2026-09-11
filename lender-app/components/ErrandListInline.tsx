"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InlineText } from "@/components/inline";
import { cn } from "@/lib/cn";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { ErrandLocationRow } from "@/components/ErrandLocationsSection";

function newStableId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Default open row + full list when the run is small; collapsed / compact when large. */
export function defaultErrandListStartsExpanded(t: Doc<"tasks">): boolean {
  if (t.type !== "errands_groceries") return false;
  const locs = t.errandLocations ?? [];
  const stores = locs.length;
  const items = locs.reduce((s, l) => s + l.items.length, 0);
  return stores <= 3 && items <= 12;
}

/**
 * Expand/collapse UI is local row state. Reset only when the row's task
 * identity or type changes — not when Convex returns a new doc after a
 * checkbox / rename patch (that was collapsing grocery runs on mobile).
 */
export function shouldReseedErrandExpandUi(args: {
  prevId: string;
  prevType: string;
  nextId: string;
  nextType: string;
}): boolean {
  return args.prevId !== args.nextId || args.prevType !== args.nextType;
}

const COMPACT_MAX_STORES = 2;
const COMPACT_MAX_ITEMS_PER_STORE = 3;

type ErrandLocs = Doc<"tasks">["errandLocations"];

export const ErrandListInline = memo(function ErrandListInline({
  locations: locationsProp,
  expanded,
  disabled,
  onCommit,
  onExpandedChange,
  collapsedStoreIds,
  onToggleStoreCollapse,
}: {
  locations: ErrandLocs;
  expanded: boolean;
  disabled?: boolean;
  onCommit: (next: ErrandLocs | null) => void;
  onExpandedChange?: (next: boolean) => void;
  collapsedStoreIds?: ReadonlySet<string>;
  onToggleStoreCollapse?: (storeId: string) => void;
}) {
  const locations = useMemo(
    () => (locationsProp ?? []) as ErrandLocationRow[],
    [locationsProp]
  );
  const [newStoreDraft, setNewStoreDraft] = useState("");
  const [draftByLoc, setDraftByLoc] = useState<Record<string, string>>({});
  const itemInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const commit = useCallback(
    (next: ErrandLocationRow[]) => {
      onCommit(next.length > 0 ? (next as NonNullable<ErrandLocs>) : null);
    },
    [onCommit]
  );

  const totalItems = useMemo(
    () => locations.reduce((s, l) => s + l.items.length, 0),
    [locations]
  );

  const benefitsFromCompact = useMemo(() => {
    if (locations.length > COMPACT_MAX_STORES) return true;
    return locations.some((l) => l.items.length > COMPACT_MAX_ITEMS_PER_STORE);
  }, [locations]);

  const visibleStoreIndices = useMemo(() => {
    if (expanded) return locations.map((_, i) => i);
    return locations
      .slice(0, COMPACT_MAX_STORES)
      .map((_, i) => i);
  }, [expanded, locations]);

  const addStoreByName = (raw: string) => {
    const name = raw.trim() || "New store";
    void commit([
      ...locations,
      { id: newStableId(), name, completed: false, items: [] },
    ]);
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
    const items = loc.items.map((it, j) =>
      j === itemIdx ? { ...it, completed } : it
    );
    void commit(locations.map((l, j) => (j === locIdx ? { ...l, items } : l)));
  };

  const renameLocation = (idx: number, name: string) => {
    void commit(
      locations.map((l, j) => (j === idx ? { ...l, name } : l))
    );
  };

  const renameItem = (locIdx: number, itemIdx: number, name: string) => {
    const loc = locations[locIdx];
    if (!loc) return;
    const items = loc.items.map((it, j) =>
      j === itemIdx ? { ...it, name } : it
    );
    void commit(locations.map((l, j) => (j === locIdx ? { ...l, items } : l)));
  };

  const removeItem = (locIdx: number, itemIdx: number) => {
    const loc = locations[locIdx];
    if (!loc) return;
    const items = loc.items.filter((_, j) => j !== itemIdx);
    void commit(locations.map((l, j) => (j === locIdx ? { ...l, items } : l)));
  };

  const removeLocation = (idx: number) => {
    void commit(locations.filter((_, j) => j !== idx));
  };

  const setDraft = (locId: string, v: string) => {
    setDraftByLoc((d) => ({ ...d, [locId]: v }));
  };

  return (
    <div
      className="rounded-md border border-emerald-800/15 bg-emerald-950/[0.03] px-2 py-2 text-sm dark:border-emerald-700/30 dark:bg-emerald-950/15"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {locations.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Add a store to build your run — same list as in task details.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Store name — Enter to add"
              value={newStoreDraft}
              disabled={disabled}
              onChange={(e) => setNewStoreDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const n = newStoreDraft.trim();
                if (!n) return;
                addStoreByName(n);
                setNewStoreDraft("");
              }}
              className="max-w-xs flex-1 text-xs"
              aria-label="Add a store"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || !newStoreDraft.trim()}
              onClick={() => {
                addStoreByName(newStoreDraft);
                setNewStoreDraft("");
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add store
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleStoreIndices.map((li) => {
            const loc = locations[li];
            if (!loc) return null;
            const draft = draftByLoc[loc.id] ?? "";
            const storeCollapsed =
              Boolean(expanded) &&
              Boolean(onToggleStoreCollapse) &&
              Boolean(collapsedStoreIds?.has(loc.id));
            const itemLimit = expanded
              ? loc.items.length
              : COMPACT_MAX_ITEMS_PER_STORE;
            const visibleItemEntries = storeCollapsed
              ? []
              : loc.items
                  .map((it, ii) => ({ it, ii }))
                  .slice(0, itemLimit);
            const hiddenItemCount = storeCollapsed
              ? loc.items.length
              : loc.items.length - visibleItemEntries.length;
            return (
              <div
                key={loc.id}
                className="border-b border-border/40 pb-2 last:border-0 last:pb-0"
              >
                <div className="mb-1 flex items-center gap-1">
                  {expanded && onToggleStoreCollapse ? (
                    <button
                      type="button"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:bg-muted"
                      onClick={() => onToggleStoreCollapse(loc.id)}
                      aria-expanded={!storeCollapsed}
                      aria-label={
                        storeCollapsed
                          ? `Expand items for ${loc.name}`
                          : `Collapse items for ${loc.name}`
                      }
                      title={storeCollapsed ? "Show items" : "Hide items"}
                    >
                      {storeCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                  ) : null}
                  <h3 className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-emerald-900/90 dark:text-emerald-100/90">
                    <InlineText
                      value={loc.name}
                      onCommit={(next) => void renameLocation(li, next)}
                      ariaLabel={`Rename store ${loc.name}`}
                      displayClassName="text-xs font-semibold uppercase tracking-wide truncate"
                    />
                  </h3>
                  {expanded && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-destructive"
                      disabled={disabled}
                      onClick={() => void removeLocation(li)}
                      title="Remove store"
                      aria-label={`Remove store ${loc.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {storeCollapsed ? (
                  <p className="pl-8 text-[11px] text-muted-foreground">
                    {loc.items.length} item
                    {loc.items.length === 1 ? "" : "s"} — expand to edit
                  </p>
                ) : (
                <ul className="ml-0.5 space-y-0.5" aria-label={`Items at ${loc.name}`}>
                  {visibleItemEntries.map(({ it, ii }) => (
                    <li
                      key={it.id}
                      className="flex items-center gap-2 rounded-sm py-0.5 hover:bg-muted/50"
                      title={it.note?.trim() ? it.note.trim() : undefined}
                    >
                      <label className="flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-md">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                          checked={it.completed}
                          disabled={disabled}
                          onChange={(e) =>
                            void toggleItem(li, ii, e.target.checked)
                          }
                          aria-label={`${it.completed ? "Uncheck" : "Check"} ${it.name}`}
                        />
                      </label>
                      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5">
                        <InlineText
                          value={it.name}
                          onCommit={(next) =>
                            void renameItem(li, ii, next)
                          }
                          ariaLabel={`Edit item ${it.name}`}
                          displayClassName={cn(
                            "min-w-0 flex-1 text-xs",
                            it.completed &&
                              "text-muted-foreground line-through"
                          )}
                        />
                        {it.quantity?.trim() ? (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            ×{it.quantity.trim()}
                          </span>
                        ) : null}
                      </div>
                      {expanded && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 shrink-0 px-0 text-muted-foreground hover:text-destructive"
                          disabled={disabled}
                          onClick={() => void removeItem(li, ii)}
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                )}
                {!storeCollapsed && hiddenItemCount > 0 && (
                  <p className="mt-1 pl-6 text-[10px] text-muted-foreground">
                    +{hiddenItemCount} more item{hiddenItemCount === 1 ? "" : "s"} here
                  </p>
                )}
                {!storeCollapsed && (
                  <div className="mt-1.5 flex gap-1.5 pl-0.5">
                    <Input
                      ref={(el) => {
                        itemInputRefs.current[loc.id] = el;
                      }}
                      placeholder="Add item, Enter…"
                      value={draft}
                      disabled={disabled}
                      onChange={(e) => setDraft(loc.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        addItem(li, draft, loc.id);
                        setDraft(loc.id, "");
                      }}
                      className="h-8 flex-1 text-xs"
                      aria-label={`New item for ${loc.name}`}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 px-2"
                      disabled={disabled || !draft.trim()}
                      onClick={() => {
                        addItem(li, draft, loc.id);
                        setDraft(loc.id, "");
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {!expanded && locations.length > visibleStoreIndices.length && (
            <p className="text-[10px] text-muted-foreground">
              +{locations.length - visibleStoreIndices.length} more store
              {locations.length - visibleStoreIndices.length === 1 ? "" : "s"}
            </p>
          )}

          {onExpandedChange && benefitsFromCompact && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/30 pt-2">
              <p className="text-[10px] text-muted-foreground">
                {totalItems} item{totalItems === 1 ? "" : "s"} total
                {!expanded ? " · compact view" : ""}
              </p>
              {!expanded ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 min-h-9 text-xs"
                  onClick={() => onExpandedChange(true)}
                >
                  Show all stores & items
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 min-h-9 text-xs text-muted-foreground"
                  onClick={() => onExpandedChange(false)}
                >
                  Compact view
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border/30 pt-2">
            <Input
              placeholder="New store — Enter"
              value={newStoreDraft}
              disabled={disabled}
              onChange={(e) => setNewStoreDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const n = newStoreDraft.trim();
                if (!n) return;
                addStoreByName(n);
                setNewStoreDraft("");
              }}
              className="h-8 max-w-[14rem] flex-1 text-xs"
              aria-label="Add another store"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={disabled || !newStoreDraft.trim()}
              onClick={() => {
                addStoreByName(newStoreDraft);
                setNewStoreDraft("");
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Store
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
