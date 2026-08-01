"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import {
  buildBorrowerContactLookups,
  matchContactByNormalizedEmail,
  matchContactByNormalizedName,
} from "@/lib/contacts/borrowerIdentityFromDeal";
import { guarantorPanelRowKey } from "@/lib/contacts/guarantorIdentityFromDeal";
import type { SectionProps } from "@/components/intake/IntakeEditor";
import { DealPartyInstancePanel } from "@/modules/pipeline/components/deal/DealPartyInstancePanel";
import { RegistryPartyLinker } from "@/modules/pipeline/components/deal/RegistryPartyLinker";

export type DealGuarantorsPanelProps = SectionProps & {
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  contactFileLinks?: Doc<"contactFileLinks">[];
  fileId?: Id<"pipeline">;
};

export function DealGuarantorsPanel({
  draft,
  update,
  organizationId,
  memberUserKey,
  fileId,
}: DealGuarantorsPanelProps) {
  const [adding, setAdding] = useState(false);
  const [relinkIndex, setRelinkIndex] = useState<number | null>(null);

  const contacts = useQuery(
    api.contacts.list,
    organizationId && memberUserKey
      ? { organizationId, memberUserKey }
      : "skip",
  );

  const lookups = useMemo(
    () => buildBorrowerContactLookups(contacts ?? [], organizationId),
    [contacts, organizationId],
  );

  const guarantors = draft.guarantors ?? [];
  const canLink = Boolean(fileId && organizationId && memberUserKey);

  const removeGuarantor = (index: number) => {
    update(
      "guarantors",
      guarantors.filter((_, i) => i !== index),
    );
    if (relinkIndex === index) setRelinkIndex(null);
  };

  return (
    <div className="space-y-2" data-testid="deal-guarantors-panel">
      {guarantors.length === 0 && !adding ? (
        <p className="text-xs text-muted-foreground">
          No guarantors on this file yet.
        </p>
      ) : null}

      {guarantors.map((row, index) => {
        const name = (row.name ?? "").trim();
        const matched =
          matchContactByNormalizedEmail(row.email, lookups) ??
          matchContactByNormalizedName(name, lookups);
        const contactId =
          (row as { contactId?: Id<"contacts"> }).contactId ?? matched?._id;

        if (relinkIndex === index && canLink) {
          return (
            <RegistryPartyLinker
              key={`relink-${index}`}
              partyKind="guarantor"
              fileId={fileId!}
              organizationId={organizationId!}
              memberUserKey={memberUserKey!}
              onLinked={() => setRelinkIndex(null)}
              onCancel={() => setRelinkIndex(null)}
            />
          );
        }

        return (
          <DealPartyInstancePanel
            key={guarantorPanelRowKey(row, index)}
            partyKind="guarantor"
            index={index}
            row={row}
            contactId={contactId ?? null}
            draft={draft}
            update={update}
            onRemove={() => removeGuarantor(index)}
            onChangeLink={canLink ? () => setRelinkIndex(index) : undefined}
            roleLabel={row.role?.trim() || "Guarantor"}
          />
        );
      })}

      {adding && canLink ? (
        <RegistryPartyLinker
          partyKind="guarantor"
          fileId={fileId!}
          organizationId={organizationId!}
          memberUserKey={memberUserKey!}
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
          data-testid="add-guarantor-button"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add guarantor
        </Button>
      ) : null}
    </div>
  );
}
