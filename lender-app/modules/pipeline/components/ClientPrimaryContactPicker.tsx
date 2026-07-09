"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, UserPlus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { contactMethodsCreateArgs } from "@/lib/contact/contactMethods";
import { cn } from "@/lib/cn";

export type ClientPrimaryContactPickerProps = {
  clientId: Id<"clients">;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  className?: string;
};

/**
 * Forces CRM linkage — client display name derives from the selected contact.
 */
export function ClientPrimaryContactPicker({
  clientId,
  organizationId,
  memberUserKey,
  className,
}: ClientPrimaryContactPickerProps) {
  const contacts = useQuery(api.contacts.list, {
    organizationId,
    memberUserKey,
  });
  const linkPrimaryContact = useMutation(
    api.hierarchyCrudMutations.linkClientPrimaryContact,
  );
  const createContact = useMutation(api.contacts.create);

  const [selectedContactId, setSelectedContactId] = useState<
    Id<"contacts"> | ""
  >("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLinkExisting = useCallback(async () => {
    if (!selectedContactId) {
      setError("Select a contact to link.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await linkPrimaryContact({
        organizationId,
        memberUserKey,
        clientId,
        contactId: selectedContactId,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not link contact.");
    } finally {
      setBusy(false);
    }
  }, [
    clientId,
    linkPrimaryContact,
    memberUserKey,
    organizationId,
    selectedContactId,
  ]);

  const onCreateAndLink = useCallback(async () => {
    const name = newName.trim();
    if (!name) {
      setError("Contact name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const contactId = await createContact({
        name,
        organizationId,
        memberUserKey,
        contactRoleId: "client",
        ...contactMethodsCreateArgs({
          email: newEmail,
          phone: newPhone,
        }),
      });
      await linkPrimaryContact({
        organizationId,
        memberUserKey,
        clientId,
        contactId,
      });
      setCreateOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create contact.");
    } finally {
      setBusy(false);
    }
  }, [
    clientId,
    createContact,
    linkPrimaryContact,
    memberUserKey,
    newEmail,
    newName,
    newPhone,
    organizationId,
  ]);

  return (
    <>
      <div
        className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-1.5", className)}
        data-testid="pipeline-client-primary-contact-picker"
      >
        <UserPlus
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <select
          className="h-8 min-w-0 max-w-[11rem] flex-1 truncate rounded-dlc-sm border border-border bg-background px-2 text-sm sm:max-w-[14rem]"
          value={selectedContactId}
          disabled={busy || contacts === undefined}
          aria-label="Select CRM contact"
          data-testid="pipeline-client-primary-contact-select"
          onChange={(e) => {
            setSelectedContactId(
              e.target.value ? (e.target.value as Id<"contacts">) : "",
            );
            setError(null);
          }}
        >
          <option value="">
            {contacts === undefined ? "Loading contacts…" : "Select contact…"}
          </option>
          {(contacts ?? []).map((contact) => (
            <option key={contact._id} value={contact._id}>
              {contact.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 px-2.5 text-xs"
          disabled={busy || !selectedContactId}
          data-testid="pipeline-client-primary-contact-link"
          onClick={() => void onLinkExisting()}
        >
          Link
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1 px-2.5 text-xs"
          disabled={busy}
          data-testid="pipeline-client-primary-contact-create"
          onClick={() => {
            setError(null);
            setCreateOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
          New
        </Button>
        {error ? (
          <span className="w-full truncate text-xs text-destructive">{error}</span>
        ) : null}
      </div>

      <OverlayShell
        open={createOpen}
        onClose={() => !busy && setCreateOpen(false)}
        align="center"
        panelClassName="w-full max-w-sm p-4 sm:p-5"
      >
        <div
          className="space-y-3"
          data-testid="pipeline-client-primary-contact-create-dialog"
        >
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Create CRM contact
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This client&apos;s name will match the contact you create.
            </p>
          </div>
          <div>
            <Label htmlFor="client-primary-contact-name">Full name *</Label>
            <Input
              id="client-primary-contact-name"
              className="mt-1"
              value={newName}
              autoFocus
              placeholder="First Last"
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="client-primary-contact-email">Email</Label>
            <Input
              id="client-primary-contact-email"
              className="mt-1"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="client-primary-contact-phone">Phone</Label>
            <Input
              id="client-primary-contact-phone"
              className="mt-1"
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || !newName.trim()}
              onClick={() => void onCreateAndLink()}
            >
              Create &amp; link
            </Button>
          </div>
        </div>
      </OverlayShell>
    </>
  );
}
