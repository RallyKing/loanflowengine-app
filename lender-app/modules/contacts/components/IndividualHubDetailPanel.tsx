"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import {
  Briefcase,
  ExternalLink,
  Mail,
  Phone,
  Plus,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { ContactRoleMultiSelect } from "@/components/contacts/ContactRoleMultiSelect";
import { ContactMethodsEditor } from "@/components/contacts/ContactMethodsEditor";
import { ContactRelationshipsTab } from "@/components/contacts/ContactRelationshipsTab";
import { ContactFinancialsTab } from "@/components/contacts/ContactFinancialsTab";
import { ContactDealsTab } from "@/components/contacts/ContactDealsTab";
import { ContactDocumentsNotesTab } from "@/components/contacts/ContactDocumentsNotesTab";
import { MergeRecordModal } from "@/components/contacts/MergeRecordModal";
import { ConvertToEntityModal } from "@/components/contacts/ConvertToEntityModal";
import {
  HierarchyActionWizard,
  type HierarchyActionWizardContext,
} from "@/components/pipeline/HierarchyActionWizard";
import { HubExecutiveLayout } from "@/components/contacts/hub/HubExecutiveLayout";
import { HubDetailTabs } from "@/components/contacts/hub/HubDetailTabs";
import {
  hubDetailStyles,
  hubInitials,
} from "@/components/contacts/hub/hubDetailStyles";
import {
  ContactRoleBadge,
  DealStatusBadge,
} from "@/components/contacts/hub/dealStatusBadge";
import {
  contactRoleDisplayName,
  contactRoleDisplayNames,
  effectiveContactRoleIdsFromDoc,
  type ContactRole,
} from "@/lib/contact/contactRoles";
import {
  primaryContactEmail,
  primaryContactPhone,
} from "@/lib/contact/contactMethods";
import { portfolioCountLabel } from "@/lib/contacts/entityPortfolioRoles";
import type { ContactHubRecord } from "@/lib/contacts/contactWithPrimaryEntity";
import { pipelineDealEditorHref } from "@/lib/pipeline/routes";
import type { ContactEmailEntry, ContactPhoneEntry } from "@/lib/contact/contactMethods";

export type IndividualHubDraft = {
  name: string;
  emails: ContactEmailEntry[];
  phones: ContactPhoneEntry[];
  notes: string;
  contactRoleIds: string[];
  fico: string;
  ssn: string;
  dob: string;
};

export type IndividualHubDetailPanelProps = {
  selectedId: Id<"contacts"> | "new";
  selectedDoc: ContactHubRecord | null;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  contactRoles: ContactRole[];
  editorDraft: IndividualHubDraft;
  onPatchDraft: (patch: Partial<IndividualHubDraft>) => void;
  onOpenEntityProfile: (entityId: Id<"clients">) => void;
  onOpenEntityInHub: (entityId: Id<"clients">) => void;
  hiddenByListFilters?: boolean;
  hiddenByRoleFilter?: boolean;
  saveError: string | null;
  saving: boolean;
  deleting: boolean;
  onSave: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onRemoveLenderLink: (lenderId: Id<"lenders">) => void | Promise<void>;
  canUseHub: boolean;
  layoutMode?: "embedded" | "commandCenter";
  backHref?: string;
};

export function IndividualHubDetailPanel({
  selectedId,
  selectedDoc,
  organizationId,
  memberUserKey,
  contactRoles,
  editorDraft,
  onPatchDraft,
  onOpenEntityProfile,
  onOpenEntityInHub,
  hiddenByListFilters = false,
  hiddenByRoleFilter = false,
  saveError,
  saving,
  deleting,
  onSave,
  onDelete,
  onRemoveLenderLink,
  canUseHub,
  layoutMode = "embedded",
  backHref = "/contacts",
}: IndividualHubDetailPanelProps) {
  const isNew = selectedId === "new";
  const contactId = !isNew ? selectedId : null;

  const associatedEntities = useQuery(
    api.entityContactLinks.listByContact,
    contactId
      ? { organizationId, contactId, memberUserKey }
      : "skip",
  );
  const associatedFiles = useQuery(
    api.contactFileLinks.listByContactWithFiles,
    contactId ? { contactId, memberUserKey } : "skip",
  );
  const associatedLenders = useQuery(
    api.contactLenderLinks.listByContactWithLenders,
    contactId ? { contactId, memberUserKey } : "skip",
  );

  const [activeTabId, setActiveTabId] = useState("profile-info");
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const tabsPanelRef = useRef<HTMLDivElement>(null);

  const wizardEntityOptions = useMemo(
    () =>
      (associatedEntities ?? [])
        .filter((row) => row.entity)
        .map((row) => ({
          clientId: row.link.entityId,
          label: row.entity?.displayName?.trim() || "Entity",
        })),
    [associatedEntities],
  );

  const newDealWizardContext = useMemo((): HierarchyActionWizardContext | null => {
    if (!contactId) return null;
    return {
      hubKind: "individual",
      contactId,
      contactLabel: editorDraft.name.trim() || "Contact",
      entityOptions: wizardEntityOptions,
      preferredClientId: selectedDoc?.primaryEntity?.entityId,
      preferredClientLabel: selectedDoc?.primaryEntity?.displayName,
    };
  }, [
    contactId,
    editorDraft.name,
    selectedDoc?.primaryEntity,
    wizardEntityOptions,
  ]);

  const portfolioCount = associatedEntities?.length ?? 0;

  const jumpToRelationshipsTab = useCallback(() => {
    setActiveTabId("relationships");
    requestAnimationFrame(() => {
      tabsPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }, []);

  const roleLabels =
    selectedDoc && !isNew
      ? contactRoleDisplayNames(
          contactRoles,
          effectiveContactRoleIdsFromDoc(selectedDoc),
        )
      : contactRoleDisplayNames(contactRoles, editorDraft.contactRoleIds);

  const displayEmail =
    (selectedDoc ? primaryContactEmail(selectedDoc) : "") ||
    editorDraft.emails.find((e) => e.email.trim())?.email.trim() ||
    "";
  const displayPhone =
    (selectedDoc ? primaryContactPhone(selectedDoc) : "") ||
    editorDraft.phones.find((p) => p.number.trim())?.number.trim() ||
    "";

  const banner = (
    <>
      {hiddenByListFilters ? (
        <div
          className="rounded-dlc-lg border border-border/80 bg-muted/50 px-4 py-3 text-dlc-body-sm text-muted-foreground"
          role="status"
        >
          This contact is hidden by the current list filters. Clear search or
          change keywords to highlight it in the list again.
        </div>
      ) : null}
      {hiddenByRoleFilter ? (
        <div
          className="rounded-dlc-lg border border-border/80 bg-muted/50 px-4 py-3 text-dlc-body-sm text-muted-foreground"
          role="status"
        >
          This contact is saved but hidden by the current list filters. Clear
          CRM role or entity relationship filters to highlight them again.
        </div>
      ) : null}
      {saveError ? (
        <div
          className="rounded-dlc-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {saveError}
        </div>
      ) : null}
    </>
  );

  const identity = (
    <>
      <div className={hubDetailStyles.identityCard}>
        <div className={hubDetailStyles.identityHero}>
          <div className={hubDetailStyles.avatar} aria-hidden>
            {hubInitials(editorDraft.name || "New contact")}
          </div>
          <div className="min-w-0 flex-1">
            <p className={hubDetailStyles.label}>
              {isNew ? "New individual" : "Individual contact"}
            </p>
            <Label htmlFor="hub-contact-name" className="mt-2 block">
              <span className="sr-only">Full name</span>
              <Input
                id="hub-contact-name"
                value={editorDraft.name}
                onChange={(e) =>
                  onPatchDraft({ name: e.currentTarget?.value ?? "" })
                }
                placeholder="Full name"
                autoComplete="name"
                className="mt-1 h-11 border-0 bg-transparent px-0 text-dlc-headline-sm font-semibold shadow-none focus-visible:ring-0"
                disabled={saving}
              />
            </Label>
            {roleLabels.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {roleLabels.map((label) => (
                  <ContactRoleBadge key={label} label={label} />
                ))}
              </div>
            ) : null}
            {!isNew ? (
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1.5 rounded-dlc-full border border-border/80 bg-muted/30 px-3 py-1.5 text-dlc-label-md font-medium text-foreground transition-colors duration-dlc-short hover:bg-muted/60 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="entity-portfolio-count-badge"
                onClick={jumpToRelationshipsTab}
                aria-label={`${portfolioCountLabel(portfolioCount)}. Jump to entity portfolio tab.`}
              >
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                {portfolioCountLabel(portfolioCount)}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className={hubDetailStyles.contactChipRow}>
        {displayEmail ? (
          <a href={`mailto:${displayEmail}`} className={hubDetailStyles.contactChip}>
            <Mail className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className={hubDetailStyles.label}>Email</p>
              <p className={cn(hubDetailStyles.value, "truncate")}>{displayEmail}</p>
            </div>
          </a>
        ) : null}
        {displayPhone ? (
          <a href={`tel:${displayPhone}`} className={hubDetailStyles.contactChip}>
            <Phone className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className={hubDetailStyles.label}>Phone</p>
              <p className={hubDetailStyles.value}>{displayPhone}</p>
            </div>
          </a>
        ) : null}
        {!displayEmail && !displayPhone ? (
          <p className={cn(hubDetailStyles.sectionHint, "sm:col-span-2 lg:col-span-3")}>
            Add email or phone in Profile Info.
          </p>
        ) : null}
      </div>
    </>
  );

  const profileInfoTab = (
    <div className="grid gap-6">
      <ContactMethodsEditor
        emails={editorDraft.emails}
        phones={editorDraft.phones}
        disabled={saving}
        onEmailsChange={(emails) => onPatchDraft({ emails })}
        onPhonesChange={(phones) => onPatchDraft({ phones })}
      />
      <Label htmlFor="hub-contact-role">
        CRM contact roles
        <ContactRoleMultiSelect
          id="hub-contact-role"
          contactRoles={contactRoles}
          value={editorDraft.contactRoleIds}
          onChange={(contactRoleIds) => onPatchDraft({ contactRoleIds })}
          disabled={saving}
          aria-label="CRM contact roles"
        />
      </Label>
      <Label htmlFor="hub-contact-notes" hint="Optional context or follow-ups.">
        Notes
        <Textarea
          id="hub-contact-notes"
          value={editorDraft.notes}
          onChange={(e) =>
            onPatchDraft({ notes: e.currentTarget?.value ?? "" })
          }
          rows={5}
          placeholder="Notes…"
          disabled={saving}
        />
      </Label>
      {!isNew ? (
        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setMergeOpen(true)}
          >
            Merge record
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConvertOpen(true)}
          >
            Convert to entity
          </Button>
        </div>
      ) : null}
    </div>
  );

  const relationshipsTab =
    isNew || !contactId ? (
      <p className={hubDetailStyles.sectionHint}>
        Save this contact first to manage entity portfolio and person-to-person
        relationships.
      </p>
    ) : (
      <ContactRelationshipsTab
        contactId={contactId}
        organizationId={organizationId}
        memberUserKey={memberUserKey}
        contactRoles={contactRoles}
        entityRows={associatedEntities}
        lenderRows={associatedLenders}
        onOpenEntityProfile={onOpenEntityProfile}
        onOpenEntityInHub={onOpenEntityInHub}
        onRemoveLenderLink={onRemoveLenderLink}
      />
    );

  const dealsTab =
    isNew || !contactId ? (
      <p className={hubDetailStyles.sectionHint}>
        Save this contact first to view linked pipeline deals.
      </p>
    ) : (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setNewDealOpen(true)}
            disabled={!canUseHub}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            New deal / file
          </Button>
        </div>
        <ContactDealsTab
          rows={associatedFiles}
          contactRoles={contactRoles}
          loading={associatedFiles === undefined}
        />
        {newDealWizardContext ? (
          <HierarchyActionWizard
            open={newDealOpen}
            onClose={() => setNewDealOpen(false)}
            context={newDealWizardContext}
            organizationId={organizationId}
            memberUserKey={memberUserKey}
          />
        ) : null}
      </>
    );

  const financialsTab =
    isNew || !contactId || !selectedDoc ? (
      <p className={hubDetailStyles.sectionHint}>
        Save this contact first to manage financial schedules and credit profile.
      </p>
    ) : (
      <ContactFinancialsTab
        contactId={contactId}
        memberUserKey={memberUserKey}
        contact={selectedDoc as Doc<"contacts">}
      />
    );

  const documentsNotesTab =
    isNew || !contactId ? (
      <p className={hubDetailStyles.sectionHint}>
        Save this contact to log notes and attach documents to the vault.
      </p>
    ) : (
      <ContactDocumentsNotesTab
        scope="contact"
        contactId={contactId}
        organizationId={organizationId}
        memberUserKey={memberUserKey}
        canUseHub={canUseHub}
      />
    );

  const footer = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        onClick={() => void onSave()}
        disabled={saving || !editorDraft.name.trim()}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
      {!isNew ? (
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10"
          onClick={() => void onDelete()}
          disabled={deleting}
        >
          <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
          {deleting ? "Deleting…" : "Delete"}
        </Button>
      ) : null}
    </div>
  );

  const operations = (
    <HubDetailTabs
      activeTabId={activeTabId}
      onTabChange={setActiveTabId}
      panelRef={tabsPanelRef}
      defaultTabId="profile-info"
      scrollablePanel={layoutMode === "commandCenter"}
      tabs={[
        { id: "profile-info", label: "Profile Info", content: profileInfoTab },
        { id: "relationships", label: "Relationships", content: relationshipsTab },
        { id: "deals", label: "Deals", content: dealsTab },
        { id: "financials", label: "Financials", content: financialsTab },
        {
          id: "documents-notes",
          label: "Documents & Notes",
          content: documentsNotesTab,
        },
      ]}
    />
  );

  const shellClass =
    layoutMode === "commandCenter"
      ? hubDetailStyles.commandCenterShell
      : hubDetailStyles.shell;

  return (
    <div className={hubDetailStyles.commandCenterPage} data-testid="contact-command-center">
      {layoutMode === "commandCenter" ? (
        <div className="border-b border-border/80 bg-dlc-surface/80 px-4 py-3 md:px-8">
          <Link
            href={backHref}
            className="text-dlc-label-md font-medium text-primary hover:underline"
          >
            ← Back to contacts
          </Link>
        </div>
      ) : null}
      <div className={shellClass}>
        <HubExecutiveLayout
          banner={
            hiddenByListFilters || hiddenByRoleFilter || saveError ? banner : null
          }
          identity={identity}
          operations={operations}
          footer={footer}
        />
      </div>
      {!isNew && contactId ? (
        <MergeRecordModal
          open={mergeOpen}
          onClose={() => setMergeOpen(false)}
          recordKind="contact"
          survivingRecordId={contactId}
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          recordLabel={editorDraft.name}
        />
      ) : null}
      {!isNew && contactId ? (
        <ConvertToEntityModal
          open={convertOpen}
          onClose={() => setConvertOpen(false)}
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          contactId={contactId}
          contactLabel={editorDraft.name}
        />
      ) : null}
    </div>
  );
}
