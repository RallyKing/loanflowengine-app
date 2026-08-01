"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import type { ContactsLinkStatusFilter } from "@/lib/contacts/contactsWorkspaceFilters";

export type ContactsAdvancedFilters = {
  linkStatusFilters: ContactsLinkStatusFilter[];
  tagInput: string;
  tagFilters: string[];
  activityFromDate: string;
  activityToDate: string;
};

type ContactsFilterDrawerProps = {
  open: boolean;
  onClose: () => void;
  filters: ContactsAdvancedFilters;
  onChange: (next: ContactsAdvancedFilters) => void;
  onApply: () => void;
  onClear: () => void;
};

const LINK_STATUS_OPTIONS: { id: ContactsLinkStatusFilter; label: string }[] = [
  { id: "linked", label: "Linked to files" },
  { id: "unlinked", label: "Not linked" },
  { id: "partial", label: "Partial" },
];

function dateInputToMs(value: string, endOfDay: boolean): number | undefined {
  if (!value.trim()) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function contactsAdvancedFiltersToMs(
  filters: ContactsAdvancedFilters,
): { activityFrom?: number; activityTo?: number } {
  return {
    activityFrom: dateInputToMs(filters.activityFromDate, false),
    activityTo: dateInputToMs(filters.activityToDate, true),
  };
}

export function ContactsFilterDrawer({
  open,
  onClose,
  filters,
  onChange,
  onApply,
  onClear,
}: ContactsFilterDrawerProps) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  if (!mounted && !open) return null;

  const toggleLinkStatus = (id: ContactsLinkStatusFilter) => {
    const next = filters.linkStatusFilters.includes(id)
      ? filters.linkStatusFilters.filter((s) => s !== id)
      : [...filters.linkStatusFilters, id];
    onChange({ ...filters, linkStatusFilters: next });
  };

  const addTag = () => {
    const tag = filters.tagInput.trim();
    if (!tag) return;
    if (filters.tagFilters.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      onChange({ ...filters, tagInput: "" });
      return;
    }
    onChange({
      ...filters,
      tagFilters: [...filters.tagFilters, tag],
      tagInput: "",
    });
  };

  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] lg:hidden"
          aria-label="Close filters"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={cn(
          "z-50 flex w-full max-w-sm flex-col border-l border-border/60 bg-background shadow-dlc-3",
          "fixed inset-y-0 right-0 lg:static lg:max-h-none lg:shrink-0",
          open ? "translate-x-0" : "translate-x-full lg:hidden",
          "transition-transform duration-dlc-standard ease-dlc-standard",
        )}
        data-testid="contacts-filter-panel"
        aria-hidden={!open}
      >
        <div className="flex min-h-12 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Advanced filters</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-9 min-w-9"
            onClick={onClose}
            aria-label="Close filters"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <div
          data-nested-scroll
          className="min-h-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain px-4 py-4"
        >
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Link status
              </p>
              <div className="flex flex-wrap gap-1.5">
                {LINK_STATUS_OPTIONS.map(({ id, label }) => {
                  const active = filters.linkStatusFilters.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/80 text-muted-foreground hover:bg-muted",
                      )}
                      onClick={() => toggleLinkStatus(id)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label htmlFor="contacts-filter-tags">Tags</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  id="contacts-filter-tags"
                  value={filters.tagInput}
                  onChange={(e) =>
                    onChange({ ...filters, tagInput: e.target.value })
                  }
                  placeholder="Add tag filter"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button type="button" size="sm" variant="outline" onClick={addTag}>
                  Add
                </Button>
              </div>
              {filters.tagFilters.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {filters.tagFilters.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary"
                      onClick={() =>
                        onChange({
                          ...filters,
                          tagFilters: filters.tagFilters.filter((t) => t !== tag),
                        })
                      }
                    >
                      {tag} ×
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Last activity range
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="contacts-activity-from">From</Label>
                  <Input
                    id="contacts-activity-from"
                    type="date"
                    value={filters.activityFromDate}
                    onChange={(e) =>
                      onChange({ ...filters, activityFromDate: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="contacts-activity-to">To</Label>
                  <Input
                    id="contacts-activity-to"
                    type="date"
                    value={filters.activityToDate}
                    onChange={(e) =>
                      onChange({ ...filters, activityToDate: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClear}>
            Clear all
          </Button>
          <Button type="button" variant="primary" className="flex-1" onClick={onApply}>
            Apply
          </Button>
        </div>
      </aside>
    </>
  );
}
