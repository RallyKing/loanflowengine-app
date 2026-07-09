"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { HubDataTable } from "@/components/contacts/hub/HubDataTable";
import { hubDetailStyles } from "@/components/contacts/hub/hubDetailStyles";
import { AddIndividualLinkModal } from "@/components/contacts/AddIndividualLinkModal";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { unlinkConfirm } from "@/lib/ui/confirmDestructive";

export type LinkedIndividualsSectionProps = {
  organizationId: Id<"organizations">;
  memberUserKey: string;
  contactId: Id<"contacts">;
};

export function LinkedIndividualsSection({
  organizationId,
  memberUserKey,
  contactId,
}: LinkedIndividualsSectionProps) {
  const { confirm } = useOperationalConfirm();
  const removeLink = useMutation(api.individualContactLinks.remove);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const rows = useQuery(api.individualContactLinks.listByContact, {
    organizationId,
    contactId,
    memberUserKey,
  });

  const linkedContactIds = useMemo(
    () =>
      (rows ?? [])
        .map((r) => r.relatedContact?._id)
        .filter((id): id is Id<"contacts"> => id != null),
    [rows],
  );

  const onRemove = useCallback(
    async (linkId: Id<"individualContactLinks">, name: string) => {
      const ok = await confirm(
        unlinkConfirm(name, "Only this relationship link is removed."),
      );
      if (!ok) return;
      await removeLink({ organizationId, linkId, memberUserKey });
    },
    [confirm, memberUserKey, organizationId, removeLink],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={hubDetailStyles.sectionTitle}>Linked individuals</h3>
          <p className="mt-1 text-dlc-body-sm text-muted-foreground">
            Person-to-person relationships — spouses, partners, referral sources.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="hover:bg-muted/60"
          data-testid="add-individual-link"
          onClick={() => setAddModalOpen(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Add relationship
        </Button>
      </div>

      <HubDataTable
        caption="Individuals linked to contact"
        loading={rows === undefined}
        rows={rows ?? []}
        rowKey={({ link }) => String(link._id)}
        emptyMessage="No linked individuals yet."
        columns={[
          {
            id: "person",
            header: "Individual",
            render: ({ relatedContact }) =>
              relatedContact ? (
                <Link
                  href={`/contacts/${relatedContact._id}`}
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  {relatedContact.name?.trim() || "Contact"}
                </Link>
              ) : (
                <span className="text-muted-foreground">(Deleted)</span>
              ),
          },
          {
            id: "type",
            header: "Relationship",
            render: ({ link }) => (
              <span className="font-medium text-foreground">
                {link.relationshipType}
              </span>
            ),
          },
          {
            id: "notes",
            header: "Notes",
            render: ({ link }) => (
              <span className="text-muted-foreground">{link.notes?.trim() || "—"}</span>
            ),
          },
          {
            id: "actions",
            header: "",
            cellClassName: "text-right",
            render: ({ link, relatedContact }) => (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:bg-destructive/10"
                onClick={() =>
                  void onRemove(
                    link._id,
                    relatedContact?.name?.trim() || "this person",
                  )
                }
              >
                Remove
              </Button>
            ),
          },
        ]}
      />

      <AddIndividualLinkModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        organizationId={organizationId}
        memberUserKey={memberUserKey}
        contactId={contactId}
        excludeContactIds={linkedContactIds}
      />
    </div>
  );
}
