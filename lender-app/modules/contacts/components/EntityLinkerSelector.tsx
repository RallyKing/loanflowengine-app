"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Building2, Plus, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  COMMON_ENTITY_POSITIONS,
  ENTITY_CONTACT_RELATIONSHIP_ROLES,
  entityContactRelationshipLabel,
  type EntityContactRelationshipRoleId,
} from "@/lib/contacts/entityContactRoles";
import type { EntityLinkDraft } from "@/lib/contacts/contactWithPrimaryEntity";

const SEARCH_DEBOUNCE_MS = 280;

type EntityLinkerSelectorProps = {
  organizationId: Id<"organizations">;
  memberUserKey: string;
  value: EntityLinkDraft;
  onChange: (next: EntityLinkDraft) => void;
  onOpenEntity?: (entityId: Id<"clients">) => void;
  /** Legacy plain-text company on the contact when no junction link exists yet. */
  legacyCompanyName?: string;
  disabled?: boolean;
  id?: string;
};

export function EntityLinkerSelector({
  organizationId,
  memberUserKey,
  value,
  onChange,
  onOpenEntity,
  legacyCompanyName,
  disabled = false,
  id = "entity-linker-search",
}: EntityLinkerSelectorProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [inlineCreateOpen, setInlineCreateOpen] = useState(false);
  const [inlinePosition, setInlinePosition] = useState("Owner");
  const [inlineRole, setInlineRole] =
    useState<EntityContactRelationshipRoleId>("client");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (value.kind === "existing") {
      setQuery(value.displayName);
    } else if (value.kind === "new") {
      setQuery(value.displayName);
      setInlinePosition(value.position);
      setInlineRole(value.relationshipRole);
      setInlineCreateOpen(true);
    } else {
      setQuery("");
    }
  }, [value]);

  const searchResults = useQuery(
    api.crmIngestionSearch.searchIngestionByName,
    dropdownOpen && debouncedQuery.trim().length > 0
      ? {
          organizationId,
          memberUserKey,
          query: debouncedQuery.trim(),
          kind: "entity" as const,
          limit: 8,
        }
      : "skip",
  );

  const matches = useMemo(() => {
    if (!searchResults) return [];
    return searchResults.entities.map((row) => ({
      entityId: row.entityId as Id<"clients">,
      label: row.displayName,
      secondary: [row.companyName, row.primaryContactName]
        .filter(Boolean)
        .join(" · "),
    }));
  }, [searchResults]);

  const trimmedQuery = query.trim();
  const showCreateAction =
    trimmedQuery.length > 0 &&
    (searchResults === undefined ||
      !matches.some(
        (m) => m.label.toLowerCase() === trimmedQuery.toLowerCase(),
      ));

  const pickExisting = useCallback(
    (entityId: Id<"clients">, displayName: string) => {
      onChange({
        kind: "existing",
        entityId,
        displayName,
        position:
          value.kind === "existing" && value.position.trim()
            ? value.position
            : "Owner",
        relationshipRole:
          value.kind === "existing" ? value.relationshipRole : "client",
      });
      setQuery(displayName);
      setDropdownOpen(false);
      setInlineCreateOpen(false);
    },
    [onChange, value],
  );

  const confirmInlineCreate = useCallback(() => {
    const displayName = trimmedQuery;
    if (!displayName) return;
    const position = inlinePosition.trim();
    if (!position) return;
    onChange({
      kind: "new",
      displayName,
      position,
      relationshipRole: inlineRole,
    });
    setInlineCreateOpen(false);
    setDropdownOpen(false);
  }, [inlinePosition, inlineRole, onChange, trimmedQuery]);

  const clearLink = useCallback(() => {
    onChange({ kind: "none" });
    setQuery("");
    setInlineCreateOpen(false);
    setDropdownOpen(false);
  }, [onChange]);

  return (
    <div className="space-y-2" data-testid="entity-linker-selector">
      <Label htmlFor={id}>Business entity</Label>
      <p className="text-xs text-muted-foreground">
        Link this person to a corporate record. Search existing entities or
        create one inline.
      </p>

      {value.kind === "none" && legacyCompanyName?.trim() ? (
        <div
          className="rounded-dlc-md border border-amber-300/80 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-50"
          role="status"
          data-testid="entity-linker-legacy-company"
        >
          Legacy company &ldquo;{legacyCompanyName.trim()}&rdquo; is not linked
          to a business entity. Search below to connect a corporate record for
          KYC and relationships.
        </div>
      ) : null}

      {value.kind !== "none" && !inlineCreateOpen ? (
        <div className="flex items-start justify-between gap-2 rounded-dlc-md border border-primary/25 bg-primary/5 px-3 py-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              {value.kind === "existing" && onOpenEntity ? (
                <button
                  type="button"
                  className="truncate text-left text-primary underline-offset-2 hover:underline cursor-pointer"
                  data-testid="entity-linker-open-profile"
                  disabled={disabled}
                  onClick={() => onOpenEntity(value.entityId)}
                >
                  {value.displayName}
                </button>
              ) : (
                <span className="truncate">
                  {value.displayName}
                  {value.kind === "new" ? (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      (new)
                    </span>
                  ) : null}
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {value.position} · {entityContactRelationshipLabel(value.relationshipRole)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            disabled={disabled}
            aria-label="Clear entity link"
            onClick={clearLink}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ) : null}

      <div className="relative">
        <Input
          id={id}
          className="h-10"
          value={query}
          disabled={disabled}
          placeholder="Search business entities…"
          autoComplete="off"
          onFocus={() => setDropdownOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setDropdownOpen(true);
            if (value.kind !== "none") {
              onChange({ kind: "none" });
            }
          }}
        />

        {dropdownOpen && trimmedQuery.length > 0 ? (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-dlc-md border border-border/80 bg-background shadow-dlc-2">
            <ul
              className="max-h-44 overflow-y-auto py-1"
              role="listbox"
              aria-label="Entity search results"
            >
              {searchResults === undefined ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  Searching…
                </li>
              ) : matches.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  No matching entities
                </li>
              ) : (
                matches.map((match) => (
                  <li key={String(match.entityId)}>
                    <button
                      type="button"
                      className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted/60"
                      onClick={() =>
                        pickExisting(match.entityId, match.label)
                      }
                    >
                      <span className="text-sm font-medium">{match.label}</span>
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
            {showCreateAction ? (
              <div className="border-t border-border/70 p-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  disabled={disabled}
                  data-testid="entity-linker-create-inline"
                  onClick={() => {
                    setInlineCreateOpen(true);
                    setDropdownOpen(false);
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
                  Create new entity &ldquo;{trimmedQuery}&rdquo; inline
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {inlineCreateOpen ? (
        <div
          className={cn(
            "space-y-3 rounded-dlc-md border border-border/80 bg-muted/10 p-3",
          )}
          data-testid="entity-linker-inline-create"
        >
          <p className="text-sm font-medium text-foreground">
            New entity: {trimmedQuery || "—"}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Label htmlFor={`${id}-inline-position`}>
              Position
              <Input
                id={`${id}-inline-position`}
                className="mt-1 h-10"
                value={inlinePosition}
                disabled={disabled}
                list={`${id}-inline-position-suggestions`}
                onChange={(e) => setInlinePosition(e.target.value)}
              />
              <datalist id={`${id}-inline-position-suggestions`}>
                {COMMON_ENTITY_POSITIONS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Label>
            <Label htmlFor={`${id}-inline-role`}>
              Relationship role
              <select
                id={`${id}-inline-role`}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={inlineRole}
                disabled={disabled}
                onChange={(e) =>
                  setInlineRole(
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
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={disabled || !trimmedQuery || !inlinePosition.trim()}
              onClick={confirmInlineCreate}
            >
              Confirm entity link
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => setInlineCreateOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {value.kind === "existing" || value.kind === "new" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Label htmlFor={`${id}-position`}>
            Position
            <Input
              id={`${id}-position`}
              className="mt-1 h-10"
              value={value.position}
              disabled={disabled}
              list={`${id}-position-suggestions`}
              onChange={(e) =>
                onChange(
                  value.kind === "existing"
                    ? { ...value, position: e.target.value }
                    : { ...value, position: e.target.value },
                )
              }
            />
            <datalist id={`${id}-position-suggestions`}>
              {COMMON_ENTITY_POSITIONS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Label>
          <Label htmlFor={`${id}-role`}>
            Relationship role
            <select
              id={`${id}-role`}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={value.relationshipRole}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...value,
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
      ) : null}
    </div>
  );
}
