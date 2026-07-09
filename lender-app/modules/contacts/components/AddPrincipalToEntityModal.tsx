"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { UserCircle2, X } from "lucide-react";
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

export type AddPrincipalToEntityModalProps = {
  open: boolean;
  onClose: () => void;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  entityId: Id<"clients">;
  excludeContactIds?: Id<"contacts">[];
  onAdded?: (contactId: Id<"contacts">) => void;
};

export function AddPrincipalToEntityModal({
  open,
  onClose,
  organizationId,
  memberUserKey,
  entityId,
  excludeContactIds = [],
  onAdded,
}: AddPrincipalToEntityModalProps) {
  const addPrincipal = useMutation(api.crmIngestionMutations.addPrincipalToEntity);

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedContactId, setSelectedContactId] =
    useState<Id<"contacts"> | null>(null);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [position, setPosition] = useState("Owner");
  const [ownershipPercentage, setOwnershipPercentage] = useState("");
  const [relationshipRole, setRelationshipRole] =
    useState<EntityContactRelationshipRoleId>("borrower");
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
      setSelectedContactId(null);
      setNewContactName("");
      setNewContactEmail("");
      setPosition("Owner");
      setOwnershipPercentage("");
      setRelationshipRole("borrower");
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
          kind: "individual" as const,
          limit: 10,
        }
      : "skip",
  );

  const excludeSet = useMemo(
    () => new Set(excludeContactIds.map(String)),
    [excludeContactIds],
  );

  const matches = useMemo(() => {
    if (!searchResults) return [];
    return searchResults.individuals
      .filter((row) => !excludeSet.has(String(row.contactId)))
      .map((row) => ({
        contactId: row.contactId as Id<"contacts">,
        label: row.name,
        secondary: [row.email, row.companyName].filter(Boolean).join(" · "),
      }));
  }, [excludeSet, searchResults]);

  const onSubmit = useCallback(async () => {
    setError(null);
    const pos = position.trim();
    if (!pos) {
      setError("Title / position is required.");
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
        (ownership == null || Number.isNaN(ownership) || ownership < 0 || ownership > 100)
      ) {
        setError("Ownership must be between 0 and 100.");
        setSaving(false);
        return;
      }

      const result = await addPrincipal({
        organizationId,
        entityId,
        contactId: mode === "existing" ? selectedContactId ?? undefined : undefined,
        newContact:
          mode === "new" && newContactName.trim()
            ? {
                name: newContactName.trim(),
                email: newContactEmail.trim() || undefined,
              }
            : undefined,
        position: pos,
        relationshipRole,
        ownershipPercentage: ownership,
        memberUserKey,
      });
      onAdded?.(result.contactId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add principal.");
    } finally {
      setSaving(false);
    }
  }, [
    addPrincipal,
    entityId,
    memberUserKey,
    mode,
    newContactEmail,
    newContactName,
    onAdded,
    onClose,
    organizationId,
    ownershipPercentage,
    position,
    relationshipRole,
    selectedContactId,
  ]);

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      panelClassName="flex max-h-[min(90dvh,640px)] w-full max-w-lg flex-col overflow-hidden p-0"
      aria-labelledby="add-principal-entity-title"
      data-testid="add-principal-entity-modal"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
        <div>
          <h2
            id="add-principal-entity-title"
            className="flex items-center gap-2 text-base font-semibold"
          >
            <UserCircle2 className="h-4 w-4 text-primary" aria-hidden />
            Add principal / owner
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Link an existing individual or create a new one with ownership equity.
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
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
        <div
          className="inline-flex w-full rounded-dlc-md border border-slate-200 bg-muted/40 p-0.5"
          role="group"
          aria-label="Individual source"
        >
          {(
            [
              ["existing", "Existing individual"],
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
          <div className="space-y-3">
            <Label htmlFor="principal-search">
              Search by name
              <Input
                id="principal-search"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder="Start typing…"
                className="mt-1.5"
                autoFocus
              />
            </Label>
            {debouncedQuery.trim() && matches.length === 0 && searchResults !== undefined ? (
              <p className="text-sm text-muted-foreground">No matching individuals.</p>
            ) : null}
            <ul className="max-h-48 space-y-1 overflow-y-auto" role="listbox">
              {matches.map((row) => (
                <li key={String(row.contactId)}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedContactId === row.contactId}
                    onClick={() => setSelectedContactId(row.contactId)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-dlc-md border px-3 py-2.5 text-left text-sm transition-colors duration-dlc-short",
                      selectedContactId === row.contactId
                        ? "border-primary bg-primary/5"
                        : "border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <UserCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span>
                      <span className="font-medium text-foreground">{row.label}</span>
                      {row.secondary ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {row.secondary}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="grid gap-3">
            <Label htmlFor="new-principal-name">
              Full name
              <Input
                id="new-principal-name"
                value={newContactName}
                onChange={(e) => setNewContactName(e.currentTarget.value)}
                placeholder="Jane Smith"
                className="mt-1.5"
              />
            </Label>
            <Label htmlFor="new-principal-email">
              Email (optional)
              <Input
                id="new-principal-email"
                type="email"
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.currentTarget.value)}
                className="mt-1.5"
              />
            </Label>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Label htmlFor="principal-position">
            Title / position
            <Input
              id="principal-position"
              value={position}
              onChange={(e) => setPosition(e.currentTarget.value)}
              list="entity-position-suggestions"
              className="mt-1.5"
            />
            <datalist id="entity-position-suggestions">
              {COMMON_ENTITY_POSITIONS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Label>
          <Label htmlFor="principal-ownership">
            Ownership %
            <Input
              id="principal-ownership"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={ownershipPercentage}
              onChange={(e) => setOwnershipPercentage(e.currentTarget.value)}
              placeholder="e.g. 25"
              className="mt-1.5"
            />
          </Label>
        </div>

        <Label htmlFor="principal-role">
          CRM role
          <select
            id="principal-role"
            className="mt-1.5 flex h-10 w-full rounded-dlc-md border border-input bg-background px-3 text-sm"
            value={relationshipRole}
            onChange={(e) =>
              setRelationshipRole(e.currentTarget.value as EntityContactRelationshipRoleId)
            }
          >
            {ENTITY_CONTACT_RELATIONSHIP_ROLES.map((role) => (
              <option key={role.id} value={role.id}>
                {role.label}
              </option>
            ))}
          </select>
        </Label>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void onSubmit()}
            disabled={
              saving ||
              (mode === "existing" && !selectedContactId) ||
              (mode === "new" && !newContactName.trim())
            }
          >
            {saving ? "Adding…" : "Add principal"}
          </Button>
        </div>
      </div>
    </OverlayShell>
  );
}
