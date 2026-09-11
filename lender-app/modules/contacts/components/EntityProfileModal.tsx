"use client";

import { useQuery } from "convex/react";
import { Building2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { EntityKycPanel } from "@/components/contacts/EntityKycPanel";
import { EntityWebsitesPanel } from "@/components/contacts/EntityWebsitesPanel";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { cn } from "@/lib/cn";
import { OP_WORKSPACE_ISLAND } from "@/lib/ui/operationalInputs";

export type EntityProfileModalProps = {
  open: boolean;
  onClose: () => void;
  entityId: Id<"clients"> | null;
  organizationId: Id<"organizations">;
  memberUserKey: string;
};

export function EntityProfileModal({
  open,
  onClose,
  entityId,
  organizationId,
  memberUserKey,
}: EntityProfileModalProps) {
  const hubDetail = useQuery(
    api.pipelineHierarchyQueries.getClientHubDetail,
    open && entityId
      ? {
          organizationId,
          clientId: entityId,
          memberUserKey,
        }
      : "skip",
  );

  const client = hubDetail?.client ?? null;
  const canEdit = hubDetail?.canEdit ?? false;
  const displayName =
    client?.displayName?.trim() ||
    client?.companyName?.trim() ||
    "Business entity";

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      panelClassName="flex max-h-[min(90dvh,680px)] w-full max-w-lg flex-col overflow-hidden p-0"
      aria-labelledby="entity-profile-modal-title"
      data-testid="entity-profile-modal"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2
            id="entity-profile-modal-title"
            className="flex items-center gap-2 text-base font-semibold text-foreground"
          >
            <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{displayName}</span>
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Business entity profile
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-4 w-4 shrink-0" aria-hidden />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        {hubDetail === undefined ? (
          <OperationalSkeletonList rows={4} />
        ) : hubDetail === null || !client ? (
          <p className="text-sm text-muted-foreground">
            This business entity could not be loaded or you may not have access.
          </p>
        ) : (
          <>
            <EntityKycPanel
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              entityId={entityId!}
              client={client}
              canEdit={canEdit}
            />

            <EntityWebsitesPanel
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              entityId={entityId!}
              client={client}
              canEdit={canEdit}
            />

            {(client.primaryContactName?.trim() ||
              client.primaryContactEmail?.trim() ||
              client.primaryContactPhone?.trim()) && (
              <section className={cn("grid gap-2", OP_WORKSPACE_ISLAND, "p-3")}>
                <p className="text-sm font-medium">Primary contact</p>
                <dl className="grid gap-2 text-sm sm:grid-cols-3">
                  {client.primaryContactName?.trim() ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">Name</dt>
                      <dd>{client.primaryContactName.trim()}</dd>
                    </div>
                  ) : null}
                  {client.primaryContactEmail?.trim() ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">Email</dt>
                      <dd>{client.primaryContactEmail.trim()}</dd>
                    </div>
                  ) : null}
                  {client.primaryContactPhone?.trim() ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">Phone</dt>
                      <dd>{client.primaryContactPhone.trim()}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            )}
          </>
        )}
      </div>
    </OverlayShell>
  );
}
