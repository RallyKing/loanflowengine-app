"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Building2, Plus, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import {
  COMMON_ENTITY_POSITIONS,
  ENTITY_CONTACT_RELATIONSHIP_ROLES,
  type EntityContactRelationshipRoleId,
} from "@/lib/contacts/entityContactRoles";

const SEARCH_DEBOUNCE_MS = 280;

export type AddEntityToPortfolioModalProps = {
  open: boolean;
  onClose: () => void;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  contactId: Id<"contacts">;
  excludeEntityIds?: Id<"clients">[];
  onAdded?: (entityId: Id<"clients">) => void;
};

export function AddEntityToPortfolioModal({
  open,
  onClose,
  organizationId,
  memberUserKey,
  contactId,
  excludeEntityIds = [],
  onAdded,
}: AddEntityToPortfolioModalProps) {
  const addToPortfolio = useMutation(
    api.crmIngestionMutations.addEntityToPortfolio,
  );

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedEntityId, setSelectedEntityId] =
    useState<Id<"clients"> | null>(null);
  const [newEntityName, setNewEntityName] = useState("");
  const [position, setPosition] = useState("Owner");
  const [ownershipPercentage, setOwnershipPercentage] = useState("");
  const [relationshipRole, setRelationshipRole] =
    useState<EntityContactRelationshipRoleId>("client");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setMode("existing");
      setQuery("");
      setDebouncedQuery("");
      setSelectedEntityId(null);
      setNewEntityName("");
      setPosition("Owner");
      setOwnershipPercentage("");
      setRelationshipRole("client");
      setError(null);
    }
  }, [open]);

  const searchResults = useQuery(
    api.crmIngestionSearch.searchIngestionByName,
    open && mode === "existing" && debouncedQuery.trim().length > 0
      ? {
          organizationId,
          memberUserKey,
          query: debouncedQuery.trim(),
          kind: "entity" as const,
          limit: 10,
        }
      : "skip",
  );

  const excludeSet = useMemo(
    () => new Set(excludeEntityIds.map(String)),
    [excludeEntityIds],
  );

  const matches = useMemo(() => {
    if (!searchResults) return [];
    return searchResults.entities
      .filter((row) => !excludeSet.has(String(row.entityId)))
      .map((row) => ({
        entityId: row.entityId as Id<"clients">,
        label: row.displayName,
        secondary: [row.companyName, row.primaryContactName]
          .filter(Boolean)
          .join(" · "),
      }));
  }, [excludeSet, searchResults]);

  const onSubmit = useCallback(async () => {
    setError(null);
    const pos = position.trim();
    if (!pos) {
      setError("Position is required.");
      return;
    }
    setSaving(true);
    try {
      const ownership =
        ownershipPercentage.trim() === ""
          ? undefined
          : Number.parseFloat(ownershipPercentage.trim());
      if (
        ownershipPercentage.trim() !== "" &&
        (ownership === undefined || !Number.isFinite(ownership))
      ) {
        setError("Ownership % must be a valid number.");
        setSaving(false);
        return;
      }
      const result = await addToPortfolio({
        organizationId,
        memberUserKey,
        contactId,
        position: pos,
        relationshipRole,
        ...(ownership !== undefined ? { ownershipPercentage: ownership } : {}),
        ...(mode === "existing" && selectedEntityId
          ? { entityId: selectedEntityId }
          : {}),
        ...(mode === "new" && newEntityName.trim()
          ? { newEntity: { displayName: newEntityName.trim() } }
          : {}),
      });
      onAdded?.(result.entityId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [
    addToPortfolio,
    contactId,
    memberUserKey,
    mode,
    newEntityName,
    onAdded,
    onClose,
    organizationId,
    position,
    ownershipPercentage,
    relationshipRole,
    selectedEntityId,
  ]);

  const canSubmit =
    position.trim().length > 0 &&
    ((mode === "existing" && selectedEntityId !== null) ||
      (mode === "new" && newEntityName.trim().length > 0));

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      panelClassName="flex max-h-[min(90dvh,640px)] w-full max-w-lg flex-col overflow-hidden p-0"
      aria-labelledby="add-portfolio-entity-title"
      data-testid="add-entity-portfolio-modal"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <div>
          <h2
            id="add-entity-portfolio-title"
            className="flex items-center gap-2 text-base font-semibold"
          >
            <Building2 className="h-4 w-4 text-primary" aria-hidden />
            Add entity to portfolio
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Link a business entity this individual controls or operates.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        <div
          className="inline-flex w-full rounded-dlc-md border border-border bg-muted/40 p-0.5"
          role="group"
          aria-label="Entity source"
        >
          {(
            [
              ["existing", "Existing entity"],
              ["new", "Create new"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              className={cn(
                "min-h-9 flex-1 rounded-dlc-sm px-2 py-1.5 text-xs font-medium transition-all duration-dlc-short sm:text-sm",
                mode === id
                  ? "bg-background text-foreground shadow-dlc-1"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "existing" ? (
          <div className="space-y-2">
            <Label htmlFor="portfolio-entity-search">Search entities</Label>
            <Input
              id="portfolio-entity-search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedEntityId(null);
              }}
              placeholder="Search by entity name…"
              autoComplete="off"
            />
            {debouncedQuery.trim() && searchResults === undefined ? (
              <p className="text-xs text-muted-foreground">Searching…</p>
            ) : null}
            {matches.length > 0 ? (
              <ul
                className="max-h-40 overflow-y-auto rounded-dlc-md border border-border/80 py-1"
                role="listbox"
              >
                {matches.map((match) => {
                  const active = selectedEntityId === match.entityId;
                  return (
                    <li key={String(match.entityId)}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={cn(
                          "flex w-full flex-col px-3 py-2 text-left transition-colors duration-dlc-short hover:bg-muted/50",
                          active && "bg-primary/10",
                        )}
                        onClick={() => setSelectedEntityId(match.entityId)}
                      >
                        <span className="text-sm font-medium">{match.label}</span>
                        {match.secondary ? (
                          <span className="text-xs text-muted-foreground">
                            {match.secondary}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : debouncedQuery.trim() && searchResults !== undefined ? (
              <p className="text-xs text-muted-foreground">No matching entities.</p>
            ) : null}
          </div>
        ) : (
          <Label htmlFor="portfolio-new-entity-name">
            New entity name
            <Input
              id="portfolio-new-entity-name"
              className="mt-1 h-10"
              value={newEntityName}
              onChange={(e) => setNewEntityName(e.target.value)}
              placeholder="e.g. Acme Holdings LLC"
            />
          </Label>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Label htmlFor="portfolio-position">
            Position at entity
            <Input
              id="portfolio-position"
              className="mt-1 h-10"
              value={position}
              list="portfolio-position-suggestions"
              onChange={(e) => setPosition(e.target.value)}
            />
            <datalist id="portfolio-position-suggestions">
              {COMMON_ENTITY_POSITIONS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Label>
          <Label htmlFor="portfolio-rel-role">
            CRM relationship role
            <select
              id="portfolio-rel-role"
              className="mt-1 flex h-10 w-full rounded-dlc-md border border-input bg-background px-3 text-sm"
              value={relationshipRole}
              onChange={(e) =>
                setRelationshipRole(
                  e.currentTarget.value as EntityContactRelationshipRoleId,
                )
              }
            >
              {ENTITY_CONTACT_RELATIONSHIP_ROLES.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
          </Label>
          <Label htmlFor="portfolio-ownership">
            Ownership %
            <Input
              id="portfolio-ownership"
              className="mt-1 h-10"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={ownershipPercentage}
              onChange={(e) => setOwnershipPercentage(e.target.value)}
              placeholder="e.g. 51"
            />
          </Label>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border/70 px-4 py-3 sm:px-5">
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => void onSubmit()}
          disabled={saving || !canSubmit}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {saving ? "Adding…" : "Add to portfolio"}
        </Button>
      </div>
    </OverlayShell>
  );
}
