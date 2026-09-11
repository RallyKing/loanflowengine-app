"use client";

/**
 * Multi-contact assignee picker for Schedule of REO (block or row).
 * File-linked contacts first; org registry search (contacts + entities) like vault assign.
 */
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Search, UserPlus, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import { normalizeContactIdList } from "@/lib/reo/scheduleOfReoModel";

export type ReoAssigneeOption = {
  id: string;
  name: string;
  role?: string;
  kind?: "contact" | "entity" | "file";
};

export function ReoAssigneeChips({
  ids,
  options,
  onRemove,
  readOnly,
  emptyLabel = "Unassigned",
  className,
}: {
  ids: readonly string[];
  options: readonly ReoAssigneeOption[];
  onRemove?: (id: string) => void;
  readOnly?: boolean;
  emptyLabel?: string;
  className?: string;
}) {
  const byId = useMemo(() => {
    const map = new Map<string, ReoAssigneeOption>();
    for (const opt of options) map.set(opt.id, opt);
    return map;
  }, [options]);
  const unique = normalizeContactIdList(ids);
  if (unique.length === 0) {
    return (
      <span className={cn("text-[11px] text-muted-foreground", className)}>
        {emptyLabel}
      </span>
    );
  }
  return (
    <ul className={cn("flex flex-wrap gap-1", className)}>
      {unique.map((id) => {
        const opt = byId.get(id);
        const label = opt?.name?.trim() || "Contact";
        return (
          <li
            key={id}
            className="inline-flex max-w-full items-center gap-1 rounded-dlc-sm bg-dlc-surface-high px-1.5 py-0.5 text-[11px] text-foreground"
          >
            <span className="min-w-0 truncate">{label}</span>
            {!readOnly && onRemove ? (
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${label}`}
                onClick={() => onRemove(id)}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function ReoContactMultiAssign({
  selectedIds,
  onChange,
  organizationId,
  memberUserKey,
  fileId,
  label = "Assign contacts",
  compact = false,
  readOnly = false,
}: {
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  fileId?: Id<"pipeline">;
  label?: string;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = normalizeContactIdList(selectedIds);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const fileContacts = useQuery(
    api.contactFileLinks.listLinkedContactsForFile,
    fileId
      ? {
          fileId,
          ...(memberUserKey ? { memberUserKey } : {}),
        }
      : "skip",
  );

  const registryRows = useQuery(
    api.registry.list,
    open && organizationId && memberUserKey
      ? {
          organizationId,
          memberUserKey,
          searchQuery: search.trim() || undefined,
          typeFilter: ["contact"],
          limit: 30,
        }
      : "skip",
  );

  const fileOptions = useMemo((): ReoAssigneeOption[] => {
    return (fileContacts ?? []).map((c) => ({
      id: String(c.contactId),
      name: c.name,
      role: c.role,
      kind: "file" as const,
    }));
  }, [fileContacts]);

  const registryOptions = useMemo((): ReoAssigneeOption[] => {
    return (registryRows ?? [])
      .filter((item) => item.registryType === "contact")
      .map((item) => ({
        id: String(item._id),
        name: item.displayName,
        kind: "contact" as const,
      }));
  }, [registryRows]);

  const allOptions = useMemo(() => {
    const map = new Map<string, ReoAssigneeOption>();
    for (const opt of [...fileOptions, ...registryOptions]) {
      if (!map.has(opt.id)) map.set(opt.id, opt);
    }
    return [...map.values()];
  }, [fileOptions, registryOptions]);

  const toggle = (id: string) => {
    if (readOnly) return;
    if (selectedSet.has(id)) {
      onChange(selected.filter((x) => x !== id));
      return;
    }
    onChange(normalizeContactIdList([...selected, id]));
  };

  if (readOnly) {
    return (
      <ReoAssigneeChips ids={selected} options={allOptions} readOnly />
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <ReoAssigneeChips
          ids={selected}
          options={allOptions}
          onRemove={(id) => onChange(selected.filter((x) => x !== id))}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-10 min-h-[40px] shrink-0 gap-1 px-2",
            compact && "h-10 w-10 min-w-[40px] p-0",
          )}
          aria-label={label}
          title={label}
          data-testid={compact ? "reo-row-assign" : "reo-block-assign"}
          onClick={() => setOpen(true)}
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          {compact ? null : <span className="hidden sm:inline">Assign</span>}
        </Button>
      </div>
      <OverlayShell
        open={open}
        onClose={() => {
          setOpen(false);
          setSearch("");
        }}
        align="bottom-sheet"
        aria-label={label}
        panelClassName="w-full max-w-md p-4"
        data-testid="reo-assign-dialog"
      >
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Select client, spouse, company contact, or any file / org contact.
          Multiple assignees are allowed.
        </p>
        {organizationId && memberUserKey ? (
          <div className="relative mt-3">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search org contacts…"
              className="h-10 min-h-[40px] pl-8"
              autoFocus
            />
          </div>
        ) : null}
        <div className="mt-3 max-h-[min(50dvh,360px)] space-y-3 overflow-y-auto overscroll-contain">
          <AssigneeGroup
            label="On this file"
            options={fileOptions}
            selectedSet={selectedSet}
            onToggle={toggle}
            empty="No contacts linked to this file yet."
          />
          {organizationId && memberUserKey ? (
            <AssigneeGroup
              label={search.trim() ? "Search results" : "Org directory"}
              options={registryOptions.filter(
                (opt) => !fileOptions.some((f) => f.id === opt.id),
              )}
              selectedSet={selectedSet}
              onToggle={toggle}
              empty={
                registryRows === undefined
                  ? "Loading…"
                  : "No matching contacts."
              }
            />
          ) : null}
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-10"
            onClick={() => {
              setOpen(false);
              setSearch("");
            }}
          >
            Done
          </Button>
        </div>
      </OverlayShell>
    </div>
  );
}

function AssigneeGroup({
  label,
  options,
  selectedSet,
  onToggle,
  empty,
}: {
  label: string;
  options: ReoAssigneeOption[];
  selectedSet: Set<string>;
  onToggle: (id: string) => void;
  empty: string;
}) {
  return (
    <div>
      <p className="sticky top-0 z-[1] bg-dlc-surface/95 px-1 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
        {label}
      </p>
      {options.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {options.map((opt) => {
            const checked = selectedSet.has(opt.id);
            return (
              <li key={`${opt.kind ?? "c"}-${opt.id}`}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full min-h-10 items-center gap-2 rounded-dlc-sm px-2 text-left text-sm",
                    "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    checked && "bg-primary/10",
                  )}
                  aria-pressed={checked}
                  onClick={() => onToggle(opt.id)}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-dlc-sm border border-border",
                      checked &&
                        "border-primary bg-primary text-primary-foreground",
                    )}
                    aria-hidden
                  >
                    {checked ? (
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
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {opt.name}
                  </span>
                  {opt.role || opt.kind ? (
                    <span className="shrink-0 text-[10px] capitalize text-muted-foreground">
                      {opt.role || opt.kind}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
