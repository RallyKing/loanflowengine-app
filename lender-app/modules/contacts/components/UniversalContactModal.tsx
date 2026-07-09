"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Building2, UserRound, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import { pipelineClientWorkspaceHref } from "@/lib/pipeline/routes";
import {
  EntityContactAssociationEditor,
  associationRowsToEntityPayload,
  associationRowsToIndividualPayload,
  validateAssociationRows,
  type AssociationRowDraft,
} from "@/components/contacts/EntityContactAssociationEditor";

const SEARCH_DEBOUNCE_MS = 280;

export type UniversalContactKind = "entity" | "individual";

export type UniversalContactModalProps = {
  open: boolean;
  onClose: () => void;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  /** Pre-select create flow when opening (Add Contact vs Add Entity). */
  defaultKind?: UniversalContactKind;
  onSelectIndividual?: (contactId: Id<"contacts">) => void;
  onSelectEntity?: (entityId: Id<"clients">) => void;
  onCreated?: (
    result:
      | { kind: "individual"; contactId: Id<"contacts"> }
      | { kind: "entity"; entityId: Id<"clients"> },
  ) => void;
};

function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export function UniversalContactModal({
  open,
  onClose,
  organizationId,
  memberUserKey,
  defaultKind = "individual",
  onSelectIndividual,
  onSelectEntity,
  onCreated,
}: UniversalContactModalProps) {
  const router = useRouter();
  const ingestEntity = useMutation(api.crmIngestionMutations.ingestBusinessEntity);
  const ingestIndividual = useMutation(api.crmIngestionMutations.ingestIndividual);

  const [kind, setKind] = useState<UniversalContactKind>("individual");
  const [nameQuery, setNameQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndividualId, setSelectedIndividualId] =
    useState<Id<"contacts"> | null>(null);
  const [selectedEntityId, setSelectedEntityId] =
    useState<Id<"clients"> | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState("");
  const [primaryContactPhone, setPrimaryContactPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [individualAssociations, setIndividualAssociations] = useState<
    AssociationRowDraft[]
  >([]);
  const [entityAssociations, setEntityAssociations] = useState<
    AssociationRowDraft[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      setDebouncedQuery(nameQuery);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [nameQuery, open]);

  useEffect(() => {
    if (!open) {
      setKind("individual");
      setNameQuery("");
      setDebouncedQuery("");
      setSelectedIndividualId(null);
      setSelectedEntityId(null);
      setSelectedLabel(null);
      setCompanyName("");
      setPrimaryContactName("");
      setPrimaryContactEmail("");
      setPrimaryContactPhone("");
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setIndividualAssociations([]);
      setEntityAssociations([]);
      setSaving(false);
      setSaveError(null);
    } else {
      setKind(defaultKind);
    }
  }, [open, defaultKind]);

  const searchKind = kind === "entity" ? "entity" : "individual";

  const searchResults = useQuery(
    api.crmIngestionSearch.searchIngestionByName,
    open && debouncedQuery.trim().length > 0
      ? {
          organizationId,
          memberUserKey,
          query: debouncedQuery.trim(),
          kind: searchKind,
          limit: 8,
        }
      : "skip",
  );

  const matches = useMemo(() => {
    if (!searchResults) return [];
    if (kind === "entity") {
      return searchResults.entities.map((row) => ({
        id: String(row.entityId),
        primary: row.displayName,
        secondary: [row.companyName, row.primaryContactName]
          .filter(Boolean)
          .join(" · "),
        kind: "entity" as const,
        entityId: row.entityId,
      }));
    }
    return searchResults.individuals.map((row) => ({
      id: String(row.contactId),
      primary: row.name,
      secondary: [row.email, row.companyName].filter(Boolean).join(" · "),
      kind: "individual" as const,
      contactId: row.contactId,
    }));
  }, [kind, searchResults]);

  const showMatches =
    debouncedQuery.trim().length > 0 &&
    !selectedLabel &&
    (searchResults === undefined || matches.length > 0);

  const resetSelection = useCallback(() => {
    setSelectedIndividualId(null);
    setSelectedEntityId(null);
    setSelectedLabel(null);
  }, []);

  const onKindChange = useCallback(
    (next: UniversalContactKind) => {
      setKind(next);
      resetSelection();
      setNameQuery("");
      setDebouncedQuery("");
      setSaveError(null);
    },
    [resetSelection],
  );

  const pickMatch = useCallback(
    (match: (typeof matches)[number]) => {
      if (match.kind === "individual") {
        setSelectedIndividualId(match.contactId);
        setSelectedEntityId(null);
        setSelectedLabel(match.primary);
        setNameQuery(match.primary);
      } else {
        setSelectedEntityId(match.entityId);
        setSelectedIndividualId(null);
        setSelectedLabel(match.primary);
        setNameQuery(match.primary);
        setCompanyName(match.primary);
      }
    },
    [],
  );

  const handleUseExisting = useCallback(() => {
    if (selectedIndividualId) {
      onSelectIndividual?.(selectedIndividualId);
      onClose();
      return;
    }
    if (selectedEntityId) {
      if (onSelectEntity) {
        onSelectEntity(selectedEntityId);
      } else {
        router.push(pipelineClientWorkspaceHref(String(selectedEntityId)));
      }
      onClose();
    }
  }, [
    onClose,
    onSelectEntity,
    onSelectIndividual,
    router,
    selectedEntityId,
    selectedIndividualId,
  ]);

  const trimmedName = nameQuery.trim();
  const canProceedAsNew =
    trimmedName.length > 0 && !selectedIndividualId && !selectedEntityId;

  useEffect(() => {
    if (!canProceedAsNew) return;
    if (kind === "entity") {
      setCompanyName(trimmedName);
    } else {
      const split = splitName(trimmedName);
      setFirstName(split.firstName);
      setLastName(split.lastName);
    }
  }, [canProceedAsNew, kind, trimmedName]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    if (kind === "entity") {
      const displayName = (companyName || trimmedName).trim();
      if (!displayName) {
        setSaveError("Company name is required.");
        return;
      }
      const assocError = validateAssociationRows(individualAssociations);
      if (assocError) {
        setSaveError(assocError);
        return;
      }
      setSaving(true);
      try {
        const result = await ingestEntity({
          organizationId,
          memberUserKey,
          displayName,
          companyName: displayName,
          primaryContactName: primaryContactName.trim() || undefined,
          primaryContactEmail: primaryContactEmail.trim() || undefined,
          primaryContactPhone: primaryContactPhone.trim() || undefined,
          individualAssociations: associationRowsToIndividualPayload(
            individualAssociations,
          ),
        });
        onCreated?.({ kind: "entity", entityId: result.entityId });
        onClose();
        if (onSelectEntity) {
          onSelectEntity(result.entityId);
        } else {
          router.push(pipelineClientWorkspaceHref(String(result.entityId)));
        }
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
      return;
    }

    const fn = firstName.trim();
    if (!fn) {
      setSaveError("First name is required.");
      return;
    }
    const assocError = validateAssociationRows(entityAssociations);
    if (assocError) {
      setSaveError(assocError);
      return;
    }
    setSaving(true);
    try {
      const result = await ingestIndividual({
        organizationId,
        memberUserKey,
        firstName: fn,
        lastName: lastName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        entityAssociations: associationRowsToEntityPayload(entityAssociations),
      });
      onCreated?.({ kind: "individual", contactId: result.contactId });
      onSelectIndividual?.(result.contactId);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [
    companyName,
    email,
    entityAssociations,
    firstName,
    individualAssociations,
    ingestEntity,
    ingestIndividual,
    kind,
    lastName,
    memberUserKey,
    onClose,
    onCreated,
    onSelectEntity,
    onSelectIndividual,
    organizationId,
    phone,
    primaryContactEmail,
    primaryContactName,
    primaryContactPhone,
    router,
    trimmedName,
  ]);

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      panelClassName="flex max-h-[min(92dvh,720px)] w-full max-w-xl flex-col overflow-hidden p-0"
      aria-labelledby="universal-contact-modal-title"
      data-testid="universal-contact-modal"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2
            id="universal-contact-modal-title"
            className="text-base font-semibold text-foreground"
          >
            Add to CRM
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Choose a record type, check for duplicates, then create with
            relationships.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-4 w-4 shrink-0" aria-hidden />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        <div
          className="grid grid-cols-2 gap-1 rounded-dlc-md border border-border/80 bg-muted/30 p-1"
          role="tablist"
          aria-label="Record type"
        >
          <button
            type="button"
            role="tab"
            aria-selected={kind === "entity"}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 rounded-dlc-sm px-2 text-xs font-medium transition-colors duration-dlc-short ease-dlc-standard",
              kind === "entity"
                ? "bg-background text-foreground shadow-dlc-1"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="universal-contact-kind-entity"
            onClick={() => onKindChange("entity")}
          >
            <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Business entity
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === "individual"}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 rounded-dlc-sm px-2 text-xs font-medium transition-colors duration-dlc-short ease-dlc-standard",
              kind === "individual"
                ? "bg-background text-foreground shadow-dlc-1"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="universal-contact-kind-individual"
            onClick={() => onKindChange("individual")}
          >
            <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Individual
          </button>
        </div>

        <div className="relative">
          <Label htmlFor="universal-contact-name">
            {kind === "entity" ? "Entity name" : "Contact name"}
          </Label>
          <Input
            id="universal-contact-name"
            className="mt-1 h-10"
            value={nameQuery}
            autoFocus
            disabled={saving}
            placeholder={
              kind === "entity"
                ? "Search or enter business name…"
                : "Search or enter full name…"
            }
            data-testid="universal-contact-name-input"
            onChange={(e) => {
              resetSelection();
              setNameQuery(e.target.value);
            }}
          />

          {showMatches ? (
            <ul
              className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-dlc-md border border-border/80 bg-background py-1 shadow-dlc-2"
              role="listbox"
              aria-label="Possible matches"
              data-testid="universal-contact-duplicate-matches"
            >
              {searchResults === undefined ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  Searching…
                </li>
              ) : matches.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  No matches — you can create a new{" "}
                  {kind === "entity" ? "entity" : "contact"}.
                </li>
              ) : (
                matches.map((match) => (
                  <li key={match.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted/60"
                      onClick={() => pickMatch(match)}
                    >
                      <span className="text-sm font-medium text-foreground">
                        {match.primary}
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

        {selectedLabel ? (
          <div
            className="rounded-dlc-md border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm"
            data-testid="universal-contact-existing-selection"
          >
            <p className="font-medium text-foreground">
              Existing {kind === "entity" ? "entity" : "contact"} selected
            </p>
            <p className="mt-0.5 text-muted-foreground">{selectedLabel}</p>
            <button
              type="button"
              className="mt-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
              onClick={resetSelection}
            >
              Clear and search again
            </button>
          </div>
        ) : null}

        {canProceedAsNew && kind === "entity" ? (
          <div className="space-y-3" data-testid="universal-contact-entity-form">
            <Label htmlFor="entity-company-name">
              Company name
              <Input
                id="entity-company-name"
                className="mt-1 h-10"
                value={companyName}
                disabled={saving}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </Label>
            <div className="space-y-2 rounded-dlc-md border border-border/70 bg-muted/10 p-3">
              <p className="text-sm font-medium text-foreground">
                Primary contact
              </p>
              <Label htmlFor="entity-primary-name">
                Name
                <Input
                  id="entity-primary-name"
                  className="mt-1 h-10"
                  value={primaryContactName}
                  disabled={saving}
                  onChange={(e) => setPrimaryContactName(e.target.value)}
                />
              </Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Label htmlFor="entity-primary-email">
                  Email
                  <Input
                    id="entity-primary-email"
                    type="email"
                    className="mt-1 h-10"
                    value={primaryContactEmail}
                    disabled={saving}
                    onChange={(e) => setPrimaryContactEmail(e.target.value)}
                  />
                </Label>
                <Label htmlFor="entity-primary-phone">
                  Phone
                  <Input
                    id="entity-primary-phone"
                    type="tel"
                    className="mt-1 h-10"
                    value={primaryContactPhone}
                    disabled={saving}
                    onChange={(e) => setPrimaryContactPhone(e.target.value)}
                  />
                </Label>
              </div>
            </div>
            <EntityContactAssociationEditor
              title="Associated Individuals"
              description="Link people to this entity. Position and relationship role are required for each."
              targetKind="individual"
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              rows={individualAssociations}
              onRowsChange={setIndividualAssociations}
              disabled={saving}
            />
          </div>
        ) : null}

        {canProceedAsNew && kind === "individual" ? (
          <div
            className="space-y-3"
            data-testid="universal-contact-individual-form"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Label htmlFor="individual-first-name">
                First name
                <Input
                  id="individual-first-name"
                  className="mt-1 h-10"
                  value={firstName}
                  disabled={saving}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </Label>
              <Label htmlFor="individual-last-name">
                Last name
                <Input
                  id="individual-last-name"
                  className="mt-1 h-10"
                  value={lastName}
                  disabled={saving}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </Label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Label htmlFor="individual-email">
                Email
                <Input
                  id="individual-email"
                  type="email"
                  className="mt-1 h-10"
                  value={email}
                  disabled={saving}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Label>
              <Label htmlFor="individual-phone">
                Phone
                <Input
                  id="individual-phone"
                  type="tel"
                  className="mt-1 h-10"
                  value={phone}
                  disabled={saving}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Label>
            </div>
            <EntityContactAssociationEditor
              title="Associated Business Entities"
              description="Link businesses this person is connected to. Position and relationship role are required."
              targetKind="entity"
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              rows={entityAssociations}
              onRowsChange={setEntityAssociations}
              disabled={saving}
            />
          </div>
        ) : null}

        {saveError ? (
          <div
            className="rounded-dlc-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {saveError}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border/70 px-4 py-3 sm:px-5">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        {selectedIndividualId || selectedEntityId ? (
          <Button
            type="button"
            size="sm"
            data-testid="universal-contact-use-existing"
            onClick={handleUseExisting}
          >
            Use existing record
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={!canProceedAsNew || saving}
            data-testid="universal-contact-save"
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
    </OverlayShell>
  );
}
