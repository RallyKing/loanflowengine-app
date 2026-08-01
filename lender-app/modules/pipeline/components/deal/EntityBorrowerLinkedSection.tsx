"use client";

import type { Id } from "@/convex/_generated/dataModel";
import type { DealWorkspaceSheet, DealWorkspaceUpdater } from "@/lib/file/dealSectionTypes";
import { BusinessEntityForm } from "@/modules/pipeline/components/deal/BusinessEntityForm";
import { DealPartyIdentityChip } from "@/modules/pipeline/components/deal/DealPartyIdentityChip";

export type EntityBorrowerLinkedSectionProps = {
  entityClient: {
    _id: Id<"clients">;
    displayName: string;
    companyName?: string | null;
    ein?: string | null;
    entityTypeLabel?: string | null;
    stateOfIncorporation?: string | null;
    dateOfFormation?: number | null;
  };
  draft: DealWorkspaceSheet;
  update: DealWorkspaceUpdater;
  canLink: boolean;
  onChangeLink?: () => void;
  onRemoveLink?: () => void;
};

/** Entity chip + metadata form — mount/unmount as a unit from the parent panel. */
export function EntityBorrowerLinkedSection({
  entityClient,
  draft,
  update,
  canLink,
  onChangeLink,
  onRemoveLink,
}: EntityBorrowerLinkedSectionProps) {
  return (
    <div className="space-y-2" data-testid="entity-borrower-linked-section">
      <DealPartyIdentityChip
        displayName={entityClient.displayName}
        roleLabel="Entity borrower"
        entityId={entityClient._id}
        entityMode
        onChangeLink={canLink ? onChangeLink : undefined}
        onRemoveLink={canLink ? onRemoveLink : undefined}
      />
      <BusinessEntityForm
        draft={draft}
        update={update}
        canonicalEntity={{
          displayName: entityClient.displayName,
          companyName: entityClient.companyName,
          ein: entityClient.ein,
          entityTypeLabel: entityClient.entityTypeLabel,
          stateOfIncorporation: entityClient.stateOfIncorporation,
          dateOfFormation: entityClient.dateOfFormation,
        }}
      />
    </div>
  );
}
