"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, Mail, Phone, Plus, Trash2, UserPlus } from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { InlineText } from "@/components/inline";
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
import { cn } from "@/lib/cn";

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
  className,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: {
  contactRoles: ContactRole[];
  value: string;
  onChange: (roleId: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label": string;
  "data-testid"?: string;
}) {
  return (
    <select
      id={id}
      data-testid={testId}
      className={cn(
        "h-10 min-h-[40px] w-full rounded-dlc-sm border border-border bg-background px-2.5 text-sm sm:h-9 sm:min-h-9",
        className
      )}
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

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

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
  const [modalError, setModalError] = useState<string | null>(null);

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

  const resetLinkForm = () => {
    setSelectedContactId("");
    setLinkContactRoleId(defaultRoleId);
    setLinkNotes("");
    setModalError(null);
  };

  const resetCreateForm = () => {
    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setNewNotes("");
    setNewContactRoleId(defaultRoleId);
    setModalError(null);
  };

  const openLinkModal = () => {
    setError(null);
    resetLinkForm();
    setLinkModalOpen(true);
  };

  const openCreateModal = () => {
    setError(null);
    resetCreateForm();
    setCreateModalOpen(true);
  };

  const submitLinkExisting = async () => {
    if (!selectedContactId) return;
    const contactRoleId = linkContactRoleId.trim();
    if (!contactRoleId) {
      setModalError("CRM role is required.");
      return;
    }
    setModalError(null);
    setLinking(true);
    try {
      await onLink(selectedContactId, {
        contactRoleId,
        notes: linkNotes.trim() || undefined,
      });
      resetLinkForm();
      setLinkModalOpen(false);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
    }
  };

  const submitCreateAndLink = async () => {
    const name = newName.trim();
    const contactRoleId = newContactRoleId.trim();
    if (!name) {
      setModalError("Name is required for new contact.");
      return;
    }
    if (!contactRoleId) {
      setModalError("CRM role is required.");
      return;
    }
    setModalError(null);
    setCreating(true);
    try {
      await onCreateAndLink({
        name,
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        notes: newNotes.trim() || undefined,
        contactRoleId,
      });
      resetCreateForm();
      setCreateModalOpen(false);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const headerActionClass =
    "h-10 min-h-[40px] gap-1 px-2.5 text-xs sm:h-8 sm:min-h-8";

  return (
    <div className="space-y-2">
      {contactAlerts.length > 0 ? (
        <IntelligentAlertsCallout alerts={contactAlerts} maxVisible={1} />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold leading-none">
              Associated Contacts
            </h4>
            {links.length > 0 ? (
              <span
                className="inline-flex items-center rounded-dlc-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
                data-testid="file-contacts-linked-count"
              >
                {links.length} linked
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            CRM contacts on this file with an organization role.
          </p>
          {legacyContactCount > 0 ? (
            <p className="text-xs text-muted-foreground">
              {legacyContactCount} legacy file contact
              {legacyContactCount === 1 ? "" : "s"} preserved in storage (hidden
              from this editor to avoid duplicate systems).
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={headerActionClass}
            data-testid="file-contacts-link-existing"
            onClick={openLinkModal}
          >
            <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Link existing
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={headerActionClass}
            data-testid="file-contacts-create-new"
            onClick={openCreateModal}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Create new
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-dlc-sm border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {hydratedLinks.length === 0 ? (
        <div
          className="rounded-dlc-sm border border-dashed border-border/80 bg-dlc-surface-low/30 px-3 py-4 text-center"
          data-testid="file-contacts-empty"
        >
          <UserPlus
            className="mx-auto h-5 w-5 text-muted-foreground/70"
            aria-hidden
          />
          <p className="mt-1.5 text-sm text-muted-foreground">
            No associated contacts yet.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/80">
            Link an existing CRM contact or create a new one.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={headerActionClass}
              onClick={openLinkModal}
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Link existing
            </Button>
            <Button
              type="button"
              size="sm"
              className={headerActionClass}
              onClick={openCreateModal}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Create new
            </Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {hydratedLinks.map(({ link, contact }) => {
            const email = contact ? resolvePreferredEmail(contact) : "";
            const phone = contact ? resolvePreferredPhone(contact) : "";
            const linkRoleId = effectiveLinkContactRoleId(link, contact);
            return (
              <li
                key={link._id}
                className="rounded-dlc-sm border border-border/60 bg-dlc-surface px-2.5 py-2 shadow-dlc-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p
                        className="text-sm font-medium leading-tight max-md:break-words max-md:whitespace-normal max-md:[overflow-wrap:anywhere] md:truncate"
                        data-testid="file-contact-display-name"
                      >
                        {contact?.name ?? "Unknown contact"}
                      </p>
                      <span className="inline-flex items-center rounded-dlc-sm bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        Linked
                      </span>
                      {isBorrowerClassLink(link) ? (
                        <span
                          className="inline-flex items-center rounded-dlc-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
                          data-testid="file-contact-borrower-badge"
                        >
                          {link.registryRoleId === "primary_borrower"
                            ? "Primary"
                            : "Borrower"}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {email ? (
                        <a
                          className="inline-flex min-h-[40px] items-center gap-1 text-primary hover:underline sm:min-h-0"
                          href={`mailto:${email}`}
                        >
                          <Mail className="h-3 w-3 shrink-0" /> {email}
                        </a>
                      ) : null}
                      {phone ? (
                        <a
                          className="inline-flex min-h-[40px] items-center gap-1 text-primary hover:underline sm:min-h-0"
                          href={`tel:${phone.replace(/\s/g, "")}`}
                        >
                          <Phone className="h-3 w-3 shrink-0" /> {phone}
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-10 w-10 shrink-0 p-0 text-muted-foreground hover:text-destructive sm:h-8 sm:w-8"
                    disabled={busyLinkId === link._id}
                    aria-label={`Unlink ${contact?.name ?? "contact"}`}
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

                <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:items-end">
                  <div className="space-y-0.5">
                    <FieldLabel>Role</FieldLabel>
                    <ContactRoleSelect
                      contactRoles={contactRoles}
                      value={linkRoleId}
                      disabled={busyLinkId === link._id}
                      aria-label={`CRM role for ${contact?.name ?? "contact"} on this file`}
                      data-testid="file-contact-crm-role"
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
                  <div className="space-y-0.5">
                    <FieldLabel>Notes</FieldLabel>
                    <InlineText
                      value={link.notes ?? ""}
                      allowEmpty
                      placeholder="Optional link notes"
                      ariaLabel={`Notes for ${contact?.name ?? "contact"} relationship`}
                      displayClassName="h-10 min-h-[40px] py-2 text-xs sm:h-9 sm:min-h-9"
                      inputClassName="h-10 min-h-[40px] text-xs sm:h-9 sm:min-h-9"
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
                    />
                  </div>
                </div>

                {onAssignToBorrowerSlot && contact ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-border/50 pt-1.5">
                    {link.registryRoleId !== "primary_borrower" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-10 min-h-[40px] px-2 text-xs sm:h-7 sm:min-h-7"
                        disabled={busyLinkId === link._id}
                        data-testid="file-contact-assign-primary"
                        onClick={async () => {
                          setError(null);
                          setBusyLinkId(link._id);
                          try {
                            await onAssignToBorrowerSlot(contact._id, "primary");
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : String(e)
                            );
                          } finally {
                            setBusyLinkId(null);
                          }
                        }}
                      >
                        Set primary
                      </Button>
                    ) : null}
                    {!isBorrowerClassLink(link) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-10 min-h-[40px] px-2 text-xs sm:h-7 sm:min-h-7"
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
                            setError(
                              e instanceof Error ? e.message : String(e)
                            );
                          } finally {
                            setBusyLinkId(null);
                          }
                        }}
                      >
                        Add co-borrower
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <OverlayShell
        open={linkModalOpen}
        onClose={() => {
          if (linking) return;
          setLinkModalOpen(false);
          setModalError(null);
        }}
        align="bottom-sheet"
        aria-label="Link existing contact"
        panelClassName="flex w-full max-w-md max-h-[min(90dvh,640px)] flex-col overflow-hidden p-0"
        data-testid="file-contacts-link-modal"
      >
        <div className="shrink-0 border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            Link existing contact
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose a CRM contact, assign a role, and optionally add notes.
          </p>
        </div>
        <div className="min-h-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain px-4 py-3">
          {availableContacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All contacts are already linked, or none exist yet. Create a new
              contact instead.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <FieldLabel>Contact</FieldLabel>
                <select
                  className="h-10 min-h-[40px] w-full rounded-dlc-sm border border-border bg-background px-3 text-sm"
                  value={selectedContactId}
                  onChange={(e) =>
                    setSelectedContactId(
                      e.currentTarget.value as Id<"contacts"> | ""
                    )
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
              </div>
              <div className="space-y-1">
                <FieldLabel>CRM role</FieldLabel>
                <ContactRoleSelect
                  contactRoles={contactRoles}
                  value={linkContactRoleId}
                  disabled={linking}
                  aria-label="CRM role for associated contact"
                  onChange={setLinkContactRoleId}
                />
              </div>
              <div className="space-y-1">
                <FieldLabel>Notes (optional)</FieldLabel>
                <Input
                  placeholder="Relationship notes for this file"
                  value={linkNotes}
                  onChange={(e) => setLinkNotes(e.currentTarget.value)}
                  aria-label="Notes for associated contact relationship"
                  className="h-10 min-h-[40px]"
                />
              </div>
            </div>
          )}
          {modalError && linkModalOpen ? (
            <p className="mt-3 text-xs text-destructive">{modalError}</p>
          ) : null}
        </div>
        <div className="shrink-0 flex justify-end gap-2 border-t border-border/60 px-4 py-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-10 min-h-[40px] sm:h-8 sm:min-h-8"
            disabled={linking}
            onClick={() => {
              setLinkModalOpen(false);
              setModalError(null);
            }}
          >
            Cancel
          </Button>
          {availableContacts.length === 0 ? (
            <Button
              type="button"
              size="sm"
              className="h-10 min-h-[40px] sm:h-8 sm:min-h-8"
              disabled={linking}
              onClick={() => {
                setLinkModalOpen(false);
                openCreateModal();
              }}
            >
              Create new
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-10 min-h-[40px] sm:h-8 sm:min-h-8"
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
          )}
        </div>
      </OverlayShell>

      <OverlayShell
        open={createModalOpen}
        onClose={() => {
          if (creating) return;
          setCreateModalOpen(false);
          setModalError(null);
        }}
        align="bottom-sheet"
        aria-label="Create and link new contact"
        panelClassName="flex w-full max-w-md max-h-[min(90dvh,640px)] flex-col overflow-hidden p-0"
        data-testid="file-contacts-create-modal"
      >
        <div className="shrink-0 border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            Create &amp; link contact
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Add a CRM contact and associate them with this file.
          </p>
        </div>
        <div className="min-h-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain px-4 py-3">
          <div className="space-y-3">
            <div className="space-y-1">
              <FieldLabel>Name</FieldLabel>
              <Input
                placeholder="Full name (required)"
                value={newName}
                onChange={(e) => setNewName(e.currentTarget.value)}
                aria-label="New contact name"
                className="h-10 min-h-[40px]"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <FieldLabel>CRM role</FieldLabel>
              <ContactRoleSelect
                contactRoles={contactRoles}
                value={newContactRoleId}
                disabled={creating}
                aria-label="CRM role for new contact"
                onChange={setNewContactRoleId}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <FieldLabel>Email</FieldLabel>
                <Input
                  placeholder="Email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.currentTarget.value)}
                  aria-label="New contact email"
                  className="h-10 min-h-[40px]"
                />
              </div>
              <div className="space-y-1">
                <FieldLabel>Phone</FieldLabel>
                <Input
                  placeholder="Phone"
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.currentTarget.value)}
                  aria-label="New contact phone"
                  className="h-10 min-h-[40px]"
                />
              </div>
            </div>
            <div className="space-y-1">
              <FieldLabel>Notes (optional)</FieldLabel>
              <Input
                placeholder="Stored on the contact"
                value={newNotes}
                onChange={(e) => setNewNotes(e.currentTarget.value)}
                aria-label="New contact notes"
                className="h-10 min-h-[40px]"
              />
            </div>
          </div>
          {modalError && createModalOpen ? (
            <p className="mt-3 text-xs text-destructive">{modalError}</p>
          ) : null}
        </div>
        <div className="shrink-0 flex justify-end gap-2 border-t border-border/60 px-4 py-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-10 min-h-[40px] sm:h-8 sm:min-h-8"
            disabled={creating}
            onClick={() => {
              setCreateModalOpen(false);
              setModalError(null);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-10 min-h-[40px] sm:h-8 sm:min-h-8"
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
      </OverlayShell>
    </div>
  );
}
