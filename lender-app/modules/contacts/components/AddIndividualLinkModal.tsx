"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, UserCircle2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import { COMMON_INDIVIDUAL_RELATIONSHIP_TYPES } from "@/lib/contacts/individualContactRelationshipTypes";

const SEARCH_DEBOUNCE_MS = 280;

export type AddIndividualLinkModalProps = {
  open: boolean;
  onClose: () => void;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  contactId: Id<"contacts">;
  excludeContactIds?: Id<"contacts">[];
};

export function AddIndividualLinkModal({
  open,
  onClose,
  organizationId,
  memberUserKey,
  contactId,
  excludeContactIds = [],
}: AddIndividualLinkModalProps) {
  const createLink = useMutation(api.individualContactLinks.create);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedContactId, setSelectedContactId] =
    useState<Id<"contacts"> | null>(null);
  const [relationshipType, setRelationshipType] = useState("Spouse");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
      setSelectedContactId(null);
      setRelationshipType("Spouse");
      setNotes("");
      setError(null);
    }
  }, [open]);

  const searchResults = useQuery(
    api.crmIngestionSearch.searchIngestionByName,
    open && debouncedQuery.trim().length > 0
      ? {
          organizationId,
          memberUserKey,
          query: debouncedQuery.trim(),
          kind: "individual" as const,
          limit: 10,
        }
      : "skip",
  );

  const excludeSet = useMemo(
    () => new Set([contactId, ...excludeContactIds].map(String)),
    [contactId, excludeContactIds],
  );

  const matches = useMemo(() => {
    if (!searchResults) return [];
    return searchResults.individuals.filter(
      (row) => !excludeSet.has(String(row.contactId)),
    );
  }, [excludeSet, searchResults]);

  const onSubmit = useCallback(async () => {
    setError(null);
    if (!selectedContactId) {
      setError("Select an individual to link.");
      return;
    }
    const type = relationshipType.trim();
    if (!type) {
      setError("Relationship type is required.");
      return;
    }
    setSaving(true);
    try {
      await createLink({
        organizationId,
        memberUserKey,
        contactId1: contactId,
        contactId2: selectedContactId,
        relationshipType: type,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [
    contactId,
    createLink,
    memberUserKey,
    notes,
    onClose,
    organizationId,
    relationshipType,
    selectedContactId,
  ]);

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      panelClassName="flex max-h-[min(90dvh,560px)] w-full max-w-lg flex-col overflow-hidden p-0"
      aria-labelledby="add-individual-link-title"
      data-testid="add-individual-link-modal"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <div>
          <h2
            id="add-individual-link-title"
            className="flex items-center gap-2 text-base font-semibold"
          >
            <UserCircle2 className="h-4 w-4 text-primary" aria-hidden />
            Add relationship
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Link another individual — spouse, partner, referral source, etc.
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
        <div className="space-y-2">
          <Label htmlFor="individual-link-search">Search individuals</Label>
          <Input
            id="individual-link-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedContactId(null);
            }}
            placeholder="Search by name…"
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
                const active = selectedContactId === match.contactId;
                return (
                  <li key={String(match.contactId)}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={cn(
                        "flex w-full flex-col px-3 py-2 text-left transition-colors duration-dlc-short hover:bg-muted/50",
                        active && "bg-primary/10",
                      )}
                      onClick={() => setSelectedContactId(match.contactId)}
                    >
                      <span className="text-sm font-medium">{match.name}</span>
                      {match.email ? (
                        <span className="text-xs text-muted-foreground">
                          {match.email}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : debouncedQuery.trim() && searchResults !== undefined ? (
            <p className="text-xs text-muted-foreground">No matching individuals.</p>
          ) : null}
        </div>

        <Label htmlFor="individual-link-type">
          Relationship type
          <Input
            id="individual-link-type"
            className="mt-1 h-10"
            value={relationshipType}
            list="individual-relationship-suggestions"
            onChange={(e) => setRelationshipType(e.target.value)}
          />
          <datalist id="individual-relationship-suggestions">
            {COMMON_INDIVIDUAL_RELATIONSHIP_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Label>

        <Label htmlFor="individual-link-notes">
          Notes
          <Textarea
            id="individual-link-notes"
            className="mt-1"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional context…"
          />
        </Label>

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
          disabled={saving || !selectedContactId}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {saving ? "Linking…" : "Add relationship"}
        </Button>
      </div>
    </OverlayShell>
  );
}
