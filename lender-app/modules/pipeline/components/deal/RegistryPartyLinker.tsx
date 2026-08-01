"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Building2, Plus, Search, User } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import type { RegistryType } from "@/lib/registry/registryItem";

export type RegistryPartyLinkerProps = {
  partyKind: "borrower" | "guarantor";
  fileId: Id<"pipeline">;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  /** When adding a borrower, true if slot 0 is already taken. */
  hasPrimaryBorrower?: boolean;
  onLinked: () => void;
  onCancel: () => void;
};

type PartyType = "individual" | "entity";

export function RegistryPartyLinker({
  partyKind,
  fileId,
  organizationId,
  memberUserKey,
  hasPrimaryBorrower = false,
  onLinked,
  onCancel,
}: RegistryPartyLinkerProps) {
  const [partyType, setPartyType] = useState<PartyType>("individual");
  const [searchQuery, setSearchQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = searchQuery.trim();
  const typeFilter: RegistryType[] =
    partyType === "entity" ? ["entity"] : ["contact"];

  const results = useQuery(
    api.registry.list,
    trimmed.length >= 1
      ? {
          organizationId,
          memberUserKey,
          searchQuery: trimmed,
          typeFilter,
          limit: 12,
        }
      : "skip",
  );

  const assignBorrower = useMutation(api.pipelineContacts.assignContactToBorrowerSlot);
  const assignGuarantor = useMutation(api.pipelineContacts.assignContactToGuarantorSlot);
  const createContact = useMutation(api.contacts.create);
  const quickCreateEntity = useMutation(api.entityCanonicalization.quickCreateRegistryEntity);
  const bindEntity = useMutation(api.entityCanonicalization.bindEntityBorrowerToFile);

  const linkContact = useCallback(
    async (contactId: Id<"contacts">) => {
      setBusy(true);
      setError(null);
      try {
        if (partyKind === "borrower") {
          await assignBorrower({
            fileId,
            contactId,
            slot: hasPrimaryBorrower ? "coborrower" : "primary",
            preferencesAccountId: memberUserKey,
          });
        } else {
          await assignGuarantor({
            fileId,
            contactId,
            preferencesAccountId: memberUserKey,
          });
        }
        onLinked();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [
      assignBorrower,
      assignGuarantor,
      fileId,
      hasPrimaryBorrower,
      memberUserKey,
      onLinked,
      partyKind,
    ],
  );

  const linkEntity = useCallback(
    async (clientId: Id<"clients">) => {
      setBusy(true);
      setError(null);
      try {
        await bindEntity({ fileId, clientId, memberUserKey });
        onLinked();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [bindEntity, fileId, memberUserKey, onLinked],
  );

  const submitInlineCreate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (partyType === "individual") {
        const fn = firstName.trim();
        const ln = lastName.trim();
        const name = [fn, ln].filter(Boolean).join(" ");
        if (!name) {
          setError("Enter a first or last name.");
          return;
        }
        const contactId = await createContact({
          name,
          organizationId,
          memberUserKey,
        });
        await linkContact(contactId);
      } else {
        const entity = legalName.trim();
        if (!entity) {
          setError("Enter a legal entity name.");
          return;
        }
        const { clientId } = await quickCreateEntity({
          organizationId,
          legalName: entity,
          memberUserKey,
        });
        await linkEntity(clientId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [
    createContact,
    firstName,
    lastName,
    legalName,
    linkContact,
    linkEntity,
    memberUserKey,
    organizationId,
    partyType,
    quickCreateEntity,
  ]);

  const showEntityType = partyKind === "borrower";

  return (
    <div
      className="rounded-dlc-md border border-dashed border-gray-200 bg-muted/15 p-2.5 dark:border-gray-800"
      data-testid={`registry-party-linker-${partyKind}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Link {partyKind}
        </p>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {showEntityType ? (
        <div
          className="mb-2 inline-flex rounded-dlc-sm border border-gray-100 bg-muted/30 p-0.5 dark:border-gray-800"
          role="radiogroup"
          aria-label="Party type"
        >
          {(
            [
              { id: "individual" as const, label: "Individual", icon: User },
              { id: "entity" as const, label: "Entity", icon: Building2 },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={partyType === opt.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-dlc-sm px-2 py-1 text-xs font-medium transition-colors",
                partyType === opt.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                setPartyType(opt.id);
                setSearchQuery("");
                setCreating(false);
              }}
            >
              <opt.icon className="h-3 w-3" aria-hidden />
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          className="h-9 pl-8 text-sm"
          placeholder={
            partyType === "entity"
              ? "Search entities (LLC, Corp)…"
              : "Search registry contacts…"
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          aria-label="Search global registry"
          data-testid="registry-party-search"
        />
      </div>

      {trimmed.length >= 1 ? (
        <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
          {results === undefined ? (
            <li className="px-1 py-1 text-xs text-muted-foreground">Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-1 py-1 text-xs text-muted-foreground">No matches.</li>
          ) : (
            results.map((item) => (
              <li key={item._id}>
                <button
                  type="button"
                  disabled={busy}
                  className="flex w-full items-center justify-between gap-2 rounded-dlc-sm border border-gray-100 bg-background px-2 py-1.5 text-left text-xs hover:border-primary/40 hover:bg-primary/5 dark:border-gray-800"
                  onClick={() => {
                    if (partyType === "entity") {
                      void linkEntity(item._id as Id<"clients">);
                    } else {
                      void linkContact(item._id as Id<"contacts">);
                    }
                  }}
                >
                  <span className="min-w-0 truncate font-medium">{item.displayName}</span>
                  <span className="shrink-0 text-primary">Select</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {!creating ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2 h-8 gap-1 text-xs"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-3 w-3" aria-hidden />
          Create new {partyType === "entity" ? "entity" : "contact"}
        </Button>
      ) : (
        <div className="mt-2 space-y-2 rounded-dlc-sm border border-gray-100 bg-background p-2 dark:border-gray-800">
          {partyType === "individual" ? (
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.currentTarget.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.currentTarget.value)}
                className="h-8 text-xs"
              />
            </div>
          ) : (
            <Input
              placeholder="Legal entity name"
              value={legalName}
              onChange={(e) => setLegalName(e.currentTarget.value)}
              className="h-8 text-xs"
            />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 flex-1 text-xs"
              disabled={busy}
              onClick={() => void submitInlineCreate()}
            >
              {busy ? "Saving…" : "Save to registry & link"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => setCreating(false)}
            >
              Back
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
