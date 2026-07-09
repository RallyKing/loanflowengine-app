"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Building2, Mail, Pencil, Phone, UserRound, UsersRound, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { LinkedClientsEditor } from "@/components/pipeline/LinkedClientsEditor";
import { ClientAdditionalContactsPanel } from "@/components/pipeline/ClientAdditionalContactsPanel";
import { ClientPrimaryContactPicker } from "@/components/pipeline/ClientPrimaryContactPicker";
import { ContactProfileModal } from "@/components/pipeline/ContactProfileModal";
import {
  primaryContactEmail,
  primaryContactPhone,
} from "@/lib/contact/contactMethods";
import type { ClientWorkspaceAdditionalContact } from "@/lib/pipeline/clientWorkspaceTree";

export type ClientGroupModalProps = {
  open: boolean;
  onClose: () => void;
  clientId: Id<"clients">;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  canEdit: boolean;
  primaryContactId?: Id<"contacts">;
  primaryContactName?: string | null;
  additionalContacts: ClientWorkspaceAdditionalContact[];
};

/**
 * Full client-group manager: primary contact, additional contacts, business entities.
 */
export function ClientGroupModal({
  open,
  onClose,
  clientId,
  organizationId,
  memberUserKey,
  canEdit,
  primaryContactId,
  primaryContactName,
  additionalContacts,
}: ClientGroupModalProps) {
  const [profileContactId, setProfileContactId] = useState<Id<"contacts"> | null>(
    null,
  );

  const contactRoles = useQuery(api.organizationSettings.getContactRoles, {
    organizationId,
    memberUserKey,
  });

  const primaryContact = useQuery(
    api.contacts.get,
    open && primaryContactId
      ? { id: primaryContactId, memberUserKey }
      : "skip",
  );

  const entityCount = useQuery(
    api.pipelineClientWorkspaceMutations.getClientEntityEditor,
    open ? { organizationId, clientId, memberUserKey } : "skip",
  );
  const linkedEntityCount = entityCount?.linkedClients.length ?? 0;

  const resolvedPrimaryName =
    primaryContact?.name?.trim() || primaryContactName?.trim() || null;
  const primaryEmail = primaryContact
    ? primaryContactEmail(primaryContact)
    : "";
  const primaryPhone = primaryContact
    ? primaryContactPhone(primaryContact)
    : "";

  const closeProfile = () => setProfileContactId(null);

  return (
    <>
      <OverlayShell
        open={open}
        onClose={onClose}
        panelClassName="flex max-h-[min(90dvh,720px)] w-full max-w-lg flex-col overflow-hidden p-0"
        aria-labelledby="client-group-modal-title"
        data-testid="pipeline-client-group-modal"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2
              id="client-group-modal-title"
              className="flex items-center gap-2 text-base font-semibold text-foreground"
            >
              <UsersRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              Manage client group
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Primary contact, additional stakeholders, and linked business entities.
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
          <section
            className="rounded-dlc-md border border-border/70 bg-dlc-surface-high p-3"
            data-testid="pipeline-client-group-primary"
          >
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Primary contact
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              The client row title is derived from this CRM contact.
            </p>

            {primaryContactId && resolvedPrimaryName ? (
              <div
                className="mb-3 rounded-dlc-sm border border-border/60 bg-background p-3"
                data-testid="pipeline-client-group-primary-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-semibold text-foreground"
                      data-testid="pipeline-client-group-primary-name"
                    >
                      {resolvedPrimaryName}
                    </p>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p className="flex min-w-0 items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate">
                          {primaryEmail || "No email"}
                        </span>
                      </p>
                      <p className="flex min-w-0 items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate">
                          {primaryPhone || "No phone"}
                        </span>
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1 px-2.5 text-xs"
                    data-testid="pipeline-client-group-primary-edit"
                    onClick={() => setProfileContactId(primaryContactId)}
                  >
                    <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Edit contact
                  </Button>
                </div>
              </div>
            ) : (
              <p
                className="mb-3 text-sm text-muted-foreground"
                data-testid="pipeline-client-group-primary-missing"
              >
                No primary contact linked yet.
              </p>
            )}

            {canEdit ? (
              <ClientPrimaryContactPicker
                clientId={clientId}
                organizationId={organizationId}
                memberUserKey={memberUserKey}
              />
            ) : null}
          </section>

          <section
            className="rounded-dlc-md border border-border/70 bg-dlc-surface-high p-3"
            data-testid="pipeline-client-group-contacts"
          >
            <ClientAdditionalContactsPanel
              clientId={clientId}
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              contacts={additionalContacts}
              contactRoles={contactRoles ?? []}
              canEdit={canEdit}
            />
          </section>

          <section
            className="rounded-dlc-md border border-border/70 bg-dlc-surface-high p-3"
            data-testid="pipeline-client-group-entities"
          >
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Business entities
              {linkedEntityCount > 0 ? (
                <span className="font-normal normal-case text-muted-foreground">
                  ({linkedEntityCount})
                </span>
              ) : null}
            </div>
            <LinkedClientsEditor
              scope="client"
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              clientId={clientId}
              readOnly={!canEdit}
              compact
              suppressTitle
            />
          </section>
        </div>

        <div className="flex shrink-0 justify-end border-t border-border/70 px-4 py-3 sm:px-5">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </OverlayShell>

      <ContactProfileModal
        contactId={profileContactId}
        open={profileContactId != null}
        onClose={closeProfile}
        memberUserKey={memberUserKey}
        canEdit={canEdit}
        layer="COMMAND_PALETTE"
      />
    </>
  );
}
