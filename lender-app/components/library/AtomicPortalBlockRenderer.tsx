"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  DealWorkspaceEditorProvider,
  DealWorkspaceEditorStaticProvider,
  useDealWorkspaceEditorOptional,
} from "@/lib/file/useDealWorkspaceEditor";
import type { DealWorkspaceSheet } from "@/lib/file/dealSectionTypes";
import type { DealWorkspaceUpdater } from "@/lib/file/dealSectionTypes";
import { resolvePrimaryBorrowerContactId } from "@/lib/library/documentVaultHydration";
import {
  getAtomicPortalBlock,
  isAtomicPortalBlockId,
  isClientEditableAtomicBlock,
  normalizeToAtomicBlockIds,
  type AtomicPortalBlockId,
} from "@/lib/atomicPortalBlockRegistry";
import { useClientPortalBlockSessionOptional } from "@/lib/clientPortalDraftStore";
import { useLenderDeliveryBlockSessionOptional } from "@/components/library/LenderDeliveryBlockPanel";
import { contactMethodsCreateArgs } from "@/lib/contact/contactMethods";
import {
  contactRoleDisplayName,
  effectiveContactRoleIdFromDoc,
} from "@/lib/contact/contactRoles";
import { FileNotesBlock } from "@/components/pipeline/blocks/FileNotesBlock";
import { AtomicDealSectionRenderer } from "@/components/library/AtomicDealSectionRenderer";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  AtomicPipelineModuleBrokerEmbed,
  AtomicPipelineModulePortalEmbed,
} from "@/components/library/AtomicPipelineModuleEmbeds";

const DEDICATED_PIPELINE_MODULES = new Set([
  "file_details",
  "licensing",
  "lender_info",
  "fees_splits",
]);

const ConstructionBudgetBlockLazy = dynamic(
  () =>
    import("@/components/pipeline/blocks/ConstructionBudgetBlock").then((m) => ({
      default: m.ConstructionBudgetBlock,
    })),
  { loading: () => <BlockLoading /> },
);

const InvestorExperienceBlockLazy = dynamic(
  () =>
    import("@/components/pipeline/blocks/InvestorExperienceBlock").then((m) => ({
      default: m.InvestorExperienceBlock,
    })),
  { loading: () => <BlockLoading /> },
);

const PfsBlockLazy = dynamic(
  () =>
    import("@/components/pipeline/blocks/PfsBlock").then((m) => ({
      default: m.PfsBlock,
    })),
  { loading: () => <BlockLoading /> },
);

const FileContactsBlockLazy = dynamic(
  () =>
    import("@/components/pipeline/blocks/FileContactsBlock").then((m) => ({
      default: m.FileContactsBlock,
    })),
  { loading: () => <BlockLoading /> },
);

function BlockLoading() {
  return (
    <div
      className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground"
      data-testid="atomic-block-loading"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Loading…
    </div>
  );
}

export type AtomicPortalBlockRendererProps = {
  blockId: string;
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  portalMode?: boolean;
  readOnly?: boolean;
  useCollapsibleChrome?: boolean;
  defaultExpanded?: boolean;
  headerLeading?: ReactNode;
  headerRight?: ReactNode;
};

function DealSectionBody({
  blockId,
  readOnly,
  draft,
  update,
}: {
  blockId: AtomicPortalBlockId;
  readOnly: boolean;
  draft?: DealWorkspaceSheet | null;
  update?: DealWorkspaceUpdater;
}) {
  const def = getAtomicPortalBlock(blockId);
  const sectionId = def.dealSectionId ?? def.calculatorId;
  const editor = useDealWorkspaceEditorOptional();
  const resolvedDraft = draft ?? editor?.draft;
  const resolvedUpdate = update ?? editor?.update;
  if (!sectionId || !resolvedDraft || !resolvedUpdate) return <BlockLoading />;
  return (
    <AtomicDealSectionRenderer
      sectionId={sectionId}
      draft={resolvedDraft}
      update={readOnly ? () => {} : resolvedUpdate}
    />
  );
}

function PortalModuleNotesField({
  blockId,
  readOnly,
  label,
}: {
  blockId: AtomicPortalBlockId;
  readOnly: boolean;
  label: string;
}) {
  const clientSession = useClientPortalBlockSessionOptional();
  const lenderSession = useLenderDeliveryBlockSessionOptional();
  const lenderDraft = lenderSession?.draft as
    | Record<string, unknown>
    | null
    | undefined;
  const value =
    (clientSession?.moduleDrafts[blockId]?.notes as string | undefined) ??
    (clientSession?.moduleDrafts[blockId]?.clientPortalNotes as
      | string
      | undefined) ??
    (lenderDraft?.clientPortalNotes as string | undefined) ??
    (lenderDraft?.notes as string | undefined) ??
    "";

  if (
    (!clientSession || clientSession.status !== "ready") &&
    (!lenderSession || lenderSession.status !== "ready")
  ) {
    return <BlockLoading />;
  }

  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        className="min-h-[88px] w-full rounded-dlc-md border border-border/80 bg-background px-3 py-2 text-sm"
        value={value}
        readOnly={readOnly}
        data-testid={`client-portal-module-notes-${blockId}`}
        onChange={(e) => {
          if (!clientSession || clientSession.status !== "ready") return;
          clientSession.setModuleDraft(blockId, {
            notes: e.target.value,
            clientPortalNotes: e.target.value,
          });
          clientSession.scheduleAutosave(blockId);
        }}
        onBlur={() => {
          if (clientSession?.status === "ready") clientSession.flushAutosave(blockId);
        }}
      />
    </label>
  );
}

function PortalConstructionBudgetEditor({
  blockId,
  readOnly,
}: {
  blockId: AtomicPortalBlockId;
  readOnly: boolean;
}) {
  const clientSession = useClientPortalBlockSessionOptional();
  const lenderSession = useLenderDeliveryBlockSessionOptional();
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");

  if (
    (!clientSession || clientSession.status !== "ready") &&
    (!lenderSession || lenderSession.status !== "ready")
  ) {
    return <BlockLoading />;
  }

  const existing =
    clientSession?.status === "ready"
      ? clientSession.constructionBudgetLines
      : lenderSession?.constructionBudgetLines ?? [];
  const draftLines =
    (clientSession?.moduleDrafts[blockId]?.lines as
      | Array<Record<string, string>>
      | undefined) ?? [];

  const addLine = () => {
    if (!category.trim() || !clientSession || clientSession.status !== "ready") return;
    const next = [
      ...draftLines,
      {
        category: category.trim(),
        description: description.trim(),
        budgetAmount: budgetAmount.trim(),
      },
    ];
    clientSession.setModuleDraft(blockId, { lines: next });
    clientSession.scheduleAutosave(blockId);
    setCategory("");
    setDescription("");
    setBudgetAmount("");
  };

  return (
    <div className="space-y-3" data-testid={`client-portal-block-${blockId}`}>
      {readOnly && existing.length > 0
        ? existing.map((line) => (
            <p key={String(line._id)} className="text-xs text-foreground">
              {line.category}
              {line.budgetAmount ? ` · ${line.budgetAmount}` : ""}
            </p>
          ))
        : null}
      {draftLines.map((line, index) => (
        <p key={index} className="text-xs text-foreground">
          {line.category}
          {line.budgetAmount ? ` · ${line.budgetAmount}` : ""}
        </p>
      ))}
      {!readOnly && clientSession?.status === "ready" ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <Input
            placeholder="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            onBlur={() => clientSession.flushAutosave(blockId)}
            data-testid="client-portal-construction-category"
          />
          <Input
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => clientSession.flushAutosave(blockId)}
          />
          <Input
            placeholder="Budget amount"
            value={budgetAmount}
            onChange={(e) => setBudgetAmount(e.target.value)}
            onBlur={() => clientSession.flushAutosave(blockId)}
          />
          <button
            type="button"
            className="rounded-dlc-sm border border-border px-2 py-1 text-xs font-medium sm:col-span-3"
            onClick={addLine}
          >
            Add line to submission
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PortalAtomicBlockInner({
  atomicId,
  pipelineFileId,
  readOnly,
}: {
  atomicId: AtomicPortalBlockId;
  pipelineFileId: Id<"pipeline">;
  readOnly: boolean;
}) {
  const clientSession = useClientPortalBlockSessionOptional();
  const lenderSession = useLenderDeliveryBlockSessionOptional();
  const def = getAtomicPortalBlock(atomicId);

  const activeSession =
    clientSession?.status === "ready" && clientSession.draft
      ? clientSession
      : lenderSession?.status === "ready" && lenderSession.draft
        ? lenderSession
        : null;

  if (!activeSession || !activeSession.draft) {
    return <BlockLoading />;
  }

  if (!isClientEditableAtomicBlock(atomicId)) {
    if (DEDICATED_PIPELINE_MODULES.has(atomicId)) {
      return (
        <AtomicPipelineModulePortalEmbed
          atomicId={
            atomicId as "file_details" | "licensing" | "lender_info" | "fees_splits"
          }
          pipelineFileId={pipelineFileId}
          readOnly
        />
      );
    }
    return (
      <p className="text-xs text-muted-foreground" data-testid={`client-portal-block-${atomicId}`}>
        {def.label} is managed by your broker and is shown here for reference only.
      </p>
    );
  }

  const draft = activeSession.draft;
  const update: DealWorkspaceUpdater =
    clientSession?.status === "ready"
      ? (key, value) => {
          clientSession.updateSheet(key, value);
          clientSession.scheduleAutosave(atomicId);
        }
      : () => {};
  const flushOnBlur =
    clientSession?.status === "ready"
      ? () => clientSession.flushAutosave(atomicId)
      : () => {};

  if (def.kind === "dealSection" || def.kind === "calculator") {
    return (
      <div
        data-testid={`client-portal-block-${atomicId}`}
        onBlur={flushOnBlur}
      >
        <DealSectionBody
          blockId={atomicId}
          readOnly={readOnly}
          draft={draft}
          update={update}
        />
      </div>
    );
  }

  switch (atomicId) {
    case "pfs_statement":
      return (
        <div data-testid={`client-portal-block-${atomicId}`}>
          <DealWorkspaceEditorStaticProvider
            fileId={pipelineFileId}
            draft={draft}
            update={readOnly ? () => {} : update}
          >
            <PfsBlockLazy contactId={null} readOnly={readOnly} />
          </DealWorkspaceEditorStaticProvider>
        </div>
      );
    case "construction_budget":
      return (
        <PortalConstructionBudgetEditor blockId={atomicId} readOnly={readOnly} />
      );
    case "investor_experience":
    case "file_notes":
      return (
        <PortalModuleNotesField
          blockId={atomicId}
          readOnly={readOnly}
          label={
            atomicId === "investor_experience"
              ? "Describe your prior projects and experience"
              : "Notes for your broker"
          }
        />
      );
    case "file_details":
      return (
        <AtomicPipelineModulePortalEmbed
          atomicId="file_details"
          pipelineFileId={pipelineFileId}
          readOnly={readOnly}
        />
      );
    case "contacts":
      return (
        <div data-testid={`client-portal-block-${atomicId}`}>
          <DealSectionBody
            blockId="borrower_entity"
            readOnly={readOnly}
            draft={draft}
            update={update}
          />
        </div>
      );
    default:
      return (
        <PortalModuleNotesField
          blockId={atomicId}
          readOnly={readOnly}
          label={`${def.label} details`}
        />
      );
  }
}

function BrokerAtomicBlockInner({
  atomicId,
  pipelineFileId,
  memberUserKey,
  readOnly = false,
}: {
  atomicId: AtomicPortalBlockId;
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  readOnly?: boolean;
}) {
  const detail = useQuery(
    api.pipeline.getDetail,
    memberUserKey
      ? { id: pipelineFileId, memberUserKey }
      : { id: pipelineFileId },
  );
  const linksRaw = useQuery(
    api.contactFileLinks.listByFile,
    memberUserKey
      ? { fileId: pipelineFileId, memberUserKey }
      : { fileId: pipelineFileId },
  );

  const links = useMemo(() => {
    if (linksRaw === undefined) return undefined;
    if (!linksRaw.ok) return [];
    return linksRaw.links;
  }, [linksRaw]);

  const primaryBorrowerContactId = useMemo(
    () => resolvePrimaryBorrowerContactId(links),
    [links],
  );

  const def = getAtomicPortalBlock(atomicId);
  const orgId = detail?.pipeline?.organizationId;
  const existingEditor = useDealWorkspaceEditorOptional();

  if (def.kind === "dealSection" || def.kind === "calculator") {
    const body = <DealSectionBody blockId={atomicId} readOnly={readOnly} />;
    if (existingEditor) return body;
    return (
      <DealWorkspaceEditorProvider fileId={pipelineFileId}>
        {body}
      </DealWorkspaceEditorProvider>
    );
  }

  if (detail === undefined) return <BlockLoading />;

  switch (atomicId) {
    case "construction_budget":
      return (
        <ConstructionBudgetBlockLazy
          fileId={pipelineFileId}
          memberUserKey={memberUserKey}
          readOnly={readOnly}
        />
      );
    case "investor_experience":
      return (
        <InvestorExperienceBlockLazy
          contactId={primaryBorrowerContactId ?? null}
          memberUserKey={memberUserKey}
          readOnly={readOnly}
        />
      );
    case "pfs_statement":
      return existingEditor ? (
        <PfsBlockLazy
          contactId={primaryBorrowerContactId ?? null}
          memberUserKey={memberUserKey}
          readOnly={readOnly}
        />
      ) : (
        <DealWorkspaceEditorProvider fileId={pipelineFileId}>
          <PfsBlockLazy
            contactId={primaryBorrowerContactId ?? null}
            memberUserKey={memberUserKey}
            readOnly={readOnly}
          />
        </DealWorkspaceEditorProvider>
      );
    case "contacts":
      return (
        <FileContactsBlockEmbed
          pipelineFileId={pipelineFileId}
          memberUserKey={memberUserKey}
          readOnly={readOnly}
        />
      );
    case "file_notes":
      return orgId ? (
        <FileNotesBlock
          pipelineFileId={pipelineFileId}
          organizationId={orgId}
          memberUserKey={memberUserKey}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          Notes require this file to belong to an organization.
        </p>
      );
    case "file_details":
    case "licensing":
    case "lender_info":
    case "fees_splits":
      return (
        <AtomicPipelineModuleBrokerEmbed
          atomicId={atomicId}
          pipelineFileId={pipelineFileId}
          memberUserKey={memberUserKey}
          readOnly={readOnly}
        />
      );
    default:
      return (
        <p className="text-xs text-muted-foreground">
          Live editor for {def.label} opens in the pipeline workspace.
        </p>
      );
  }
}

function FileContactsBlockEmbed({
  pipelineFileId,
  memberUserKey,
  readOnly,
}: {
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  readOnly?: boolean;
}) {
  const detail = useQuery(
    api.pipeline.getDetail,
    memberUserKey
      ? { id: pipelineFileId, memberUserKey }
      : { id: pipelineFileId },
  );
  const orgId = detail?.pipeline?.organizationId;
  const orgArgs =
    orgId && memberUserKey
      ? { organizationId: orgId, memberUserKey }
      : "skip";

  const contacts = useQuery(api.contacts.list, orgArgs);
  const linksRaw = useQuery(
    api.contactFileLinks.listByFile,
    memberUserKey
      ? { fileId: pipelineFileId, memberUserKey }
      : { fileId: pipelineFileId },
  );
  const contactRoles = useQuery(api.organizationSettings.getContactRoles, orgArgs);

  const upsertLink = useMutation(api.contactFileLinks.upsert);
  const removeLink = useMutation(api.contactFileLinks.remove);
  const createContact = useMutation(api.contacts.create);
  const assignBorrower = useMutation(api.pipelineContacts.assignContactToBorrowerSlot);

  const links = useMemo(() => {
    if (linksRaw === undefined) return undefined;
    if (!linksRaw.ok) return [];
    return linksRaw.links;
  }, [linksRaw]);

  if (
    detail === undefined ||
    contacts === undefined ||
    links === undefined ||
    contactRoles === undefined
  ) {
    return <BlockLoading />;
  }

  const roles = contactRoles ?? [];
  const workspaceContactById = new Map(
    (contacts ?? []).map((c) => [String(c._id), c]),
  );

  if (readOnly) {
    return (
      <p className="text-xs text-muted-foreground">
        {links.length} linked contact{links.length === 1 ? "" : "s"}.
      </p>
    );
  }

  return (
    <FileContactsBlockLazy
      contacts={contacts ?? []}
      links={links}
      contactRoles={roles}
      legacyContactCount={detail?.pipeline?.contacts?.length ?? 0}
      onLink={async (contactId, { contactRoleId, notes }) => {
        const roleLabel =
          contactRoleDisplayName(roles, contactRoleId) ?? contactRoleId;
        await upsertLink({
          contactId,
          fileId: pipelineFileId,
          role: roleLabel,
          notes,
          contactRoleId,
          ...(memberUserKey ? { memberUserKey } : {}),
        });
      }}
      onCreateAndLink={async (args) => {
        const roleLabel =
          contactRoleDisplayName(roles, args.contactRoleId) ?? args.contactRoleId;
        const contactId = await createContact({
          name: args.name,
          ...contactMethodsCreateArgs({ email: args.email, phone: args.phone }),
          notes: args.notes,
          contactRoleId: args.contactRoleId,
          contactRoleIds: [args.contactRoleId],
          ...(orgId ? { organizationId: orgId, memberUserKey } : {}),
        });
        await upsertLink({
          contactId,
          fileId: pipelineFileId,
          role: roleLabel,
          contactRoleId: args.contactRoleId,
          ...(memberUserKey ? { memberUserKey } : {}),
        });
      }}
      onUpdateLink={async (link) => {
        const contact = workspaceContactById.get(String(link.contactId));
        const contactRoleId =
          link.contactRoleId?.trim() ??
          (contact ? effectiveContactRoleIdFromDoc(contact) : undefined);
        await upsertLink({
          contactId: link.contactId,
          fileId: pipelineFileId,
          role: link.role,
          notes: link.notes,
          contactRoleId,
          ...(memberUserKey ? { memberUserKey } : {}),
        });
      }}
      onRemoveLink={async (linkId) => {
        await removeLink({
          id: linkId,
          ...(memberUserKey ? { memberUserKey } : {}),
        });
      }}
      onAssignToBorrowerSlot={async (contactId, slot) => {
        await assignBorrower({
          fileId: pipelineFileId,
          contactId,
          slot,
          ...(memberUserKey ? { memberUserKey } : {}),
        });
      }}
    />
  );
}

export function AtomicPortalBlockRenderer({
  blockId,
  pipelineFileId,
  memberUserKey,
  portalMode = false,
  readOnly = false,
  useCollapsibleChrome = false,
  defaultExpanded = false,
  headerLeading,
  headerRight,
}: AtomicPortalBlockRendererProps) {
  const atoms = isAtomicPortalBlockId(blockId)
    ? [blockId]
    : normalizeToAtomicBlockIds(blockId, true);

  if (atoms.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Unknown block &ldquo;{blockId}&rdquo;.
      </p>
    );
  }

  const atomicId = atoms[0]!;
  const def = getAtomicPortalBlock(atomicId);
  const body = portalMode ? (
    <PortalAtomicBlockInner
      atomicId={atomicId}
      pipelineFileId={pipelineFileId}
      readOnly={readOnly}
    />
  ) : (
    <BrokerAtomicBlockInner
      atomicId={atomicId}
      pipelineFileId={pipelineFileId}
      memberUserKey={memberUserKey}
      readOnly={readOnly}
    />
  );

  if (!useCollapsibleChrome) return body;

  return (
    <CollapsibleBlock
      id={`atomic-block-${atomicId}`}
      title={def.label}
      status={def.defaultStatus}
      summary={def.defaultSummary}
      description={def.description}
      defaultOpen={defaultExpanded}
      density="compact"
      headerLeading={headerLeading}
      headerRight={headerRight}
    >
      <div
        className={readOnly ? "pointer-events-none opacity-90" : undefined}
        data-testid={`client-portal-block-shell-${atomicId}`}
      >
        {body}
      </div>
    </CollapsibleBlock>
  );
}

export function AtomicPortalBlockList({
  blockIds,
  pipelineFileId,
  memberUserKey,
  portalMode = false,
  readOnly = false,
  useCollapsibleChrome = true,
  defaultExpandedBlockId,
  renderHeaderLeading,
  renderHeaderRight,
}: {
  blockIds: string[];
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  portalMode?: boolean;
  readOnly?: boolean;
  useCollapsibleChrome?: boolean;
  defaultExpandedBlockId?: string;
  renderHeaderLeading?: (blockId: AtomicPortalBlockId, index: number) => ReactNode;
  renderHeaderRight?: (blockId: AtomicPortalBlockId, index: number) => ReactNode;
}) {
  const ordered = blockIds.flatMap((id) =>
    isAtomicPortalBlockId(id) ? [id] : normalizeToAtomicBlockIds(id, true),
  );

  if (ordered.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No blocks assigned.</p>
    );
  }

  return (
    <div
      className={cn(
        "space-y-2",
        useCollapsibleChrome ? undefined : "space-y-3",
      )}
      data-testid="atomic-portal-block-list"
    >
      {ordered.map((atomicId, index) => (
        <AtomicPortalBlockRenderer
          key={`${atomicId}-${index}`}
          blockId={atomicId}
          pipelineFileId={pipelineFileId}
          memberUserKey={memberUserKey}
          portalMode={portalMode}
          readOnly={readOnly}
          useCollapsibleChrome={useCollapsibleChrome}
          defaultExpanded={
            defaultExpandedBlockId
              ? atomicId === defaultExpandedBlockId
              : index === 0
          }
          headerLeading={renderHeaderLeading?.(atomicId, index)}
          headerRight={renderHeaderRight?.(atomicId, index)}
        />
      ))}
    </div>
  );
}
