"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Input, Label } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { HubDataTable } from "@/components/contacts/hub/HubDataTable";
import { hubDetailStyles } from "@/components/contacts/hub/hubDetailStyles";
import { ContactRoleBadge } from "@/components/contacts/hub/dealStatusBadge";
import { AddEntityToPortfolioModal } from "@/components/contacts/AddEntityToPortfolioModal";
import { clientEntityTypeLabel } from "@/lib/contacts/entityKycTypes";
import { entityContactRelationshipLabel } from "@/lib/contacts/entityContactRoles";
import {
  entityPositionCategory,
  entityPositionCategoryLabel,
} from "@/lib/contacts/entityPortfolioRoles";
import { pipelineClientWorkspaceHref } from "@/lib/pipeline/routes";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { unlinkConfirm } from "@/lib/ui/confirmDestructive";

export type PortfolioRow = {
  link: Doc<"entityContactLinks">;
  entity: Doc<"clients"> | null;
};

export type EntityPortfolioTabProps = {
  contactId: Id<"contacts">;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  rows: PortfolioRow[] | undefined;
  onOpenEntityProfile: (entityId: Id<"clients">) => void;
  onOpenEntityInHub: (entityId: Id<"clients">) => void;
};

function positionCategoryBadgeVariant(
  category: ReturnType<typeof entityPositionCategory>,
): "approved" | "info" | "neutral" {
  switch (category) {
    case "ownership":
      return "approved";
    case "operational":
      return "info";
    default:
      return "neutral";
  }
}

export function EntityPortfolioTab({
  contactId,
  organizationId,
  memberUserKey,
  rows,
  onOpenEntityProfile,
  onOpenEntityInHub,
}: EntityPortfolioTabProps) {
  const { confirm } = useOperationalConfirm();
  const removeLink = useMutation(api.entityContactLinks.remove);
  const updateLink = useMutation(api.entityContactLinks.update);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editRow, setEditRow] = useState<PortfolioRow | null>(null);
  const [editPosition, setEditPosition] = useState("");
  const [editOwnership, setEditOwnership] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const portfolioRows = rows ?? [];
  const linkedEntityIds = useMemo(
    () =>
      portfolioRows
        .map((r) => r.entity?._id)
        .filter((id): id is Id<"clients"> => id != null),
    [portfolioRows],
  );

  const onRemoveLink = useCallback(
    async (linkId: Id<"entityContactLinks">, entityName: string) => {
      const ok = await confirm(
        unlinkConfirm(
          entityName,
          "The entity record stays in CRM; only this portfolio link is removed.",
        ),
      );
      if (!ok) return;
      await removeLink({
        organizationId,
        linkId,
        memberUserKey,
      });
    },
    [confirm, memberUserKey, organizationId, removeLink],
  );

  const openEdit = useCallback((row: PortfolioRow) => {
    setEditRow(row);
    setEditPosition(row.link.position);
    setEditOwnership(
      row.link.ownershipPercentage != null
        ? String(row.link.ownershipPercentage)
        : "",
    );
  }, []);

  const onSaveEdit = useCallback(async () => {
    if (!editRow) return;
    setEditBusy(true);
    try {
      const ownership =
        editOwnership.trim() === ""
          ? undefined
          : Number.parseFloat(editOwnership.trim());
      if (
        editOwnership.trim() !== "" &&
        (ownership === undefined || !Number.isFinite(ownership))
      ) {
        return;
      }
      await updateLink({
        organizationId,
        memberUserKey,
        linkId: editRow.link._id,
        position: editPosition.trim(),
        ownershipPercentage: ownership,
      });
      setEditRow(null);
    } finally {
      setEditBusy(false);
    }
  }, [
    editOwnership,
    editPosition,
    editRow,
    memberUserKey,
    organizationId,
    updateLink,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={hubDetailStyles.sectionTitle}>Entity portfolio</h3>
          <p className="mt-1 text-dlc-body-sm text-muted-foreground">
            Business entities this individual owns, operates, or represents.
            Each link is stored in entityContactLinks.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="hover:bg-muted/60"
          data-testid="add-entity-to-portfolio"
          onClick={() => setAddModalOpen(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Add entity to portfolio
        </Button>
      </div>

      <HubDataTable
        caption="Entity portfolio for individual"
        loading={rows === undefined}
        rows={portfolioRows}
        rowKey={({ link }) => String(link._id)}
        emptyMessage="No entities in this portfolio yet. Add an LLC, S-Corp, or other entity record."
        columns={[
          {
            id: "entity",
            header: "Entity",
            render: ({ entity }) =>
              entity ? (
                <button
                  type="button"
                  className="text-left font-semibold text-primary underline-offset-2 hover:underline"
                  onClick={() => onOpenEntityProfile(entity._id)}
                >
                  {entity.displayName?.trim() ||
                    entity.companyName?.trim() ||
                    "Business entity"}
                </button>
              ) : (
                <span className="text-muted-foreground">(Deleted)</span>
              ),
          },
          {
            id: "type",
            header: "Entity type",
            render: ({ entity }) => (
              <Badge variant="secondary">
                {entity?.entityType
                  ? clientEntityTypeLabel(entity.entityType)
                  : "Unclassified"}
              </Badge>
            ),
          },
          {
            id: "position",
            header: "Position",
            render: ({ link }) => {
              const category = entityPositionCategory(link.position);
              return (
                <div className="space-y-1">
                  <span className="font-semibold text-foreground">
                    {link.position}
                  </span>
                  <Badge variant={positionCategoryBadgeVariant(category)}>
                    {entityPositionCategoryLabel(category)}
                  </Badge>
                </div>
              );
            },
          },
          {
            id: "ownership",
            header: "Ownership %",
            render: ({ link }) => (
              <span className="font-medium tabular-nums text-foreground">
                {link.ownershipPercentage != null
                  ? `${link.ownershipPercentage}%`
                  : "—"}
              </span>
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
            id: "actions",
            header: "",
            cellClassName: "text-right",
            render: ({ link, entity }) =>
              entity ? (
                <div className="flex flex-wrap justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs hover:bg-muted/60"
                    onClick={() => openEdit({ link, entity })}
                  >
                    <Pencil className="mr-1 h-3 w-3" aria-hidden />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs hover:bg-muted/60"
                    onClick={() => onOpenEntityInHub(entity._id)}
                  >
                    Hub
                  </Button>
                  <Link
                    href={pipelineClientWorkspaceHref(String(entity._id))}
                    className="inline-flex h-8 items-center rounded-dlc-sm px-2 text-xs font-medium text-primary hover:bg-muted/60"
                  >
                    Workspace
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive hover:bg-destructive/10"
                    onClick={() =>
                      void onRemoveLink(
                        link._id,
                        entity.displayName?.trim() || "this entity",
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => void onRemoveLink(link._id, "this link")}
                >
                  Remove link
                </Button>
              ),
          },
        ]}
      />

      <AddEntityToPortfolioModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        organizationId={organizationId}
        memberUserKey={memberUserKey}
        contactId={contactId}
        excludeEntityIds={linkedEntityIds}
      />

      <OverlayShell
        open={editRow !== null}
        onClose={() => setEditRow(null)}
        panelClassName="w-full max-w-md p-0"
        aria-labelledby="edit-portfolio-link-title"
      >
        <div className="border-b border-border/70 px-4 py-3">
          <h2 id="edit-portfolio-link-title" className="text-base font-semibold">
            Edit entity link
          </h2>
        </div>
        <div className="space-y-3 px-4 py-4">
          <Label htmlFor="edit-portfolio-position">
            Position
            <Input
              id="edit-portfolio-position"
              className="mt-1 h-10"
              value={editPosition}
              onChange={(e) => setEditPosition(e.target.value)}
            />
          </Label>
          <Label htmlFor="edit-portfolio-ownership">
            Ownership %
            <Input
              id="edit-portfolio-ownership"
              className="mt-1 h-10"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={editOwnership}
              onChange={(e) => setEditOwnership(e.target.value)}
            />
          </Label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/70 px-4 py-3">
          <Button type="button" variant="ghost" onClick={() => setEditRow(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={editBusy || !editPosition.trim()}
            onClick={() => void onSaveEdit()}
          >
            {editBusy ? "Saving…" : "Save"}
          </Button>
        </div>
      </OverlayShell>
    </div>
  );
}
