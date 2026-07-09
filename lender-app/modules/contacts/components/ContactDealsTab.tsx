"use client";

import Link from "next/link";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { HubDataTable } from "@/components/contacts/hub/HubDataTable";
import { hubDetailStyles } from "@/components/contacts/hub/hubDetailStyles";
import { DealStatusBadge } from "@/components/contacts/hub/dealStatusBadge";
import {
  contactRoleDisplayName,
  type ContactRole,
} from "@/lib/contact/contactRoles";
import { pipelineDealEditorHref } from "@/lib/pipeline/routes";
import { entityContactRelationshipLabel } from "@/lib/contacts/entityContactRoles";

export type ContactDealsRow = {
  link: Doc<"contactFileLinks">;
  file: Doc<"pipeline"> | null;
};

export type ContactDealsTabProps = {
  rows: ContactDealsRow[] | undefined;
  contactRoles: ContactRole[];
  loading?: boolean;
  emptyMessage?: string;
};

function formatLoanAmount(amount: number | undefined): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function dealRoleLabel(
  link: Doc<"contactFileLinks">,
  contactRoles: ContactRole[],
): string {
  const crmRole = contactRoleDisplayName(contactRoles, link.contactRoleId);
  if (crmRole) return crmRole;
  const raw = link.role?.trim();
  if (!raw) return "—";
  const entityLabel = entityContactRelationshipLabel(raw);
  if (entityLabel !== raw) return entityLabel;
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/-/g, " ");
}

export function ContactDealsTab({
  rows,
  contactRoles,
  loading = false,
  emptyMessage = "No files linked to this contact.",
}: ContactDealsTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className={hubDetailStyles.sectionTitle}>Pipeline deals</h3>
        <p className="mt-1 text-dlc-body-sm text-muted-foreground">
          Active and historical loan files linked to this contact.
        </p>
      </div>
      <HubDataTable
        caption="Pipeline deals for contact"
        loading={loading}
        rows={rows ?? []}
        rowKey={({ link }) => String(link._id)}
        emptyMessage={emptyMessage}
        columns={[
          {
            id: "deal",
            header: "Deal name",
            render: ({ file }) =>
              file ? (
                <Link
                  href={pipelineDealEditorHref(file._id)}
                  className="font-semibold text-primary hover:underline"
                >
                  {file.fileName?.trim() || "Untitled file"}
                </Link>
              ) : (
                <span className="text-muted-foreground">(Deleted file)</span>
              ),
          },
          {
            id: "status",
            header: "Status",
            render: ({ file }) => <DealStatusBadge status={file?.status} />,
          },
          {
            id: "amount",
            header: "Loan amount",
            render: ({ file }) => (
              <span className="font-medium tabular-nums text-foreground">
                {formatLoanAmount(file?.fundingAmount)}
              </span>
            ),
          },
          {
            id: "role",
            header: "Role in deal",
            render: ({ link }) => (
              <Badge variant="outline">{dealRoleLabel(link, contactRoles)}</Badge>
            ),
          },
        ]}
      />
    </div>
  );
}
