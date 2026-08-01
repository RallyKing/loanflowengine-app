"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import {
  buildBorrowerContactLookups,
  borrowerPanelRowKey,
  isCoBorrowerFileLink,
  isPrimaryBorrowerFileLink,
  matchContactByNormalizedEmail,
  matchContactByNormalizedName,
  personNameFromBorrowerRow,
} from "@/lib/contacts/borrowerIdentityFromDeal";
import { resolvePrimaryBorrowerContactId } from "@/lib/library/documentVaultHydration";
import type { SectionProps } from "@/components/intake/IntakeEditor";
import { DealPartyInstancePanel } from "@/modules/pipeline/components/deal/DealPartyInstancePanel";
import { EntityBorrowerLinkedSection } from "@/modules/pipeline/components/deal/EntityBorrowerLinkedSection";
import { BusinessEntityForm } from "@/modules/pipeline/components/deal/BusinessEntityForm";
import { RegistryPartyLinker } from "@/modules/pipeline/components/deal/RegistryPartyLinker";

export type DealBorrowersPanelProps = SectionProps & {
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  contactFileLinks?: Doc<"contactFileLinks">[];
  clientId?: Id<"clients">;
  fileId?: Id<"pipeline">;
};

export function DealBorrowersPanel({
  draft,
  update,
  organizationId,
  memberUserKey,
  contactFileLinks,
  fileId,
}: DealBorrowersPanelProps) {
  const [adding, setAdding] = useState(false);
  const [relinkIndex, setRelinkIndex] = useState<number | null>(null);
  const [unlinkingEntity, setUnlinkingEntity] = useState(false);

  const unbindEntity = useMutation(
    api.entityCanonicalization.unbindEntityBorrowerFromFile,
  );

  const contacts = useQuery(
    api.contacts.list,
    organizationId && memberUserKey
      ? { organizationId, memberUserKey }
      : "skip",
  );

  const canonical = useQuery(
    api.entityCanonicalization.getCanonicalEntityForFile,
    fileId && memberUserKey
      ? { fileId, memberUserKey }
      : "skip",
  );

  const lookups = useMemo(
    () => buildBorrowerContactLookups(contacts ?? [], organizationId),
    [contacts, organizationId],
  );

  const primaryContactId = useMemo(
    () => resolvePrimaryBorrowerContactId(contactFileLinks),
    [contactFileLinks],
  );

  const coBorrowerContactIds = useMemo(() => {
    const ids: Id<"contacts">[] = [];
    for (const link of contactFileLinks ?? []) {
      if (!isCoBorrowerFileLink(link)) continue;
      ids.push(link.contactId);
    }
    return ids;
  }, [contactFileLinks]);

  const borrowers = draft.borrowers ?? [];
  const entityClient = canonical?.client ?? null;
  const canLink = Boolean(fileId && organizationId && memberUserKey);

  const resolveContactId = (row: unknown, index: number): Id<"contacts"> | undefined => {
    if (row && typeof row === "object" && (row as { contactId?: Id<"contacts"> }).contactId) {
      return (row as { contactId: Id<"contacts"> }).contactId;
    }
    if (index === 0 && primaryContactId) return primaryContactId;
    if (index > 0 && coBorrowerContactIds[index - 1]) {
      return coBorrowerContactIds[index - 1];
    }
    const name = personNameFromBorrowerRow(row);
    const email = (row as { email?: string }).email;
    return (
      matchContactByNormalizedEmail(email, lookups)?._id ??
      matchContactByNormalizedName(name, lookups)?._id ??
      undefined
    );
  };

  const removeBorrower = (index: number) => {
    update(
      "borrowers",
      borrowers.filter((_, i) => i !== index),
    );
    if (relinkIndex === index) setRelinkIndex(null);
  };

  const removeEntityBorrower = async () => {
    if (!fileId || !memberUserKey || unlinkingEntity) return;
    setUnlinkingEntity(true);
    try {
      await unbindEntity({
        fileId,
        clientId: entityClient?._id,
        memberUserKey,
      });
    } finally {
      setUnlinkingEntity(false);
    }
  };

  const entityBusinessLegalName = (
    draft.business as { legalName?: string } | undefined
  )?.legalName?.trim();
  const showInlineEntityForm =
    !entityClient && Boolean(entityBusinessLegalName);

  return (
    <div className="space-y-2" data-testid="deal-borrowers-panel">
      {entityClient ? (
        <EntityBorrowerLinkedSection
          entityClient={entityClient}
          draft={draft}
          update={update}
          canLink={canLink}
          onChangeLink={() => setAdding(true)}
          onRemoveLink={() => {
            void removeEntityBorrower();
          }}
        />
      ) : showInlineEntityForm ? (
        <BusinessEntityForm draft={draft} update={update} />
      ) : null}

      {borrowers.length === 0 && !entityClient && !adding ? (
        <p className="text-xs text-muted-foreground">
          No borrowers on this file yet. Add an individual or entity borrower.
        </p>
      ) : null}

      {borrowers.map((row, index) =>
        relinkIndex === index && canLink ? (
          <RegistryPartyLinker
            key={`relink-${index}`}
            partyKind="borrower"
            fileId={fileId!}
            organizationId={organizationId!}
            memberUserKey={memberUserKey!}
            hasPrimaryBorrower={index > 0 || borrowers.length > 1}
            onLinked={() => setRelinkIndex(null)}
            onCancel={() => setRelinkIndex(null)}
          />
        ) : (
          <DealPartyInstancePanel
            key={borrowerPanelRowKey(row, index)}
            partyKind="borrower"
            index={index}
            row={row}
            contactId={resolveContactId(row, index) ?? null}
            draft={draft}
            update={update}
            onRemove={() => removeBorrower(index)}
            onChangeLink={
              canLink ? () => setRelinkIndex(index) : undefined
            }
            roleLabel={index === 0 ? "Primary borrower" : "Co-borrower"}
          />
        ),
      )}

      {adding && canLink ? (
        <RegistryPartyLinker
          partyKind="borrower"
          fileId={fileId!}
          organizationId={organizationId!}
          memberUserKey={memberUserKey!}
          hasPrimaryBorrower={borrowers.length > 0 || Boolean(entityClient)}
          onLinked={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      ) : canLink ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 gap-1.5 text-xs"
          onClick={() => setAdding(true)}
          data-testid="add-borrower-button"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add borrower
        </Button>
      ) : null}
    </div>
  );
}
