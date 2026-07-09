"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { HubDataTable } from "@/components/contacts/hub/HubDataTable";
import { hubDetailStyles } from "@/components/contacts/hub/hubDetailStyles";
import { ContactRoleBadge } from "@/components/contacts/hub/dealStatusBadge";
import { AddPrincipalToEntityModal } from "@/components/contacts/AddPrincipalToEntityModal";
import { entityContactRelationshipLabel } from "@/lib/contacts/entityContactRoles";
import { UserPlus } from "lucide-react";

export type EntityCapTableRow = {
  link: Doc<"entityContactLinks">;
  contact: Doc<"contacts"> | null;
};

export type EntityCapTableTabProps = {
  organizationId: Id<"organizations">;
  memberUserKey: string;
  entityId: Id<"clients">;
  rows: EntityCapTableRow[] | undefined;
  canEdit: boolean;
};

function formatOwnership(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

export function EntityCapTableTab({
  organizationId,
  memberUserKey,
  entityId,
  rows,
  canEdit,
}: EntityCapTableTabProps) {
  const [addOpen, setAddOpen] = useState(false);

  const excludeContactIds = useMemo(
    () => (rows ?? []).map((r) => r.link.contactId),
    [rows],
  );

  const totalOwnership = useMemo(() => {
    if (!rows?.length) return null;
    let sum = 0;
    let hasAny = false;
    for (const { link } of rows) {
      if (link.ownershipPercentage != null && Number.isFinite(link.ownershipPercentage)) {
        sum += link.ownershipPercentage;
        hasAny = true;
      }
    }
    return hasAny ? sum : null;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={hubDetailStyles.sectionTitle}>Capitalization table</h3>
          <p className="mt-1 text-dlc-body-sm text-muted-foreground">
            Principals, officers, and owners tied to this entity with equity
            percentages.
          </p>
          {totalOwnership != null ? (
            <p className="mt-2 text-dlc-label-md font-medium text-foreground">
              Total allocated ownership:{" "}
              <span className="tabular-nums">{formatOwnership(totalOwnership)}</span>
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" aria-hidden />
            Add principal / owner
          </Button>
        ) : null}
      </div>

      <HubDataTable
        caption="Entity capitalization table"
        loading={rows === undefined}
        rows={rows ?? []}
        rowKey={({ link }) => String(link._id)}
        emptyMessage="No principals linked to this entity yet. Add an owner to build the cap table."
        columns={[
          {
            id: "name",
            header: "Name",
            render: ({ contact }) =>
              contact ? (
                <Link
                  href={`/contacts/${contact._id}`}
                  className="font-semibold text-primary hover:underline"
                >
                  {contact.name?.trim() || "Unnamed contact"}
                </Link>
              ) : (
                <span className="text-muted-foreground">(Deleted contact)</span>
              ),
          },
          {
            id: "position",
            header: "Title / position",
            render: ({ link }) => (
              <span className="text-foreground">{link.position}</span>
            ),
          },
          {
            id: "role",
            header: "CRM role",
            render: ({ link }) => (
              <ContactRoleBadge
                label={entityContactRelationshipLabel(link.relationshipRole)}
              />
            ),
          },
          {
            id: "ownership",
            header: "Ownership %",
            cellClassName: "tabular-nums",
            render: ({ link }) => (
              <span className="font-semibold text-foreground">
                {formatOwnership(link.ownershipPercentage)}
              </span>
            ),
          },
        ]}
      />

      {canEdit ? (
        <AddPrincipalToEntityModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          entityId={entityId}
          excludeContactIds={excludeContactIds}
        />
      ) : null}
    </div>
  );
}
