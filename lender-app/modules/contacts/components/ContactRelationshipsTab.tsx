"use client";

import Link from "next/link";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { HubDataTable } from "@/components/contacts/hub/HubDataTable";
import { hubDetailStyles } from "@/components/contacts/hub/hubDetailStyles";
import { ContactRoleBadge } from "@/components/contacts/hub/dealStatusBadge";
import { EntityPortfolioTab, type PortfolioRow } from "@/components/contacts/EntityPortfolioTab";
import { LinkedIndividualsSection } from "@/components/contacts/LinkedIndividualsSection";
import {
  contactRoleDisplayName,
  type ContactRole,
} from "@/lib/contact/contactRoles";

export type ContactRelationshipsTabProps = {
  contactId: Id<"contacts">;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  contactRoles: ContactRole[];
  entityRows: PortfolioRow[] | undefined;
  lenderRows:
    | Array<{
        link: Doc<"contactLenderLinks">;
        lender: Doc<"lenders"> | null;
      }>
    | undefined;
  onOpenEntityProfile: (entityId: Id<"clients">) => void;
  onOpenEntityInHub: (entityId: Id<"clients">) => void;
  onRemoveLenderLink: (lenderId: Id<"lenders">) => void | Promise<void>;
};

export function ContactRelationshipsTab({
  contactId,
  organizationId,
  memberUserKey,
  contactRoles,
  entityRows,
  lenderRows,
  onOpenEntityProfile,
  onOpenEntityInHub,
  onRemoveLenderLink,
}: ContactRelationshipsTabProps) {
  return (
    <div className="space-y-10">
      <EntityPortfolioTab
        contactId={contactId}
        organizationId={organizationId}
        memberUserKey={memberUserKey}
        rows={entityRows}
        onOpenEntityProfile={onOpenEntityProfile}
        onOpenEntityInHub={onOpenEntityInHub}
      />

      <LinkedIndividualsSection
        organizationId={organizationId}
        memberUserKey={memberUserKey}
        contactId={contactId}
      />

      <div className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className={hubDetailStyles.sectionTitle}>Associated lenders</h3>
            <p className="mt-1 text-dlc-body-sm text-muted-foreground">
              Lender relationships for this contact.
            </p>
          </div>
          <Link
            href="/lenders"
            className="text-dlc-label-md font-medium text-primary hover:underline"
          >
            Open lenders
          </Link>
        </div>
        <HubDataTable
          caption="Lenders linked to contact"
          loading={lenderRows === undefined}
          rows={lenderRows ?? []}
          rowKey={({ link }) => String(link._id)}
          emptyMessage="No lenders linked to this contact."
          columns={[
            {
              id: "lender",
              header: "Lender",
              render: ({ lender }) => (
                <span className="font-semibold text-foreground">
                  {lender?.company?.trim() ?? "(Deleted lender)"}
                </span>
              ),
            },
            {
              id: "role",
              header: "Role",
              render: ({ link }) => (
                <ContactRoleBadge
                  label={
                    contactRoleDisplayName(contactRoles, link.contactRoleId) ??
                    link.role ??
                    "Relationship"
                  }
                />
              ),
            },
            {
              id: "actions",
              header: "",
              cellClassName: "text-right",
              render: ({ link, lender }) => (
                <div className="flex justify-end gap-1">
                  {lender ? (
                    <Link
                      href="/lenders"
                      className="inline-flex h-8 items-center rounded-dlc-sm px-2 text-xs font-medium text-primary hover:bg-muted/60"
                    >
                      View
                    </Link>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive hover:bg-destructive/10"
                    disabled={!memberUserKey}
                    onClick={() => void onRemoveLenderLink(link.lenderId)}
                  >
                    Remove
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
