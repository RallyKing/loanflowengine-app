"use client";



import Link from "next/link";

import { useMemo, useState } from "react";

import { useQuery } from "convex/react";

import { Building2, ExternalLink, Mail, Phone, Plus, UserCircle2 } from "lucide-react";

import { api } from "@/convex/_generated/api";

import type { Doc, Id } from "@/convex/_generated/dataModel";

import { cn } from "@/lib/cn";

import { pipelineClientWorkspaceHref } from "@/lib/pipeline/routes";

import { EntityKycPanel } from "@/components/contacts/EntityKycPanel";

import { EntityWebsitesPanel } from "@/components/contacts/EntityWebsitesPanel";

import { EntityWebsitesList } from "@/components/contacts/EntityWebsitesList";

import { EntityCapTableTab } from "@/components/contacts/EntityCapTableTab";

import { EntityDealsTab } from "@/components/contacts/EntityDealsTab";

import { ContactDocumentsNotesTab } from "@/components/contacts/ContactDocumentsNotesTab";

import { MergeRecordModal } from "@/components/contacts/MergeRecordModal";

import { HierarchyActionWizard } from "@/components/pipeline/HierarchyActionWizard";

import { Button } from "@/components/ui/Button";

import { HubExecutiveLayout } from "@/components/contacts/hub/HubExecutiveLayout";

import { HubDetailTabs } from "@/components/contacts/hub/HubDetailTabs";

import {

  hubDetailStyles,

} from "@/components/contacts/hub/hubDetailStyles";

import { Badge } from "@/components/ui/Badge";

import {

  clientEntityTypeLabel,

  formatEntityFormationDate,

} from "@/lib/contacts/entityKycTypes";

import { resolveEntityWebsites } from "@/lib/contacts/entityWebsites";



type EntityHubDetailPanelProps = {

  organizationId: Id<"organizations">;

  memberUserKey: string;

  entityId: Id<"clients">;

  client: Doc<"clients">;

  canEdit: boolean;

  canUseHub: boolean;

  hiddenByFilters?: boolean;

  layoutMode?: "embedded" | "commandCenter";

  backHref?: string;

};



export function EntityHubDetailPanel({

  organizationId,

  memberUserKey,

  entityId,

  client,

  canEdit,

  canUseHub,

  hiddenByFilters = false,

  layoutMode = "embedded",

  backHref = "/contacts",

}: EntityHubDetailPanelProps) {

  const [newDealOpen, setNewDealOpen] = useState(false);

  const [mergeOpen, setMergeOpen] = useState(false);

  const linkedIndividuals = useQuery(api.entityContactLinks.listByEntity, {

    organizationId,

    entityId,

    memberUserKey,

  });



  const entityDeals = useQuery(

    api.pipelineHierarchyFilterQueries.listFilesInvolvingClient,

    {

      organizationId,

      clientId: entityId,

      memberUserKey,

    },

  );



  const vaultContact = useMemo(() => {

    if (client.primaryContactId) {

      const hit = linkedIndividuals?.find(

        (row) => String(row.contact?._id) === String(client.primaryContactId),

      );

      return {

        contactId: client.primaryContactId,

        name:

          hit?.contact?.name?.trim() ||

          client.primaryContactName?.trim() ||

          null,

      };

    }

    const first = linkedIndividuals?.find((row) => row.contact != null);

    if (first?.contact) {

      return {

        contactId: first.contact._id,

        name: first.contact.name?.trim() || null,

      };

    }

    return { contactId: null, name: null };

  }, [client.primaryContactId, client.primaryContactName, linkedIndividuals]);



  const displayName =

    client.displayName?.trim() || client.companyName?.trim() || "Business entity";



  const banner = hiddenByFilters ? (

    <div

      className="rounded-dlc-lg border border-slate-200 bg-muted/50 px-4 py-3 text-dlc-body-sm text-muted-foreground"

      role="status"

    >

      This entity is saved but hidden by the current list filters. Clear filters

      to highlight it in the list again.

    </div>

  ) : null;



  const identity = (

    <>

      <div className={hubDetailStyles.identityCard}>

        <div className={hubDetailStyles.identityHero}>

          <div

            className={cn(

              hubDetailStyles.avatar,

              "bg-primary/15 text-primary",

            )}

            aria-hidden

          >

            <Building2 className="h-7 w-7" />

          </div>

          <div className="min-w-0 flex-1">

            <p className="text-dlc-label-md font-medium text-muted-foreground">

              Business entity

            </p>

            <h2 className="mt-1 truncate text-dlc-headline-sm font-semibold text-foreground">

              {displayName}

            </h2>

            {client.entityType ? (

              <div className="mt-3">

                <Badge variant="secondary">

                  {clientEntityTypeLabel(client.entityType)}

                </Badge>

              </div>

            ) : null}

          </div>

        </div>

        <div className="mt-6 flex flex-wrap gap-2">

          <Link

            href={pipelineClientWorkspaceHref(String(entityId))}

            className="inline-flex h-8 items-center gap-1.5 rounded-dlc-sm px-3 text-dlc-label-md font-medium text-foreground transition-colors duration-dlc-short hover:bg-muted/60"

          >

            Open workspace

            <ExternalLink className="h-3.5 w-3.5" aria-hidden />

          </Link>

        </div>

        {resolveEntityWebsites(client).length > 0 ? (

          <div className="mt-4">

            <p className={hubDetailStyles.sectionTitle}>Websites</p>

            <EntityWebsitesList

              className="mt-2"

              websites={client.websites}

              variant="chips"

            />

          </div>

        ) : null}

      </div>



      {(client.primaryContactName?.trim() ||

        client.primaryContactEmail?.trim() ||

        client.primaryContactPhone?.trim()) && (

        <div className="space-y-3">

          <p className={hubDetailStyles.sectionTitle}>Primary contact</p>

          <div className={hubDetailStyles.contactChipRow}>

          {client.primaryContactName?.trim() ? (

            <div className={hubDetailStyles.contactChip}>

              <UserCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />

              <div className="min-w-0">

                <p className={hubDetailStyles.label}>Name</p>

                <p className={hubDetailStyles.value}>

                  {client.primaryContactName.trim()}

                </p>

              </div>

            </div>

          ) : null}

          {client.primaryContactEmail?.trim() ? (

            <a

              href={`mailto:${client.primaryContactEmail.trim()}`}

              className={hubDetailStyles.contactChip}

            >

              <Mail className="h-5 w-5 shrink-0 text-primary" aria-hidden />

              <div className="min-w-0">

                <p className={hubDetailStyles.label}>Email</p>

                <p className={cn(hubDetailStyles.value, "truncate")}>

                  {client.primaryContactEmail.trim()}

                </p>

              </div>

            </a>

          ) : null}

          {client.primaryContactPhone?.trim() ? (

            <a

              href={`tel:${client.primaryContactPhone.trim()}`}

              className={hubDetailStyles.contactChip}

            >

              <Phone className="h-5 w-5 shrink-0 text-primary" aria-hidden />

              <div className="min-w-0">

                <p className={hubDetailStyles.label}>Phone</p>

                <p className={hubDetailStyles.value}>

                  {client.primaryContactPhone.trim()}

                </p>

              </div>

            </a>

          ) : null}

          </div>

        </div>

      )}



      <div className={hubDetailStyles.identityCard}>

        <p className={hubDetailStyles.sectionTitle}>Corporate snapshot</p>

        <dl className="mt-4 grid gap-4 sm:grid-cols-3">

          <div>

            <dt className={hubDetailStyles.label}>EIN</dt>

            <dd className={cn(hubDetailStyles.value, "mt-0.5")}>

              {client.ein?.trim() || "—"}

            </dd>

          </div>

          <div>

            <dt className={hubDetailStyles.label}>State of incorporation</dt>

            <dd className={cn(hubDetailStyles.value, "mt-0.5")}>

              {client.stateOfIncorporation?.trim() || "—"}

            </dd>

          </div>

          <div>

            <dt className={hubDetailStyles.label}>Date of formation</dt>

            <dd className={cn(hubDetailStyles.value, "mt-0.5")}>

              {formatEntityFormationDate(client.dateOfFormation) || "—"}

            </dd>

          </div>

        </dl>

      </div>

    </>

  );



  const kycTab = (

    <div className="space-y-6">

      <div className="flex flex-wrap gap-2">

        <Button type="button" variant="outline" onClick={() => setMergeOpen(true)}>

          Merge record

        </Button>

      </div>

      <EntityKycPanel

      organizationId={organizationId}

      memberUserKey={memberUserKey}

      entityId={entityId}

      client={client}

      canEdit={canEdit}

    />

      <EntityWebsitesPanel

        organizationId={organizationId}

        memberUserKey={memberUserKey}

        entityId={entityId}

        client={client}

        canEdit={canEdit}

      />

    </div>

  );



  const capTableTab = (

    <EntityCapTableTab

      organizationId={organizationId}

      memberUserKey={memberUserKey}

      entityId={entityId}

      rows={linkedIndividuals}

      canEdit={canEdit}

    />

  );



  const dealsTab = (

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

      <EntityDealsTab rows={entityDeals} loading={entityDeals === undefined} />

      <HierarchyActionWizard

        open={newDealOpen}

        onClose={() => setNewDealOpen(false)}

        context={{

          hubKind: "entity",

          clientId: entityId,

          clientLabel: client.displayName?.trim() || "Entity",

        }}

        organizationId={organizationId}

        memberUserKey={memberUserKey}

      />

    </>

  );



  const documentsNotesTab = (

    <ContactDocumentsNotesTab

      scope="entity"

      entityId={entityId}

      organizationId={organizationId}

      memberUserKey={memberUserKey}

      canUseHub={canUseHub}

      vaultContactId={vaultContact.contactId}

      vaultContactName={vaultContact.name}

    />

  );



  const operations = (

    <HubDetailTabs

      defaultTabId="kyc"
      scrollablePanel={false}

      tabs={[

        { id: "kyc", label: "KYC & company", content: kycTab },

        { id: "relationships", label: "Cap table", content: capTableTab },

        { id: "deals", label: "Deals", content: dealsTab },

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

    <div className={hubDetailStyles.commandCenterPage} data-testid="entity-command-center">

      {layoutMode === "commandCenter" ? (

        <div className="sticky top-0 z-50 border-b border-border/60 bg-dlc-surface/90 shadow-sm backdrop-blur-md">

          <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 md:px-5">

          <Link

            href={backHref}

            className="text-dlc-label-md font-medium text-primary hover:underline"

          >

            ← Contacts

          </Link>

          <p className="truncate border-l border-border/60 pl-3 text-base font-semibold tracking-tight text-foreground">

            {client.displayName?.trim() || "Entity"}

          </p>

          </div>

        </div>

      ) : null}

      <div className={shellClass}>

        <HubExecutiveLayout

          banner={banner}

          identity={identity}

          operations={operations}

        />

      </div>

      <MergeRecordModal

        open={mergeOpen}

        onClose={() => setMergeOpen(false)}

        recordKind="entity"

        survivingRecordId={entityId}

        organizationId={organizationId}

        memberUserKey={memberUserKey}

        recordLabel={client.displayName}

      />

    </div>

  );

}

