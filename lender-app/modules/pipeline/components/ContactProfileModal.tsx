"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import {
  contactMethodsCreateArgs,
  primaryContactEmail,
  primaryContactPhone,
} from "@/lib/contact/contactMethods";
import type { ZLayer } from "@/lib/ui/layering";

export type ContactProfileModalProps = {
  contactId: Id<"contacts"> | null;
  open: boolean;
  onClose: () => void;
  memberUserKey: string;
  canEdit?: boolean;
  /** Stack above another modal when nested (e.g. Manage group). */
  layer?: ZLayer;
};

function splitFullName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

function joinFullName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

/**
 * Live CRM contact profile — fetch by id, edit core fields, save via `contacts.update`.
 */
export function ContactProfileModal({
  contactId,
  open,
  onClose,
  memberUserKey,
  canEdit = true,
  layer = "MODAL",
}: ContactProfileModalProps) {
  const contact = useQuery(
    api.contacts.get,
    open && contactId
      ? { id: contactId, memberUserKey }
      : "skip",
  );
  const updateContact = useMutation(api.contacts.update);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contact) return;
    const split = splitFullName(contact.name ?? "");
    setFirstName(split.firstName);
    setLastName(split.lastName);
    setEmail(primaryContactEmail(contact));
    setPhone(primaryContactPhone(contact));
    setNotes(contact.notes ?? "");
    setError(null);
  }, [contact]);

  const onSave = useCallback(async () => {
    if (!contactId || !canEdit) return;
    const name = joinFullName(firstName, lastName);
    if (!name.trim()) {
      setError("First or last name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateContact({
        id: contactId,
        name: name.trim(),
        ...contactMethodsCreateArgs({ email, phone }),
        notes: notes.trim(),
        memberUserKey,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [
    canEdit,
    contactId,
    email,
    firstName,
    lastName,
    memberUserKey,
    notes,
    onClose,
    phone,
    updateContact,
  ]);

  const readOnly = !canEdit;
  const displayName = joinFullName(firstName, lastName) || contact?.name?.trim() || "Contact";

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      layer={layer}
      panelClassName="flex max-h-[min(90dvh,640px)] w-full max-w-md flex-col overflow-hidden p-0"
      aria-labelledby="contact-profile-modal-title"
      data-testid="pipeline-contact-profile-modal"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2
            id="contact-profile-modal-title"
            className="truncate text-base font-semibold text-foreground"
          >
            {readOnly ? displayName : "Edit contact"}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {readOnly
              ? "CRM contact profile"
              : "Changes sync to the global CRM record."}
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
        {contact === undefined ? (
          <p className="text-sm text-muted-foreground">Loading contact…</p>
        ) : contact === null ? (
          <p className="text-sm text-destructive">Contact not found.</p>
        ) : readOnly ? (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Name
              </dt>
              <dd className="mt-1 font-medium text-foreground">{displayName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Email
              </dt>
              <dd className="mt-1 text-foreground">{email || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Phone
              </dt>
              <dd className="mt-1 text-foreground">{phone || "—"}</dd>
            </div>
            {notes.trim() ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Notes
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-foreground">{notes}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="contact-profile-first-name">First name</Label>
                <Input
                  id="contact-profile-first-name"
                  className="mt-1 h-9"
                  value={firstName}
                  disabled={saving}
                  autoFocus
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="contact-profile-last-name">Last name</Label>
                <Input
                  id="contact-profile-last-name"
                  className="mt-1 h-9"
                  value={lastName}
                  disabled={saving}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="contact-profile-email">Email</Label>
              <Input
                id="contact-profile-email"
                type="email"
                className="mt-1 h-9"
                value={email}
                disabled={saving}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="contact-profile-phone">Phone</Label>
              <Input
                id="contact-profile-phone"
                type="tel"
                className="mt-1 h-9"
                value={phone}
                disabled={saving}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="contact-profile-notes">Notes</Label>
              <Textarea
                id="contact-profile-notes"
                className="mt-1 min-h-[4.5rem] resize-y"
                value={notes}
                disabled={saving}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border/70 px-4 py-3 sm:px-5">
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onClose}>
          {readOnly ? "Close" : "Cancel"}
        </Button>
        {!readOnly && contact ? (
          <Button
            type="button"
            size="sm"
            disabled={saving || contact === undefined}
            data-testid="pipeline-contact-profile-save"
            onClick={() => void onSave()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        ) : null}
      </div>
    </OverlayShell>
  );
}
