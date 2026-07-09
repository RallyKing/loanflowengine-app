"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, Phone, Trash2 } from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InlineTextarea } from "@/components/inline";
import { FieldLabel } from "@/components/pipeline/FieldLabel";
import { IntelligentAlertsCallout } from "@/components/IntelligentAlertsCallout";
import { buildContactFileAlerts } from "@/lib/intelligentAlerts";
import {
  resolvePreferredEmail,
  resolvePreferredPhone,
} from "@/lib/contact/contactMethods";
import {
  contactRoleDisplayName,
  DEFAULT_CONTACT_ROLE_IDS,
  effectiveContactRoleIdFromDoc,
  type ContactRole,
} from "@/lib/contact/contactRoles";

export type StandaloneContact = Doc<"contacts">;
export type ContactFileLinkRow = Doc<"contactFileLinks">;

export type FileContactsBlockProps = {
  contacts: StandaloneContact[];
  links: ContactFileLinkRow[];
  contactRoles: ContactRole[];
  legacyContactCount: number;
  onLink: (
    contactId: Id<"contacts">,
    args: { contactRoleId: string; notes?: string }
  ) => Promise<void>;
  onCreateAndLink: (args: {
    name: string;
    email?: string;
    phone?: string;
    notes?: string;
    contactRoleId: string;
  }) => Promise<void>;
  onUpdateLink: (link: ContactFileLinkRow) => Promise<void>;
  onRemoveLink: (linkId: Id<"contactFileLinks">) => Promise<void>;
  /**
   * Phase Modular-A — assign a linked contact into a deal borrower slot,
   * pulling identity from the global contact record.
   */
  onAssignToBorrowerSlot?: (
    contactId: Id<"contacts">,
    slot: "primary" | "coborrower"
  ) => Promise<void>;
};

function isBorrowerClassLink(link: ContactFileLinkRow): boolean {
  if (
    link.registryRoleId === "primary_borrower" ||
    link.registryRoleId === "coborrower"
  ) {
    return true;
  }
  const role = link.role.toLowerCase();
  return /co-sign|co-borrow|cosign|borrower/.test(role) || role === "client";
}

function effectiveLinkContactRoleId(
  link: ContactFileLinkRow,
  contact: StandaloneContact | null
): string {
  if (link.contactRoleId?.trim()) return link.contactRoleId.trim();
  if (contact) return effectiveContactRoleIdFromDoc(contact);
  return DEFAULT_CONTACT_ROLE_IDS.client;
}

function ContactRoleSelect({
  contactRoles,
  value,
  onChange,
  disabled,
  id,
  "aria-label": ariaLabel,
}: {
  contactRoles: ContactRole[];
  value: string;
  onChange: (roleId: string) => void;
  disabled?: boolean;
  id?: string;
  "aria-label": string;
}) {
  return (
    <select
      id={id}
      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
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
 * Registry-aligned body for the **Contacts** drawer block (`contacts`):
 * standalone contacts linked to this pipeline file via `contactFileLinks`.
 */
export function FileContactsBlock({
  contacts,
  links,
  contactRoles,
  legacyContactCount,
  onLink,
  onCreateAndLink,
  onUpdateLink,
  onRemoveLink,
  onAssignToBorrowerSlot,
}: FileContactsBlockProps) {
  const defaultRoleId =
    contactRoles[0]?.id ?? DEFAULT_CONTACT_ROLE_IDS.client;

  const [selectedContactId, setSelectedContactId] = useState<Id<"contacts"> | "">(
    ""
  );
  const [linkContactRoleId, setLinkContactRoleId] = useState(defaultRoleId);
  const [linkNotes, setLinkNotes] = useState("");
  const [linking, setLinking] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newContactRoleId, setNewContactRoleId] = useState(defaultRoleId);

  const [busyLinkId, setBusyLinkId] = useState<Id<"contactFileLinks"> | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const contactById = useMemo(() => {
    const m = new Map<Id<"contacts">, StandaloneContact>();
    for (const c of contacts) m.set(c._id, c);
    return m;
  }, [contacts]);

  const linkedContactIds = useMemo(
    () => new Set(links.map((l) => l.contactId)),
    [links]
  );

  const availableContacts = useMemo(
    () => contacts.filter((c) => !linkedContactIds.has(c._id)),
    [contacts, linkedContactIds]
  );

  const hydratedLinks = useMemo(
    () =>
      links.map((l) => ({
        link: l,
        contact: contactById.get(l.contactId) ?? null,
      })),
    [links, contactById]
  );

  const contactAlerts = useMemo(
    () =>
      buildContactFileAlerts({
        legacyContactCount,
        linkedContactCount: links.length,
      }),
    [legacyContactCount, links.length]
  );

  useEffect(() => {
    if (!selectedContactId) return;
    const contact = contactById.get(selectedContactId);
    if (contact) {
      setLinkContactRoleId(effectiveContactRoleIdFromDoc(contact));
    }
  }, [selectedContactId, contactById]);

  useEffect(() => {
    if (contactRoles.length === 0) return;
    const ids = new Set(contactRoles.map((r) => r.id));
    if (!ids.has(linkContactRoleId)) {
      setLinkContactRoleId(contactRoles[0]!.id);
    }
    if (!ids.has(newContactRoleId)) {
      setNewContactRoleId(contactRoles[0]!.id);
    }
  }, [contactRoles, linkContactRoleId, newContactRoleId]);

  const submitLinkExisting = async () => {
    if (!selectedContactId) return;
    const contactRoleId = linkContactRoleId.trim();
    if (!contactRoleId) {
      setError("CRM role is required.");
      return;
    }
    setError(null);
    setLinking(true);
    try {
      await onLink(selectedContactId, {
        contactRoleId,
        notes: linkNotes.trim() || undefined,
      });
      setSelectedContactId("");
      setLinkContactRoleId(defaultRoleId);
      setLinkNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
    }
  };

  const submitCreateAndLink = async () => {
    const name = newName.trim();
    const contactRoleId = newContactRoleId.trim();
    if (!name) {
      setError("Name is required for new contact.");
      return;
    }
    if (!contactRoleId) {
      setError("CRM role is required.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      await onCreateAndLink({
        name,
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        notes: newNotes.trim() || undefined,
        contactRoleId,
      });
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setNewNotes("");
      setNewContactRoleId(defaultRoleId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      {contactAlerts.length > 0 ? (
        <IntelligentAlertsCallout alerts={contactAlerts} maxVisible={1} />
      ) : null}
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">Associated Contacts</h4>
        <p className="text-xs text-muted-foreground">
          Link contacts to this file and assign a CRM role from your organization
          settings.
        </p>
        {legacyContactCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            {legacyContactCount} legacy file contact
            {legacyContactCount === 1 ? "" : "s"} preserved in storage (hidden
            from this editor to avoid duplicate systems).
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {hydratedLinks.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
          No associated contacts yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {hydratedLinks.map(({ link, contact }) => {
            const email = contact ? resolvePreferredEmail(contact) : "";
            const phone = contact ? resolvePreferredPhone(contact) : "";
            const linkRoleId = effectiveLinkContactRoleId(link, contact);
            return (
            <li
              key={link._id}
              className="rounded-md border border-border/70 bg-background p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium max-md:break-words max-md:whitespace-normal max-md:[overflow-wrap:anywhere] md:truncate"
                    data-testid="file-contact-display-name"
                  >
                    {contact?.name ?? "Unknown contact"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {email ? (
                      <a
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                        href={`mailto:${email}`}
                      >
                        <Mail className="h-3 w-3" /> {email}
                      </a>
                    ) : null}
                    {phone ? (
                      <a
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                        href={`tel:${phone.replace(/\s/g, "")}`}
                      >
                        <Phone className="h-3 w-3" /> {phone}
                      </a>
                    ) : null}
                    <span
                      className="text-xs text-muted-foreground"
                      data-testid="file-contact-crm-role"
                    >
                      Role:{" "}
                      {contactRoleDisplayName(contactRoles, linkRoleId) ??
                        linkRoleId}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={busyLinkId === link._id}
                  onClick={async () => {
                    setError(null);
                    setBusyLinkId(link._id);
                    try {
                      await onRemoveLink(link._id);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusyLinkId(null);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <FieldLabel>CRM role on this file</FieldLabel>
                  <ContactRoleSelect
                    contactRoles={contactRoles}
                    value={linkRoleId}
                    disabled={busyLinkId === link._id}
                    aria-label={`CRM role for ${contact?.name ?? "contact"} on this file`}
                    onChange={async (nextRoleId) => {
                      if (nextRoleId === linkRoleId) return;
                      const roleLabel =
                        contactRoleDisplayName(contactRoles, nextRoleId) ??
                        nextRoleId;
                      setError(null);
                      setBusyLinkId(link._id);
                      try {
                        await onUpdateLink({
                          ...link,
                          contactRoleId: nextRoleId,
                          role: roleLabel,
                        });
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setBusyLinkId(null);
                      }
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Link notes</FieldLabel>
                  <InlineTextarea
                    value={link.notes ?? ""}
                    rows={2}
                    onCommit={async (next) => {
                      setError(null);
                      setBusyLinkId(link._id);
                      try {
                        await onUpdateLink({
                          ...link,
                          notes: next.trim() || undefined,
                        });
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setBusyLinkId(null);
                      }
                    }}
                    ariaLabel={`Notes for ${contact?.name ?? "contact"} relationship`}
                    placeholder="Optional notes for this contact's involvement on this file"
                  />
                </div>
              </div>

              {onAssignToBorrowerSlot && contact ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
                  {isBorrowerClassLink(link) ? (
                    <span
                      className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                      data-testid="file-contact-borrower-badge"
                    >
                      {link.registryRoleId === "primary_borrower"
                        ? "Primary borrower"
                        : "On borrower slot"}
                    </span>
                  ) : null}
                  {link.registryRoleId !== "primary_borrower" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      disabled={busyLinkId === link._id}
                      data-testid="file-contact-assign-primary"
                      onClick={async () => {
                        setError(null);
                        setBusyLinkId(link._id);
                        try {
                          await onAssignToBorrowerSlot(contact._id, "primary");
                        } catch (e) {
                          setError(e instanceof Error ? e.message : String(e));
                        } finally {
                          setBusyLinkId(null);
                        }
                      }}
                    >
                      Set as primary borrower
                    </Button>
                  ) : null}
                  {!isBorrowerClassLink(link) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      disabled={busyLinkId === link._id}
                      data-testid="file-contact-assign-coborrower"
                      onClick={async () => {
                        setError(null);
                        setBusyLinkId(link._id);
                        try {
                          await onAssignToBorrowerSlot(
                            contact._id,
                            "coborrower"
                          );
                        } catch (e) {
                          setError(e instanceof Error ? e.message : String(e));
                        } finally {
                          setBusyLinkId(null);
                        }
                      }}
                    >
                      Add as co-borrower
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-md border border-border/70 bg-muted/20 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Link Existing Contact
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            value={selectedContactId}
            onChange={(e) =>
              setSelectedContactId(e.currentTarget.value as Id<"contacts"> | "")
            }
            aria-label="Select existing contact to link"
          >
            <option value="">Choose contact…</option>
            {availableContacts.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
          <ContactRoleSelect
            contactRoles={contactRoles}
            value={linkContactRoleId}
            disabled={linking}
            aria-label="CRM role for associated contact"
            onChange={setLinkContactRoleId}
          />
          <Input
            placeholder="Optional relationship notes"
            value={linkNotes}
            onChange={(e) => setLinkNotes(e.currentTarget.value)}
            aria-label="Notes for associated contact relationship"
          />
        </div>
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={
              !selectedContactId ||
              !linkContactRoleId.trim() ||
              linking ||
              contactRoles.length === 0
            }
            onClick={() => void submitLinkExisting()}
          >
            {linking ? "Linking…" : "Link contact"}
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-dashed bg-background p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Create & Link New Contact
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            placeholder="Name (required)"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            aria-label="New contact name"
          />
          <ContactRoleSelect
            contactRoles={contactRoles}
            value={newContactRoleId}
            disabled={creating}
            aria-label="CRM role for new contact"
            onChange={setNewContactRoleId}
          />
          <Input
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.currentTarget.value)}
            aria-label="New contact email"
          />
          <Input
            placeholder="Phone"
            value={newPhone}
            onChange={(e) => setNewPhone(e.currentTarget.value)}
            aria-label="New contact phone"
          />
          <div className="sm:col-span-2">
            <Input
              placeholder="Notes (stored on contact)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.currentTarget.value)}
              aria-label="New contact notes"
            />
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={
              !newName.trim() ||
              !newContactRoleId.trim() ||
              creating ||
              contactRoles.length === 0
            }
            onClick={() => void submitCreateAndLink()}
          >
            {creating ? "Creating…" : "Create and link"}
          </Button>
        </div>
      </div>
    </div>
  );
}
