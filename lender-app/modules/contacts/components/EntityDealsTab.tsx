"use client";

import Link from "next/link";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { HubDataTable } from "@/components/contacts/hub/HubDataTable";
import { hubDetailStyles } from "@/components/contacts/hub/hubDetailStyles";
import { DealStatusBadge } from "@/components/contacts/hub/dealStatusBadge";
import { pipelineDealEditorHref } from "@/lib/pipeline/routes";

export type EntityDealRow = {
  _id: Id<"pipeline">;
  fileName?: string;
  status?: string;
  fundingAmount?: number;
  involvementRole: string;
};

export type EntityDealsTabProps = {
  rows: EntityDealRow[] | undefined;
  loading?: boolean;
};

function formatLoanAmount(amount: number | undefined): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function EntityDealsTab({ rows, loading = false }: EntityDealsTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className={hubDetailStyles.sectionTitle}>Pipeline deals</h3>
        <p className="mt-1 text-dlc-body-sm text-muted-foreground">
          Loan files where this entity is the primary borrower or a corporate
          guarantor.
        </p>
      </div>
      <HubDataTable
        caption="Pipeline deals for entity"
        loading={loading}
        rows={rows ?? []}
        rowKey={(row) => String(row._id)}
        emptyMessage="No pipeline deals linked to this entity yet."
        columns={[
          {
            id: "deal",
            header: "Deal name",
            render: (row) => (
              <Link
                href={pipelineDealEditorHref(row._id)}
                className="font-semibold text-primary hover:underline"
              >
                {row.fileName?.trim() || "Untitled file"}
              </Link>
            ),
          },
          {
            id: "status",
            header: "Status",
            render: (row) => <DealStatusBadge status={row.status} />,
          },
          {
            id: "amount",
            header: "Loan amount",
            render: (row) => (
              <span className="font-medium tabular-nums text-foreground">
                {formatLoanAmount(row.fundingAmount)}
              </span>
            ),
          },
          {
            id: "role",
            header: "Role in deal",
            render: (row) => (
              <Badge variant="outline">{row.involvementRole}</Badge>
            ),
          },
        ]}
      />
    </div>
  );
}
