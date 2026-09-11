"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  buildListQueryArgs,
  emptyBrowseFilterForm,
} from "@/components/BrowseFiltersPanel";
import { SearchField } from "@/components/ui/SearchField";
import { LenderSearchResultRow } from "@/modules/pipeline/components/blocks/LenderSearchResultRow";

export type LenderSearchOrgArgs = {
  organizationId: Id<"organizations">;
  memberUserKey: string;
};

export type LenderSearchPanelProps = {
  fileId: Id<"pipeline">;
  readOnly?: boolean;
  attachedLenderIds: ReadonlySet<Id<"lenders">>;
  lenderOrgArgs: LenderSearchOrgArgs | null;
  attachError: string | null;
  onAttachErrorClear: () => void;
  onAddToConsideration: (payload: {
    lenderId: Id<"lenders">;
    hit: Doc<"lenders">;
  }) => Promise<void>;
};

/**
 * Isolated lender search — adds lenders to the Considering shortlist.
 * The panel stays open after each add.
 */
function LenderSearchPanelInner({
  readOnly = false,
  attachedLenderIds,
  lenderOrgArgs,
  attachError,
  onAttachErrorClear,
  onAddToConsideration,
}: LenderSearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [addingLenderId, setAddingLenderId] = useState<Id<"lenders"> | null>(
    null,
  );

  const lenderListArgs = useMemo(() => {
    if (!lenderOrgArgs || !searchQuery.trim()) return null;
    return {
      ...buildListQueryArgs(searchQuery, "", "", emptyBrowseFilterForm),
      limit: 40,
      ...lenderOrgArgs,
    };
  }, [lenderOrgArgs, searchQuery]);

  const searchHits = useQuery(
    api.lenders.list,
    lenderListArgs ? lenderListArgs : "skip",
  );

  const displaySearchHits = useMemo(() => {
    if (!searchQuery.trim()) return [];
    if (!searchHits) return undefined;
    const q = searchQuery.trim().toLowerCase();
    return searchHits.filter((hit) => {
      const haystack = [
        hit.company,
        hit.contactName,
        hit.email,
        hit.primaryNiche,
        hit.entityType,
        hit.statesServed,
        ...(hit.programList ?? []).map((p) => p.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [searchQuery, searchHits]);

  const hitsById = useMemo(() => {
    const m = new Map<Id<"lenders">, Doc<"lenders">>();
    for (const hit of searchHits ?? []) {
      m.set(hit._id, hit);
    }
    return m;
  }, [searchHits]);

  const addToFile = useCallback(
    async (lenderId: Id<"lenders">) => {
      if (readOnly || addingLenderId || attachedLenderIds.has(lenderId)) return;
      const hit = hitsById.get(lenderId);
      if (!hit) return;
      setAddingLenderId(lenderId);
      try {
        await onAddToConsideration({ lenderId, hit });
      } catch {
        /* parent sets attachError */
      } finally {
        setAddingLenderId(null);
      }
    },
    [addingLenderId, attachedLenderIds, hitsById, onAddToConsideration, readOnly],
  );

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    onAttachErrorClear();
  }, [onAttachErrorClear]);

  return (
    <div className="flex min-w-0 flex-col" data-testid="lender-search-panel">
      <p className="mb-1.5 text-xs leading-snug text-muted-foreground">
        Same search as lenders browse. Add to shortlist, then set board role
        below.
      </p>
      <SearchField
        placeholder="Search programs (e.g. DSCR, SBA 7a), company, contact, states…"
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.currentTarget.value);
          onAttachErrorClear();
        }}
        onClear={clearSearch}
        data-testid="file-lenders-search"
      />
      {!searchQuery.trim() ? null : displaySearchHits === undefined ? (
        <p className="mt-1.5 text-xs text-muted-foreground" role="status">
          Searching…
        </p>
      ) : displaySearchHits.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">No matches.</p>
      ) : (
        <ul
          data-nested-scroll
          className="mt-1.5 max-h-[min(40dvh,18rem)] touch-scroll-y space-y-1 overflow-y-auto overscroll-contain rounded-dlc-sm border border-border/60 bg-muted/10 p-1 md:max-h-none"
          aria-label="Lender search results"
          data-testid="lender-search-results"
        >
          {displaySearchHits.map((hit) => (
            <LenderSearchResultRow
              key={hit._id}
              hit={hit}
              isOnFile={attachedLenderIds.has(hit._id)}
              readOnly={readOnly}
              adding={addingLenderId === hit._id}
              onAddToFile={(lenderId) => void addToFile(lenderId)}
            />
          ))}
        </ul>
      )}
      {attachError ? (
        <p className="mt-1.5 text-xs text-destructive" role="alert">
          {attachError}
        </p>
      ) : null}
    </div>
  );
}

export const LenderSearchPanel = memo(LenderSearchPanelInner);
