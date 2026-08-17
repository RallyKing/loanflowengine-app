"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueries, type RequestForQueries } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useResponsiveNav } from "@/components/navigation/ResponsiveNavProvider";
import { useShellMotionReady } from "@/components/layout/ShellMotionReadyContext";
import { shellMotionTw } from "@/lib/ui/motionTokens";
import {
  layerZIndexStyle,
  overlayScrimClass,
  overlaySurfaceClass,
} from "@/lib/ui/layering";
import { cn } from "@/lib/cn";
import {
  opSearchOverlayInputClass,
  OP_SEARCH_OVERLAY_ROW_CLASS,
} from "@/lib/ui/operationalInputs";
import {
  useConvexSubMountTrace,
  useConvexSubQueryArgsTrace,
} from "@/lib/convexSubDiagnosticsHooks";
import {
  FileText,
  Landmark,
  ListTodo,
  Search,
  UserCircle2,
  X,
} from "lucide-react";
import { ClientRelationshipBadge } from "@/components/pipeline/ClientRelationshipBadge";
import { ResourceOwnershipBadge } from "@/components/ownership/ResourceOwnershipBadge";
import type { ClientRelationshipType } from "@/lib/pipelineClientRelationships";
import {
  groupGlobalSearchFileHits,
  type GlobalSearchFileHit,
} from "@/lib/pipeline/globalSearchFileGroups";

type SearchKind = "file" | "contact" | "lender" | "task";

type GlobalSearchResult = FunctionReturnType<typeof api.globalSearch.search>;

const KIND_FILTER: Array<{
  id: SearchKind;
  label: string;
  Icon: typeof FileText;
}> = [
  { id: "file", label: "Files", Icon: FileText },
  { id: "contact", label: "Contacts", Icon: UserCircle2 },
  { id: "lender", label: "Lenders", Icon: Landmark },
  { id: "task", label: "Tasks", Icon: ListTodo },
];

function kindIcon(kind: SearchKind) {
  switch (kind) {
    case "file":
      return FileText;
    case "contact":
      return UserCircle2;
    case "lender":
      return Landmark;
    case "task":
      return ListTodo;
  }
}

export function GlobalSearchPalette() {
  useConvexSubMountTrace("GlobalSearchPalette");
  const router = useRouter();
  const motionReady = useShellMotionReady();
  const { accountId } = useUserPreferences();
  const { activeOrganizationId } = useOrgPermissions();
  const { layout } = useResponsiveNav();
  const memberKey = accountId.trim();

  const [open, setOpen] = useState(false);
  const [tabletSearchExpanded, setTabletSearchExpanded] = useState(false);
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<SearchKind[]>([
    "file",
    "contact",
    "lender",
    "task",
  ]);
  const [includeArchivedFiles, setIncludeArchivedFiles] = useState(false);
  const [taskStatusFilter, setTaskStatusFilter] = useState<"open" | "all">(
    "open",
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const orgScope = useMemo(() => {
    if (!activeOrganizationId || !memberKey) return "skip" as const;
    return {
      organizationId: activeOrganizationId,
      memberUserKey: memberKey,
    };
  }, [activeOrganizationId, memberKey]);

  const trimmedQ = q.trim();
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(trimmedQ), 260);
    return () => window.clearTimeout(t);
  }, [trimmedQ]);

  const searchArgs = useMemo(() => {
    if (!open) return "skip" as const;
    if (orgScope === "skip") return "skip" as const;
    if (debouncedQ.length < 2) return "skip" as const;
    return {
      q: debouncedQ,
      ...orgScope,
      types,
      limitPerType: 8,
      includeArchivedFiles,
      taskStatusFilter,
    };
  }, [
    open,
    orgScope,
    debouncedQ,
    types,
    includeArchivedFiles,
    taskStatusFilter,
  ]);

  const searchQueries = useMemo((): RequestForQueries => {
    if (searchArgs === "skip") return {};
    return {
      globalSearch: { query: api.globalSearch.search, args: searchArgs },
    };
  }, [searchArgs]);

  useConvexSubQueryArgsTrace("GlobalSearchPalette", searchArgs, {
    queryKey: "globalSearch.search",
    route: "drawer",
  });
  const searchQueryResults = useQueries(searchQueries);
  const searchRaw =
    searchArgs === "skip" ? undefined : searchQueryResults.globalSearch;
  const result =
    searchRaw instanceof Error
      ? null
      : (searchRaw as GlobalSearchResult | null | undefined);
  const hits = useMemo(() => result?.hits ?? [], [result]);

  const searchListSegments = useMemo(() => {
    const segments: Array<
      | {
          type: "grouped-files";
          groups: ReturnType<typeof groupGlobalSearchFileHits>;
          hitIndices: Map<string, number>;
        }
      | { type: "hit"; hit: (typeof hits)[number]; idx: number }
    > = [];
    let fileBatch: Array<{ hit: GlobalSearchFileHit; idx: number }> = [];

    const flushFiles = () => {
      if (fileBatch.length === 0) return;
      const hitIndices = new Map<string, number>();
      for (const { hit, idx } of fileBatch) hitIndices.set(hit.id, idx);
      segments.push({
        type: "grouped-files",
        groups: groupGlobalSearchFileHits(fileBatch.map((x) => x.hit)),
        hitIndices,
      });
      fileBatch = [];
    };

    hits.forEach((h, idx) => {
      if (h.kind === "file") {
        fileBatch.push({ hit: h as GlobalSearchFileHit, idx });
        return;
      }
      flushFiles();
      segments.push({ type: "hit", hit: h, idx });
    });
    flushFiles();
    return segments;
  }, [hits]);

  useEffect(() => {
    setActiveIdx(0);
  }, [debouncedQ, types, includeArchivedFiles, taskStatusFilter]);

  useEffect(() => {
    if (!open && layout.shell === "tablet") {
      setTabletSearchExpanded(false);
    }
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open, layout.shell]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleType = useCallback((id: SearchKind) => {
    setTypes((prev) => {
      const has = prev.includes(id);
      if (has && prev.length === 1) return prev;
      if (has) return prev.filter((t) => t !== id);
      return [...prev, id];
    });
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQ("");
      router.push(href);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(0, hits.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && hits[activeIdx]) {
      e.preventDefault();
      go(hits[activeIdx]!.href);
    }
  };

  useEffect(() => {
    if (!listRef.current || hits.length === 0) return;
    const row = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${activeIdx}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, hits.length]);

  return (
    <>
      <div
        className={cn(
          layout.shell === "tablet" && "inline-flex min-w-0 shrink-0",
        )}
        onMouseEnter={() =>
          layout.shell === "tablet" && setTabletSearchExpanded(true)
        }
        onMouseLeave={() => {
          if (layout.shell === "tablet" && !open) setTabletSearchExpanded(false);
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            shellMotionTw.navLinkTone,
            !motionReady && "transition-none",
            layout.shell === "mobile" &&
              "inline-flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:bg-muted/50",
            layout.shell === "tablet" &&
              cn(
                "inline-flex h-9 min-w-9 shrink-0 items-center rounded-full border border-border bg-muted/25 text-left text-xs text-muted-foreground shadow-sm hover:bg-muted/50",
                shellMotionTw.tabletSearchTrigger,
                tabletSearchExpanded || open
                  ? "max-w-[min(14rem,42vw)] gap-2 px-3"
                  : "max-w-9 justify-center gap-0 px-0",
              ),
            layout.shell === "desktop" &&
              "inline-flex h-9 max-w-[220px] flex-1 items-center gap-2 rounded-md border border-border bg-muted/25 px-2.5 text-left text-xs text-muted-foreground shadow-sm hover:bg-muted/50 sm:max-w-xs",
          )}
          aria-label="Open search"
          onFocus={() =>
            layout.shell === "tablet" && setTabletSearchExpanded(true)
          }
          onBlur={(e) => {
            if (layout.shell !== "tablet" || open) return;
            const next = e.relatedTarget as Node | null;
            if (e.currentTarget.parentElement?.contains(next)) return;
            window.setTimeout(() => setTabletSearchExpanded(false), 140);
          }}
        >
          <Search className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          {layout.shell === "desktop" ? (
            <>
              <span className="truncate">Search…</span>
              <kbd className="ml-auto hidden shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
                ⌘K
              </kbd>
            </>
          ) : null}
          {layout.shell === "tablet" && (tabletSearchExpanded || open) ? (
            <span className="min-w-0 flex-1 truncate">Search</span>
          ) : null}
        </button>
      </div>

      {open ? (
        <div
          className={cn(
            "fixed inset-0 flex justify-center",
            shellMotionTw.searchBackdrop,
            !motionReady && "transition-none",
            overlayScrimClass(),
            layout.shell === "mobile"
              ? "items-end p-0 pt-[max(2.75rem,env(safe-area-inset-top)+1rem)]"
              : "items-start p-4 pt-[12dvh]",
          )}
          style={layerZIndexStyle("COMMAND_PALETTE")}
          role="dialog"
          aria-modal="true"
          aria-label="Global search"
        >
          <button
            type="button"
            className={cn(
              "absolute inset-0 cursor-default",
              shellMotionTw.searchBackdrop,
              !motionReady && "transition-none",
            )}
            aria-label="Close search"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              overlaySurfaceClass("command-panel"),
              "shadow-xl",
              "relative flex max-h-[min(70dvh,560px)] w-full max-w-lg flex-col overflow-hidden",
              shellMotionTw.sheetBody,
              !motionReady && "transition-none",
              layout.shell === "mobile" && "max-h-[85dvh] max-w-none rounded-t-dlc-lg rounded-b-none border-x-0 border-b-0",
              layout.shell !== "mobile" && "rounded-dlc-md",
            )}
            style={layerZIndexStyle("COMMAND_PALETTE")}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={cn(
                OP_SEARCH_OVERLAY_ROW_CLASS,
                "border-b border-border px-3 py-2",
              )}
            >
              <Search className="h-4 w-4 shrink-0 text-foreground/55" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search files, contacts, lenders, tasks…"
                className={opSearchOverlayInputClass({ className: "py-1.5" })}
                autoComplete="off"
                aria-label="Search query"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
              {KIND_FILTER.map(({ id, label, Icon }) => {
                const on = types.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleType(id)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                      on
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    <Icon className="h-3 w-3" aria-hidden />
                    {label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setIncludeArchivedFiles((v) => !v)}
                className={cn(
                  "ml-auto rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  includeArchivedFiles
                    ? "border-amber-400/60 bg-amber-100/50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
                    : "border-border text-muted-foreground",
                )}
              >
                Archived files
              </button>
              <button
                type="button"
                onClick={() =>
                  setTaskStatusFilter((t) => (t === "open" ? "all" : "open"))
                }
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  taskStatusFilter === "all"
                    ? "border-primary/40 bg-primary/10"
                    : "border-border text-muted-foreground",
                )}
              >
                Tasks: {taskStatusFilter === "open" ? "open" : "all"}
              </button>
            </div>

            <div
              ref={listRef}
              className="min-h-0 flex-1 touch-scroll-y overflow-y-auto px-1 py-2"
            >
              {trimmedQ.length < 2 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Type at least 2 characters…
                </p>
              ) : orgScope === "skip" ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Set an account id in Settings to search within your
                  organization.
                </p>
              ) : hits.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No matches.
                </p>
              ) : (
                <ul className="space-y-1" data-testid="global-search-results">
                  {searchListSegments.map((seg, segIdx) => {
                    if (seg.type === "hit") {
                      const h = seg.hit;
                      const idx = seg.idx;
                      const Icon = kindIcon(h.kind);
                      const active = idx === activeIdx;
                      return (
                        <li key={`${h.kind}:${h.id}:${segIdx}`}>
                          <button
                            type="button"
                            data-idx={idx}
                            onClick={() => go(h.href)}
                            onMouseEnter={() => setActiveIdx(idx)}
                            className={cn(
                              "flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm",
                              active ? "bg-muted" : "hover:bg-muted/60",
                            )}
                          >
                            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-foreground">
                                {h.title}
                              </span>
                              {h.subtitle ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {h.subtitle}
                                </span>
                              ) : null}
                              <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                {"ownershipBadge" in h && h.ownershipBadge ? (
                                  <ResourceOwnershipBadge badge={h.ownershipBadge} />
                                ) : null}
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                                  {h.kind}
                                </span>
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    }
                    return (
                      <li key={`files:${segIdx}`} className="space-y-1">
                        {seg.groups.map((client) => (
                          <div key={client.clientKey} className="space-y-0.5">
                            <p className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {client.clientLabel}
                            </p>
                            {client.projects.map((project) => (
                              <div key={project.projectKey} className="space-y-0.5">
                                <p className="px-3 pl-5 text-[10px] font-medium text-muted-foreground/90">
                                  {project.projectLabel}
                                </p>
                                <ul className="space-y-0.5">
                                  {project.hits.map((h) => {
                                    const idx = seg.hitIndices.get(h.id) ?? 0;
                                    const active = idx === activeIdx;
                                    return (
                                      <li key={`file:${h.id}`}>
                                        <button
                                          type="button"
                                          data-idx={idx}
                                          onClick={() => go(h.href)}
                                          onMouseEnter={() => setActiveIdx(idx)}
                                          className={cn(
                                            "flex w-full items-start gap-2 rounded-lg py-2 pl-8 pr-3 text-left text-sm",
                                            active ? "bg-muted" : "hover:bg-muted/60",
                                          )}
                                        >
                                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                          <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium text-foreground">
                                              {h.title}
                                            </span>
                                            {h.subtitle ? (
                                              <span className="block truncate text-xs text-muted-foreground">
                                                {h.subtitle}
                                              </span>
                                            ) : null}
                                            {h.matchedRelationship ? (
                                              <ClientRelationshipBadge
                                                type={
                                                  h.matchedRelationship as ClientRelationshipType
                                                }
                                                compact
                                              />
                                            ) : null}
                                          </span>
                                        </button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            ))}
                          </div>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
              ↑↓ select · ↵ open · esc close
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
