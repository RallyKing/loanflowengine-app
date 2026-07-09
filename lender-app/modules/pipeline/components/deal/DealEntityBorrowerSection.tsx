"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Building2, ChevronDown, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { registryRoleDisplayName } from "@/lib/registry/universalRoles";
import { cn } from "@/lib/cn";

export type DealEntityBorrowerSectionProps = {
  fileId: Id<"pipeline">;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  /** Current inline entity name from `dealData.business.legalName` (may lag the canonical row). */
  boundEntityName?: string;
  /** Applied after a successful bind so the local deal draft matches the server. */
  onBound?: (businessPatch: Record<string, unknown>) => void;
};

/**
 * Phase Modular-A — entity borrower mode. Binds the file to a canonical
 * `clients` row and renders expandable people sub-records (guarantors,
 * sponsors, signers) from `entityContactLinks`.
 */
export function DealEntityBorrowerSection({
  fileId,
  organizationId,
  memberUserKey,
  boundEntityName,
  onBound,
}: DealEntityBorrowerSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [binding, setBinding] = useState(false);
  const [subRecordsOpen, setSubRecordsOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canQuery = Boolean(organizationId && memberUserKey);

  const canonical = useQuery(
    api.entityCanonicalization.getCanonicalEntityForFile,
    canQuery ? { fileId, memberUserKey } : "skip",
  );

  const trimmedSearch = searchQuery.trim();
  const searchResults = useQuery(
    api.registry.list,
    canQuery && trimmedSearch.length >= 2
      ? {
          organizationId: organizationId!,
          memberUserKey: memberUserKey!,
          searchQuery: trimmedSearch,
          typeFilter: ["entity" as const],
          limit: 8,
        }
      : "skip",
  );

  const bindEntity = useMutation(
    api.entityCanonicalization.bindEntityBorrowerToFile,
  );

  const client = canonical?.client ?? null;
  const subRecords = useMemo(
    () => canonical?.subRecords ?? [],
    [canonical?.subRecords],
  );

  const handleBind = async (clientId: Id<"clients">) => {
    if (!memberUserKey) return;
    setError(null);
    setBinding(true);
    try {
      const res = await bindEntity({ fileId, clientId, memberUserKey });
      setSearchQuery("");
      onBound?.(res.business);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBinding(false);
    }
  };

  if (!canQuery) {
    return (
      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        Entity borrowers require an organization workspace.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="deal-entity-borrower-section">
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {client ? (
        <div className="rounded-md border border-border/70 bg-background p-3">
          <div className="flex items-start gap-2">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <Link
                href={`/contacts/entity/${client._id}`}
                className="text-sm font-semibold text-foreground underline-offset-2 hover:underline"
                data-testid="deal-entity-borrower-name"
              >
                {client.displayName}
              </Link>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {client.entityTypeLabel ? (
                  <span>{client.entityTypeLabel}</span>
                ) : null}
                {client.ein ? <span>EIN {client.ein}</span> : null}
                {client.stateOfIncorporation ? (
                  <span>{client.stateOfIncorporation}</span>
                ) : null}
              </div>
            </div>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              Entity borrower
            </span>
          </div>

          <div className="mt-3 border-t border-border/60 pt-2">
            <button
              type="button"
              className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              onClick={() => setSubRecordsOpen((v) => !v)}
              aria-expanded={subRecordsOpen}
              data-testid="deal-entity-subrecords-toggle"
            >
              {subRecordsOpen ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              )}
              Guarantors & sponsors ({subRecords.length})
            </button>
            {subRecordsOpen ? (
              subRecords.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No linked people yet. Guarantors added below are linked here
                  automatically.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {subRecords.map((rec) => (
                    <li
                      key={rec.linkId}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 text-xs"
                    >
                      <Link
                        href={`/contacts/${rec.contactId}`}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {rec.contactName}
                      </Link>
                      <span className="text-muted-foreground">
                        {rec.position}
                      </span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {rec.registryRoleId
                          ? registryRoleDisplayName(rec.registryRoleId)
                          : rec.relationshipRole}
                      </span>
                      {rec.ownershipPercentage != null ? (
                        <span className="ml-auto text-muted-foreground">
                          {rec.ownershipPercentage}% ownership
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        </div>
      ) : boundEntityName ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Entity “{boundEntityName}” is stored inline on this file but has no
          canonical record yet. Saving guarantors (or re-binding below) creates
          one automatically.
        </p>
      ) : null}

      <div className="rounded-md border border-border/70 bg-muted/20 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {client ? "Change entity borrower" : "Bind entity borrower"}
        </p>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-8"
            placeholder="Search entities (LLCs, corps)…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            aria-label="Search existing business entities"
            data-testid="deal-entity-borrower-search"
          />
        </div>
        {trimmedSearch.length >= 2 ? (
          searchResults === undefined ? (
            <p className="mt-2 text-xs text-muted-foreground" role="status">
              Searching…
            </p>
          ) : searchResults.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No matching entities. Create one from the Registry, or fill the
              entity fields in the Business section — it is registered
              automatically on save.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {searchResults.map((item) => (
                <li key={item._id}>
                  <button
                    type="button"
                    disabled={binding}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-left text-sm",
                      "hover:border-primary/40 hover:bg-primary/5",
                      binding && "opacity-60",
                    )}
                    onClick={() =>
                      void handleBind(item._id as Id<"clients">)
                    }
                    data-testid="deal-entity-borrower-result"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {item.displayName}
                    </span>
                    <span className="shrink-0 text-xs text-primary">
                      {binding ? "Binding…" : "Bind to file"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
