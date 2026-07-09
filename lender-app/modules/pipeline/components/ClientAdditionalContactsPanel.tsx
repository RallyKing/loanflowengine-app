"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Mail, Phone, Plus, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { contactMethodsCreateArgs } from "@/lib/contact/contactMethods";
import {
  contactRoleDisplayName,
  DEFAULT_CONTACT_ROLE_IDS,
  type ContactRole,
} from "@/lib/contact/contactRoles";
import type { ClientWorkspaceAdditionalContact } from "@/lib/pipeline/clientWorkspaceTree";

export type ClientAdditionalContactsPanelProps = {
  clientId: Id<"clients">;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  contacts: ClientWorkspaceAdditionalContact[];
  contactRoles: ContactRole[];
  canEdit: boolean;
};

function ContactRoleSelect({
  contactRoles,
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: {
  contactRoles: ContactRole[];
  value: string;
  onChange: (roleId: string) => void;
  disabled?: boolean;
  "aria-label": string;
}) {
  return (
    <select
      className="h-9 w-full rounded-dlc-sm border border-border bg-background px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || contactRoles.length === 0}
      aria-label={ariaLabel}
    >
      {contactRoles.map((role) => (
        <option key={role.id} value={role.id}>
          {role.displayName}
        </option>
      ))}
    </select>
  );
}

/**
 * Secondary CRM contacts for a client workspace (primary contact lives in header).
 */
export function ClientAdditionalContactsPanel({
  clientId,
  organizationId,
  memberUserKey,
  contacts,
  contactRoles,
  canEdit,
}: ClientAdditionalContactsPanelProps) {
  const orgContacts = useQuery(api.contacts.list, {
    organizationId,
    memberUserKey,
  });
  const addClientContact = useMutation(
    api.pipelineClientWorkspaceMutations.addClientContact,
  );
  const removeClientContact = useMutation(
    api.pipelineClientWorkspaceMutations.removeClientContact,
  );
  const createClientContactAndLink = useMutation(
    api.pipelineClientWorkspaceMutations.createClientContactAndLink,
  );

  const defaultRoleId =
    contactRoles[0]?.id ?? DEFAULT_CONTACT_ROLE_IDS.client;

  const [selectedContactId, setSelectedContactId] = useState<
    Id<"contacts"> | ""
  >("");
  const [linkRoleId, setLinkRoleId] = useState(defaultRoleId);
  const [linking, setLinking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRoleId, setNewRoleId] = useState(defaultRoleId);
  const [busyLinkId, setBusyLinkId] = useState<
    Id<"clientContactLinks"> | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const linkedContactIds = useMemo(
    () => new Set(contacts.map((row) => String(row.contactId))),
    [contacts],
  );

  const availableContacts = useMemo(
    () =>
      (orgContacts ?? []).filter((c) => !linkedContactIds.has(String(c._id))),
    [orgContacts, linkedContactIds],
  );

  const onLinkExisting = useCallback(async () => {
    if (!selectedContactId || !canEdit) return;
    setLinking(true);
    setError(null);
    try {
      await addClientContact({
        organizationId,
        clientId,
        memberUserKey,
        contactId: selectedContactId,
        contactRoleId: linkRoleId,
      });
      setSelectedContactId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
    }
  }, [
    addClientContact,
    canEdit,
    clientId,
    linkRoleId,
    memberUserKey,
    organizationId,
    selectedContactId,
  ]);

  const onCreateAndLink = useCallback(async () => {
    const name = newName.trim();
    if (!name || !canEdit) return;
    setCreating(true);
    setError(null);
    try {
      await createClientContactAndLink({
        organizationId,
        clientId,
        memberUserKey,
        name,
        contactRoleId: newRoleId,
        ...contactMethodsCreateArgs({ email: newEmail, phone: newPhone }),
      });
      setNewName("");
      setNewEmail("");
      setNewPhone("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }, [
    canEdit,
    clientId,
    createClientContactAndLink,
    memberUserKey,
    newEmail,
    newName,
    newPhone,
    newRoleId,
    organizationId,
  ]);

  return (
    <div
      className="space-y-3"
      data-testid="pipeline-client-additional-contacts-panel"
    >
      <div>
        <h4 className="text-sm font-semibold text-foreground">
          Additional contacts
        </h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Link secondary CRM contacts to this client group. The primary contact
          is set in the header above.
        </p>
      </div>

      {error ? (
        <p className="rounded-dlc-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {contacts.length === 0 ? (
        <p className="rounded-dlc-md border border-dashed border-border/60 px-3 py-3 text-center text-sm text-muted-foreground">
          No additional contacts linked yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((row) => (
            <li
              key={String(row.linkId)}
              className="flex flex-wrap items-start justify-between gap-2 rounded-dlc-md border border-border/70 bg-background px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{row.name}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {row.email ? (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" aria-hidden />
                      {row.email}
                    </span>
                  ) : null}
                  {row.phone ? (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" aria-hidden />
                      {row.phone}
                    </span>
                  ) : null}
                  <span>
                    Role:{" "}
                    {contactRoleDisplayName(contactRoles, row.contactRoleId ?? "") ??
                      row.role}
                  </span>
                </div>
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 shrink-0 p-0 text-destructive hover:text-destructive"
                  disabled={busyLinkId === row.linkId}
                  aria-label={`Remove ${row.name}`}
                  onClick={async () => {
                    setBusyLinkId(row.linkId);
                    setError(null);
                    try {
                      await removeClientContact({
                        organizationId,
                        clientId,
                        memberUserKey,
                        linkId: row.linkId,
                      });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusyLinkId(null);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <>
          <div className="rounded-dlc-md border border-border/70 bg-muted/15 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Link existing contact
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <select
                className="h-9 rounded-dlc-sm border border-border bg-background px-2 text-sm"
                value={selectedContactId}
                disabled={linking}
                aria-label="Select contact to link"
                onChange={(e) =>
                  setSelectedContactId(
                    e.target.value ? (e.target.value as Id<"contacts">) : "",
                  )
                }
              >
                <option value="">Choose contact…</option>
                {availableContacts.map((contact) => (
                  <option key={contact._id} value={contact._id}>
                    {contact.name}
                  </option>
                ))}
              </select>
              <ContactRoleSelect
                contactRoles={contactRoles}
                value={linkRoleId}
                disabled={linking}
                aria-label="CRM role for linked contact"
                onChange={setLinkRoleId}
              />
              <Button
                type="button"
                size="sm"
                className="h-9"
                disabled={!selectedContactId || linking}
                onClick={() => void onLinkExisting()}
              >
                {linking ? "Linking…" : "Link contact"}
              </Button>
            </div>
          </div>

          <div className="rounded-dlc-md border border-dashed border-border/70 bg-background p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Create &amp; link contact
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="client-additional-contact-name">Full name</Label>
                <Input
                  id="client-additional-contact-name"
                  className="mt-1 h-9"
                  value={newName}
                  placeholder="First Last"
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="client-additional-contact-role">CRM role</Label>
                <ContactRoleSelect
                  contactRoles={contactRoles}
                  value={newRoleId}
                  disabled={creating}
                  aria-label="CRM role for new contact"
                  onChange={setNewRoleId}
                />
              </div>
              <Input
                placeholder="Email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                aria-label="New contact email"
              />
              <Input
                placeholder="Phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                aria-label="New contact phone"
              />
            </div>
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={!newName.trim() || creating}
                onClick={() => void onCreateAndLink()}
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden />
                {creating ? "Creating…" : "Create & link"}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
