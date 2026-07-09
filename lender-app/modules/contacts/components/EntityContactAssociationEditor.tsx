"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  COMMON_ENTITY_POSITIONS,
  ENTITY_CONTACT_RELATIONSHIP_ROLES,
  type EntityContactRelationshipRoleId,
} from "@/lib/contacts/entityContactRoles";

const SEARCH_DEBOUNCE_MS = 280;

export type AssociationRowDraft = {
  key: string;
  existingId?: string;
  existingLabel?: string;
  searchQuery: string;
  mode: "search" | "create";
  newName: string;
  newEmail: string;
  newPhone: string;
  position: string;
  relationshipRole: EntityContactRelationshipRoleId;
};

export function emptyAssociationRow(): AssociationRowDraft {
  return {
    key: crypto.randomUUID(),
    searchQuery: "",
    mode: "search",
    newName: "",
    newEmail: "",
    newPhone: "",
    position: "",
    relationshipRole: "client",
  };
}

type TargetKind = "individual" | "entity";

type EntityContactAssociationEditorProps = {
  title: string;
  description: string;
  targetKind: TargetKind;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  rows: AssociationRowDraft[];
  onRowsChange: (rows: AssociationRowDraft[]) => void;
  disabled?: boolean;
};

export function EntityContactAssociationEditor({
  title,
  description,
  targetKind,
  organizationId,
  memberUserKey,
  rows,
  onRowsChange,
  disabled = false,
}: EntityContactAssociationEditorProps) {
  const searchKind = targetKind === "individual" ? "individual" : "entity";
  const [activeSearchKey, setActiveSearchKey] = useState<string | null>(null);
  const [debouncedByKey, setDebouncedByKey] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    if (!activeSearchKey) return;
    const row = rows.find((r) => r.key === activeSearchKey);
    if (!row) return;
    const t = window.setTimeout(() => {
      setDebouncedByKey((prev) => ({
        ...prev,
        [activeSearchKey]: row.searchQuery,
      }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [activeSearchKey, rows]);

  const activeDebounced = activeSearchKey
    ? debouncedByKey[activeSearchKey]?.trim() ?? ""
    : "";

  const searchResults = useQuery(
    api.crmIngestionSearch.searchIngestionByName,
    activeSearchKey && activeDebounced.length > 0
      ? {
          organizationId,
          memberUserKey,
          query: activeDebounced,
          kind: searchKind,
          limit: 6,
        }
      : "skip",
  );

  const matches = useMemo(() => {
    if (!searchResults) return [];
    if (targetKind === "individual") {
      return searchResults.individuals.map((row) => ({
        id: String(row.contactId),
        label: row.name,
        secondary: [row.email, row.companyName].filter(Boolean).join(" · "),
        contactId: row.contactId as Id<"contacts">,
      }));
    }
    return searchResults.entities.map((row) => ({
      id: String(row.entityId),
      label: row.displayName,
      secondary: [row.companyName, row.primaryContactName]
        .filter(Boolean)
        .join(" · "),
      entityId: row.entityId as Id<"clients">,
    }));
  }, [searchResults, targetKind]);

  const patchRow = useCallback(
    (key: string, patch: Partial<AssociationRowDraft>) => {
      onRowsChange(
        rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
      );
    },
    [onRowsChange, rows],
  );

  const addRow = useCallback(() => {
    onRowsChange([...rows, emptyAssociationRow()]);
  }, [onRowsChange, rows]);

  const removeRow = useCallback(
    (key: string) => {
      onRowsChange(rows.filter((row) => row.key !== key));
      if (activeSearchKey === key) setActiveSearchKey(null);
    },
    [activeSearchKey, onRowsChange, rows],
  );

  const pickMatch = useCallback(
    (key: string, match: (typeof matches)[number]) => {
      patchRow(key, {
        existingId: match.id,
        existingLabel: match.label,
        searchQuery: match.label,
        mode: "search",
        newName: "",
        newEmail: "",
        newPhone: "",
      });
      setActiveSearchKey(null);
    },
    [patchRow],
  );

  return (
    <div
      className="space-y-3 rounded-dlc-md border border-border/80 bg-muted/10 p-3"
      data-testid={`entity-contact-association-${targetKind}`}
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No associations yet. Add one to link{" "}
          {targetKind === "individual" ? "people" : "business entities"}.
        </p>
      ) : null}

      <ul className="space-y-3" role="list">
        {rows.map((row, index) => {
          const showDropdown =
            activeSearchKey === row.key &&
            row.mode === "search" &&
            !row.existingLabel &&
            row.searchQuery.trim().length > 0;

          return (
            <li
              key={row.key}
              className="space-y-2 rounded-dlc-sm border border-border/70 bg-background p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  #{index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  aria-label="Remove association"
                  disabled={disabled}
                  onClick={() => removeRow(row.key)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>

              {row.mode === "search" ? (
                <div className="relative">
                  <Label htmlFor={`assoc-search-${row.key}`}>
                    {targetKind === "individual"
                      ? "Individual"
                      : "Business entity"}
                  </Label>
                  <Input
                    id={`assoc-search-${row.key}`}
                    className="mt-1 h-10"
                    value={row.searchQuery}
                    disabled={disabled}
                    placeholder={
                      targetKind === "individual"
                        ? "Search existing contact…"
                        : "Search existing entity…"
                    }
                    onFocus={() => setActiveSearchKey(row.key)}
                    onChange={(e) => {
                      patchRow(row.key, {
                        searchQuery: e.target.value,
                        existingId: undefined,
                        existingLabel: undefined,
                      });
                      setActiveSearchKey(row.key);
                    }}
                  />
                  {row.existingLabel ? (
                    <p className="mt-1 text-xs text-primary">
                      Selected: {row.existingLabel}
                      <button
                        type="button"
                        className="ml-2 underline-offset-2 hover:underline"
                        disabled={disabled}
                        onClick={() =>
                          patchRow(row.key, {
                            existingId: undefined,
                            existingLabel: undefined,
                            searchQuery: "",
                          })
                        }
                      >
                        Change
                      </button>
                    </p>
                  ) : null}
                  {showDropdown ? (
                    <ul
                      className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-dlc-md border border-border/80 bg-background py-1 shadow-dlc-2"
                      role="listbox"
                    >
                      {searchResults === undefined ? (
                        <li className="px-3 py-2 text-xs text-muted-foreground">
                          Searching…
                        </li>
                      ) : matches.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-muted-foreground">
                          No matches
                        </li>
                      ) : (
                        matches.map((match) => (
                          <li key={match.id}>
                            <button
                              type="button"
                              className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted/60"
                              onClick={() => pickMatch(row.key, match)}
                            >
                              <span className="text-sm font-medium">
                                {match.label}
                              </span>
                              {match.secondary ? (
                                <span className="text-xs text-muted-foreground">
                                  {match.secondary}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor={`assoc-new-name-${row.key}`}>
                    {targetKind === "individual" ? "Full name" : "Entity name"}
                    <Input
                      id={`assoc-new-name-${row.key}`}
                      className="mt-1 h-10"
                      value={row.newName}
                      disabled={disabled}
                      onChange={(e) =>
                        patchRow(row.key, { newName: e.target.value })
                      }
                    />
                  </Label>
                  {targetKind === "individual" ? (
                    <>
                      <Label htmlFor={`assoc-new-email-${row.key}`}>
                        Email
                        <Input
                          id={`assoc-new-email-${row.key}`}
                          className="mt-1 h-10"
                          type="email"
                          value={row.newEmail}
                          disabled={disabled}
                          onChange={(e) =>
                            patchRow(row.key, { newEmail: e.target.value })
                          }
                        />
                      </Label>
                      <Label htmlFor={`assoc-new-phone-${row.key}`}>
                        Phone
                        <Input
                          id={`assoc-new-phone-${row.key}`}
                          className="mt-1 h-10"
                          type="tel"
                          value={row.newPhone}
                          disabled={disabled}
                          onChange={(e) =>
                            patchRow(row.key, { newPhone: e.target.value })
                          }
                        />
                      </Label>
                    </>
                  ) : null}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn(
                    "text-xs font-medium underline-offset-2 hover:underline",
                    row.mode === "search" ? "text-primary" : "text-muted-foreground",
                  )}
                  disabled={disabled}
                  onClick={() =>
                    patchRow(row.key, {
                      mode: "search",
                      newName: "",
                      newEmail: "",
                      newPhone: "",
                    })
                  }
                >
                  Search existing
                </button>
                <span className="text-xs text-muted-foreground">·</span>
                <button
                  type="button"
                  className={cn(
                    "text-xs font-medium underline-offset-2 hover:underline",
                    row.mode === "create" ? "text-primary" : "text-muted-foreground",
                  )}
                  disabled={disabled}
                  onClick={() =>
                    patchRow(row.key, {
                      mode: "create",
                      existingId: undefined,
                      existingLabel: undefined,
                      searchQuery: "",
                    })
                  }
                >
                  Create new inline
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Label htmlFor={`assoc-position-${row.key}`}>
                  Position
                  <Input
                    id={`assoc-position-${row.key}`}
                    className="mt-1 h-10"
                    value={row.position}
                    disabled={disabled}
                    placeholder="e.g. Owner, CFO"
                    list={`assoc-position-suggestions-${row.key}`}
                    onChange={(e) =>
                      patchRow(row.key, { position: e.target.value })
                    }
                  />
                  <datalist id={`assoc-position-suggestions-${row.key}`}>
                    {COMMON_ENTITY_POSITIONS.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </Label>
                <Label htmlFor={`assoc-role-${row.key}`}>
                  Relationship role
                  <select
                    id={`assoc-role-${row.key}`}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={row.relationshipRole}
                    disabled={disabled}
                    onChange={(e) =>
                      patchRow(row.key, {
                        relationshipRole: e.currentTarget
                          .value as EntityContactRelationshipRoleId,
                      })
                    }
                  >
                    {ENTITY_CONTACT_RELATIONSHIP_ROLES.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </Label>
              </div>
            </li>
          );
        })}
      </ul>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={addRow}
      >
        <Plus className="mr-1.5 h-4 w-4" aria-hidden />
        Add association
      </Button>
    </div>
  );
}

export function validateAssociationRows(
  rows: AssociationRowDraft[],
): string | null {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const hasTarget =
      Boolean(row.existingId) ||
      (row.mode === "create" && row.newName.trim().length > 0) ||
      (row.mode === "search" && row.existingId);
    if (!hasTarget) {
      return `Association #${i + 1}: select or create a record.`;
    }
    if (!row.position.trim()) {
      return `Association #${i + 1}: position is required.`;
    }
    if (!row.relationshipRole) {
      return `Association #${i + 1}: relationship role is required.`;
    }
  }
  return null;
}

export function associationRowsToIndividualPayload(
  rows: AssociationRowDraft[],
) {
  return rows.map((row) => {
    if (row.existingId) {
      return {
        contactId: row.existingId as Id<"contacts">,
        position: row.position.trim(),
        relationshipRole: row.relationshipRole,
      };
    }
    return {
      newContact: {
        name: row.newName.trim(),
        email: row.newEmail.trim() || undefined,
        phone: row.newPhone.trim() || undefined,
      },
      position: row.position.trim(),
      relationshipRole: row.relationshipRole,
    };
  });
}

export function associationRowsToEntityPayload(rows: AssociationRowDraft[]) {
  return rows.map((row) => {
    if (row.existingId) {
      return {
        entityId: row.existingId as Id<"clients">,
        position: row.position.trim(),
        relationshipRole: row.relationshipRole,
      };
    }
    return {
      newEntity: {
        displayName: row.newName.trim(),
      },
      position: row.position.trim(),
      relationshipRole: row.relationshipRole,
    };
  });
}
