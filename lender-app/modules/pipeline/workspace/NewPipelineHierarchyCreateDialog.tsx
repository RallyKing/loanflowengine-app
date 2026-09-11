"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Building2, Check, FileStack, Plus, Search, User, X } from "lucide-react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { pipelineDealEditorHref } from "@/lib/pipeline/routes";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import {
  listPipelineFileTemplates,
  getPipelineFileTemplate,
} from "@/lib/pipelineFileTemplates";
import type { PipelineBlockId } from "@/lib/pipelineBlockRegistry";
import {
  ALL_PIPELINE_BLOCK_IDS,
  PIPELINE_BLOCK_IDS,
} from "@/lib/pipelineBlockRegistry";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { UniversalContactModal } from "@/components/contacts/UniversalContactModal";

/** Sentinel: user has not picked a template card yet on step 3. */
const TEMPLATE_UNSELECTED = null as string | null;

const DEFAULT_STATUS = "confirm_interest";

export type HierarchyCreateMode = "full" | "project" | "loan";

export type HierarchyCreateContext = {
  mode: HierarchyCreateMode;
  /** Pre-select client when adding a project from a client row. */
  clientId?: Id<"clients">;
  /** Pre-select project when adding a loan from a project row. */
  projectId?: Id<"projects">;
  /** Stay on pipeline hub after create (no navigation to file workspace). */
  stayOnHub?: boolean;
};

export type HierarchyCreateResult = {
  mode: HierarchyCreateMode;
  clientId: Id<"clients">;
  projectId: Id<"projects">;
  fileId: Id<"pipeline">;
};

type Props = {
  open: boolean;
  context: HierarchyCreateContext;
  onClose: () => void;
  onCreated?: (result: HierarchyCreateResult) => void;
};

/** Phase Modular-E — step 1 party selection for the New File wizard. */
type SelectedParty =
  | {
      kind: "contact";
      contactId: Id<"contacts">;
      name: string;
      email?: string;
      phone?: string;
    }
  | { kind: "entity"; clientId: Id<"clients">; name: string }
  | { kind: "manual"; name: string };

type ChecklistItemPayload = {
  title: string;
  description?: string;
  folderName?: string;
};

function parseNum(s: string): number {
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

export function NewPipelineHierarchyCreateDialog({
  open,
  context,
  onClose,
  onCreated,
}: Props) {
  const { mode } = context;
  const router = useRouter();
  const {
    accountId: preferencesAccountId,
    preferences,
    updatePreferences,
  } = useUserPreferences();
  const { activeOrganizationId } = useOrgPermissions();
  const memberKey = preferencesAccountId.trim();

  const lockedClientId = context.clientId ?? "";
  const lockedProjectId = context.projectId ?? "";
  const stayOnHub = context.stayOnHub === true;

  const clients = useQuery(
    api.pipelineHierarchyQueries.listClients,
    open &&
      activeOrganizationId &&
      memberKey &&
      mode !== "full" &&
      !lockedClientId
      ? { organizationId: activeOrganizationId, memberUserKey: memberKey }
      : "skip",
  );

  const [clientId, setClientId] = useState<Id<"clients"> | "">("");
  const [projectId, setProjectId] = useState<Id<"projects"> | "">("");
  const [clientDisplayName, setClientDisplayName] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [fundingAmount, setFundingAmount] = useState("");
  const [rate, setRate] = useState("");
  const [term, setTerm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Wizard state (full mode) ---
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [partySearch, setPartySearch] = useState("");
  const [selectedParty, setSelectedParty] = useState<SelectedParty | null>(
    null,
  );
  const [contactModalOpen, setContactModalOpen] = useState(false);
  /** Existing project vs new project under the resolved client. */
  const [projectMode, setProjectMode] = useState<"existing" | "new">("new");
  const [wizardProjectId, setWizardProjectId] = useState<
    Id<"projects"> | ""
  >("");
  /**
   * Step 3 selection: `null` = not chosen yet; `""` = explicit “saved default”;
   * catalog id; or `user:<id>` for a personal template.
   */
  const [templateSel, setTemplateSel] = useState<string | null>(
    TEMPLATE_UNSELECTED,
  );
  /** Prevents Next→Create double-fire when the footer morphs on step 3. */
  const [step3CreateArmed, setStep3CreateArmed] = useState(false);
  const [showNewTemplateForm, setShowNewTemplateForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  const isWizard = mode === "full";

  const existingClientForContact = useQuery(
    api.pipelineHierarchyQueries.findClientForContact,
    open &&
      isWizard &&
      activeOrganizationId &&
      memberKey &&
      selectedParty?.kind === "contact"
      ? {
          organizationId: activeOrganizationId,
          contactId: selectedParty.contactId,
          memberUserKey: memberKey,
        }
      : "skip",
  );

  const resolvedClientId = useMemo((): Id<"clients"> | null => {
    if (!selectedParty) return null;
    if (selectedParty.kind === "entity") return selectedParty.clientId;
    if (
      selectedParty.kind === "contact" &&
      existingClientForContact?.clientId
    ) {
      return existingClientForContact.clientId;
    }
    return null;
  }, [selectedParty, existingClientForContact]);

  const resolvedClientDisplayName = useMemo(() => {
    if (!selectedParty) return "";
    if (selectedParty.kind === "entity") return selectedParty.name;
    if (existingClientForContact?.displayName) {
      return existingClientForContact.displayName;
    }
    return selectedParty.name;
  }, [selectedParty, existingClientForContact]);

  const wizardProjects = useQuery(
    api.pipelineHierarchyQueries.listProjectsForClient,
    open && isWizard && activeOrganizationId && memberKey && resolvedClientId
      ? {
          organizationId: activeOrganizationId,
          clientId: resolvedClientId,
          memberUserKey: memberKey,
        }
      : "skip",
  );

  const registryResults = useQuery(
    api.registry.list,
    open && isWizard && activeOrganizationId && memberKey
      ? {
          organizationId: activeOrganizationId,
          memberUserKey: memberKey,
          searchQuery: partySearch.trim() || undefined,
          typeFilter: ["contact", "entity"],
          limit: 12,
          sortBy: "updatedAt",
        }
      : "skip",
  );

  const userTemplates = useQuery(
    api.pipelineFileUserTemplates.listByAccountId,
    open && isWizard && memberKey ? { accountId: memberKey } : "skip",
  );

  const effectiveClientId = lockedClientId || clientId;

  const projects = useQuery(
    api.pipelineHierarchyQueries.listProjectsForClient,
    open &&
      activeOrganizationId &&
      memberKey &&
      effectiveClientId &&
      mode === "loan" &&
      !lockedProjectId
      ? {
          organizationId: activeOrganizationId,
          clientId: effectiveClientId as Id<"clients">,
          memberUserKey: memberKey,
        }
      : "skip",
  );

  const createFull = useMutation(
    api.pipelineHierarchyMutations.createClientProjectAndLoanFile,
  );
  const createProject = useMutation(
    api.pipelineHierarchyMutations.createProjectUnderClient,
  );
  const createLoan = useMutation(
    api.pipelineHierarchyMutations.createLoanFileUnderProject,
  );
  const assignBorrowerSlot = useMutation(
    api.pipelineContacts.assignContactToBorrowerSlot,
  );
  const applyPlaybook = useMutation(
    api.taskTemplateLibrary.applyTemplateGroupToFile,
  );
  const createUserTemplate = useMutation(api.pipelineFileUserTemplates.create);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setClientId(lockedClientId);
    setProjectId(lockedProjectId);
    setClientDisplayName("");
    setProjectTitle("");
    setFileName("");
    setFundingAmount("");
    setRate("");
    setTerm("");
    setStep(1);
    setPartySearch("");
    setSelectedParty(null);
    setProjectMode("new");
    setWizardProjectId("");
    setTemplateSel(TEMPLATE_UNSELECTED);
    setStep3CreateArmed(false);
    setShowNewTemplateForm(false);
    setNewTemplateName("");
    setNewTemplateDesc("");
    setContactModalOpen(false);
  }, [open, mode, lockedClientId, lockedProjectId]);

  useEffect(() => {
    if (!isWizard || step !== 3) {
      setStep3CreateArmed(false);
      return;
    }
    setStep3CreateArmed(false);
    const t = window.setTimeout(() => setStep3CreateArmed(true), 400);
    return () => window.clearTimeout(t);
  }, [isWizard, step]);

  useEffect(() => {
    if (!isWizard || step !== 2) return;
    const projects = wizardProjects ?? [];
    if (resolvedClientId && projects.length > 0) {
      setProjectMode("existing");
      setWizardProjectId((prev) => prev || projects[0]!._id);
    } else {
      setProjectMode("new");
      setWizardProjectId("");
    }
  }, [isWizard, step, resolvedClientId, wizardProjects]);

  // After inline create, resolve the real display name once the registry
  // read model catches up (the modal only returns ids).
  useEffect(() => {
    if (!selectedParty || selectedParty.kind === "manual") return;
    const match = (registryResults ?? []).find((item) =>
      selectedParty.kind === "contact"
        ? item.registryType === "contact" &&
          (item._id as Id<"contacts">) === selectedParty.contactId
        : item.registryType === "entity" &&
          (item._id as Id<"clients">) === selectedParty.clientId,
    );
    if (match && match.displayName !== selectedParty.name) {
      setSelectedParty((prev) =>
        prev && prev.kind !== "manual"
          ? {
              ...prev,
              name: match.displayName,
              ...(prev.kind === "contact"
                ? {
                    email: match.primaryEmail || undefined,
                    phone: match.primaryPhone || undefined,
                  }
                : {}),
            }
          : prev,
      );
    }
  }, [registryResults, selectedParty]);

  const title = useMemo(() => {
    switch (mode) {
      case "full":
        if (step === 1) return "New file — who is it for?";
        if (step === 2) return "New file — deal & project";
        return "New file — choose a template";
      case "project":
        return lockedClientId
          ? "New project under this client"
          : "New project under client";
      case "loan":
        return lockedProjectId
          ? "New loan file under this project"
          : "New loan under project";
    }
  }, [mode, step, lockedClientId, lockedProjectId]);

  const builtInTemplates = listPipelineFileTemplates();

  /** Resolve wizard extras from the chosen template (favorites/checklist/playbooks). */
  const resolveTemplateExtras = (): {
    catalogFileTemplateId?: string;
    userPipelineFileTemplateId?: Id<"pipelineFileUserTemplates">;
    favoriteBlockIds: PipelineBlockId[];
    pendingPortalChecklist: ChecklistItemPayload[];
    taskTemplateGroupIds: Id<"taskTemplateGroups">[];
  } => {
    if (templateSel === null || templateSel === "") {
      return {
        favoriteBlockIds: [],
        pendingPortalChecklist: [],
        taskTemplateGroupIds: [],
      };
    }
    if (templateSel.startsWith("user:")) {
      const id = templateSel.slice(5) as Id<"pipelineFileUserTemplates">;
      const row = (userTemplates ?? []).find((t) => t._id === id);
      return {
        userPipelineFileTemplateId: id,
        favoriteBlockIds: (row?.favoriteBlockIds ?? []).filter(
          (bid): bid is PipelineBlockId =>
            ALL_PIPELINE_BLOCK_IDS.has(bid as PipelineBlockId),
        ),
        pendingPortalChecklist: (row?.portalRequestChecklist ?? []).map(
          (item) => ({
            title: item.title,
            description: item.description,
            folderName: item.folderName,
          }),
        ),
        taskTemplateGroupIds: (row?.taskTemplateGroupIds ??
          []) as Id<"taskTemplateGroups">[],
      };
    }
    const tpl = getPipelineFileTemplate(templateSel);
    return {
      catalogFileTemplateId: templateSel,
      favoriteBlockIds: [...(tpl?.favoriteBlockIds ?? [])],
      pendingPortalChecklist: (tpl?.portalRequestChecklist ?? []).map(
        (item) => ({
          title: item.title,
          description: item.description,
          folderName: item.folderName,
        }),
      ),
      taskTemplateGroupIds: [],
    };
  };

  async function applyPostCreateExtras(
    fileId: Id<"pipeline">,
    extras: ReturnType<typeof resolveTemplateExtras>,
  ): Promise<void> {
    // Best-effort steps: the file exists; failures here should not block navigation.
    if (selectedParty?.kind === "contact") {
      try {
        await assignBorrowerSlot({
          fileId,
          contactId: selectedParty.contactId,
          slot: "primary",
          preferencesAccountId: memberKey,
        });
      } catch {
        // Contact link is recoverable from the Contacts block.
      }
    }
    if (activeOrganizationId) {
      for (const groupId of extras.taskTemplateGroupIds) {
        try {
          await applyPlaybook({
            organizationId: activeOrganizationId,
            memberUserKey: memberKey,
            templateGroupId: groupId,
            pipelineFileId: fileId,
          });
        } catch {
          // Playbook can be applied manually from the Tasks block.
        }
      }
    }
    if (extras.favoriteBlockIds.length > 0) {
      const merged = [
        ...preferences.favoriteFileBlocks,
        ...extras.favoriteBlockIds.filter(
          (id) => !preferences.favoriteFileBlocks.includes(id),
        ),
      ];
      if (merged.length !== preferences.favoriteFileBlocks.length) {
        try {
          await updatePreferences({ favoriteFileBlocks: merged });
        } catch {
          // Favorites can be pinned manually from the favorites bar.
        }
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!activeOrganizationId || !memberKey) {
      setError("Select an organization first.");
      return;
    }
    const loan = parseNum(fundingAmount);
    if (Number.isNaN(loan) || loan < 0) {
      setError("Enter a valid funding amount (0 or more).");
      return;
    }
    const r = rate.trim() === "" ? 0 : parseNum(rate);
    if (Number.isNaN(r) || r < 0) {
      setError("Enter a valid rate (0 or more).");
      return;
    }
    const partyName =
      mode === "full"
        ? (selectedParty?.name ?? clientDisplayName).trim()
        : clientDisplayName;
    const shell = {
      fileName:
        fileName.trim() ||
        `${partyName || "Client"} – ${projectTitle || "Project"}`,
      status: DEFAULT_STATUS,
      fundingAmount: loan,
      rate: r,
      term: term.trim(),
      lenders: [] as Id<"lenders">[],
      contacts: [],
      organizationId: activeOrganizationId,
      memberUserKey: memberKey,
    };

    setSubmitting(true);
    try {
      let fileId: Id<"pipeline">;
      let resultClientId: Id<"clients">;
      let resultProjectId: Id<"projects">;
      if (mode === "full") {
        if (!selectedParty) {
          setError("Pick a contact or entity first.");
          setStep(1);
          setSubmitting(false);
          return;
        }
        if (templateSel === null) {
          setError("Choose a template to continue.");
          setStep(3);
          setSubmitting(false);
          return;
        }
        if (projectMode === "new" && !projectTitle.trim()) {
          setError("Project title is required.");
          setStep(2);
          setSubmitting(false);
          return;
        }
        if (
          projectMode === "existing" &&
          resolvedClientId &&
          !wizardProjectId
        ) {
          setError("Select a project.");
          setStep(2);
          setSubmitting(false);
          return;
        }
        const extras = resolveTemplateExtras();
        const wizardArgs = {
          catalogFileTemplateId: extras.catalogFileTemplateId,
          userPipelineFileTemplateId: extras.userPipelineFileTemplateId,
          pendingPortalChecklist:
            extras.pendingPortalChecklist.length > 0
              ? extras.pendingPortalChecklist
              : undefined,
        };
        const existingClientId =
          selectedParty.kind === "entity"
            ? selectedParty.clientId
            : existingClientForContact?.clientId ?? undefined;
        const res = await createFull({
          ...shell,
          ...wizardArgs,
          clientDisplayName: selectedParty.name.trim(),
          primaryContactId:
            selectedParty.kind === "contact"
              ? selectedParty.contactId
              : undefined,
          existingClientId,
          primaryContactName:
            selectedParty.kind === "contact"
              ? selectedParty.name.trim()
              : undefined,
          primaryContactEmail:
            selectedParty.kind === "contact"
              ? selectedParty.email
              : undefined,
          primaryContactPhone:
            selectedParty.kind === "contact"
              ? selectedParty.phone
              : undefined,
          existingProjectId:
            projectMode === "existing" && wizardProjectId
              ? (wizardProjectId as Id<"projects">)
              : undefined,
          projectTitle:
            projectMode === "new"
              ? projectTitle.trim()
              : projectTitle.trim() || "General",
        });
        fileId = res.fileId;
        resultClientId = res.clientId;
        resultProjectId = res.projectId;
        await applyPostCreateExtras(fileId, extras);
      } else if (mode === "project") {
        const cid = (lockedClientId || clientId) as Id<"clients"> | "";
        if (!cid) {
          setError("Select a client.");
          return;
        }
        if (!projectTitle.trim()) {
          setError("Project title is required.");
          return;
        }
        const res = await createProject({
          ...shell,
          clientId: cid,
          projectTitle: projectTitle.trim(),
        });
        fileId = res.fileId;
        resultClientId = res.clientId;
        resultProjectId = res.projectId;
      } else {
        const pid = (lockedProjectId || projectId) as Id<"projects"> | "";
        if (!pid) {
          setError("Select a project.");
          return;
        }
        const res = await createLoan({
          ...shell,
          projectId: pid,
        });
        fileId = res.fileId;
        resultClientId = res.clientId;
        resultProjectId = res.projectId;
      }
      const result: HierarchyCreateResult = {
        mode,
        clientId: resultClientId,
        projectId: resultProjectId,
        fileId,
      };
      onClose();
      if (stayOnHub) {
        onCreated?.(result);
      } else {
        router.push(pipelineDealEditorHref(fileId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const wizardStepOne = (
    <div className="space-y-3">
      <div>
        <Label htmlFor="wizard-party-search">Contact or entity</Label>
        <div className="relative mt-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="wizard-party-search"
            className="pl-8"
            value={partySearch}
            onChange={(e) => setPartySearch(e.target.value)}
            placeholder="Search borrowers, sponsors, entities…"
            autoFocus
          />
        </div>
      </div>

      <ul
        className="max-h-56 space-y-1 overflow-y-auto rounded-dlc-md border border-border/60 bg-background/60 p-1"
        data-testid="wizard-party-results"
      >
        {(registryResults ?? []).map((item) => {
          const isSelected =
            (selectedParty?.kind === "contact" &&
              item.registryType === "contact" &&
              selectedParty.contactId === (item._id as Id<"contacts">)) ||
            (selectedParty?.kind === "entity" &&
              item.registryType === "entity" &&
              selectedParty.clientId === (item._id as Id<"clients">));
          return (
            <li key={`${item.registryType}:${item._id}`}>
              <button
                type="button"
                onClick={() =>
                  setSelectedParty(
                    item.registryType === "entity"
                      ? {
                          kind: "entity",
                          clientId: item._id as Id<"clients">,
                          name: item.displayName,
                        }
                      : {
                          kind: "contact",
                          contactId: item._id as Id<"contacts">,
                          name: item.displayName,
                          email: item.primaryEmail || undefined,
                          phone: item.primaryPhone || undefined,
                        },
                  )
                }
                className={cn(
                  "flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-dlc-standard",
                  isSelected
                    ? "bg-primary/10 text-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                {item.registryType === "entity" ? (
                  <Building2
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                ) : (
                  <User
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {item.displayName}
                  </span>
                  {item.primaryEmail ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.primaryEmail}
                    </span>
                  ) : null}
                </span>
                {isSelected ? (
                  <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                ) : null}
              </button>
            </li>
          );
        })}
        {registryResults !== undefined && (registryResults ?? []).length === 0 ? (
          <li className="px-2 py-3 text-center text-xs text-muted-foreground">
            No matches — create a new record or type a name below.
          </li>
        ) : null}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setContactModalOpen(true)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          New contact / entity
        </Button>
        <span className="text-xs text-muted-foreground">or</span>
        <Input
          className="h-9 flex-1 min-w-[160px]"
          value={selectedParty?.kind === "manual" ? selectedParty.name : ""}
          onChange={(e) =>
            setSelectedParty(
              e.target.value.trim()
                ? { kind: "manual", name: e.target.value }
                : null,
            )
          }
          placeholder="Just type a client name"
          aria-label="Manual client name"
        />
      </div>

      {selectedParty ? (
        <p className="text-xs text-muted-foreground" role="status">
          Selected:{" "}
          <span className="font-medium text-foreground">
            {selectedParty.name}
          </span>{" "}
          {selectedParty.kind === "entity"
            ? "(existing entity — client record reused)"
            : selectedParty.kind === "contact"
              ? existingClientForContact?.clientId
                ? "(existing client — no duplicate will be created)"
                : "(contact — will be linked as primary borrower)"
              : "(new client record)"}
        </p>
      ) : null}
    </div>
  );

  const wizardStepProject = (
    <div className="space-y-4">
      {resolvedClientId ? (
        <p className="text-xs text-muted-foreground" role="status">
          Client:{" "}
          <span className="font-medium text-foreground">
            {resolvedClientDisplayName}
          </span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground" role="status">
          A new client workspace will be created for this file.
        </p>
      )}

      {resolvedClientId && (wizardProjects ?? []).length > 0 ? (
        <fieldset className="space-y-3">
          <legend className="text-xs font-medium text-foreground">
            Project assignment
          </legend>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="wizard-project-mode"
              checked={projectMode === "existing"}
              onChange={() => setProjectMode("existing")}
            />
            Assign to an existing project
          </label>
          {projectMode === "existing" ? (
            <select
              id="wizard-existing-project"
              className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={wizardProjectId}
              onChange={(e) =>
                setWizardProjectId(e.target.value as Id<"projects"> | "")
              }
              aria-label="Existing project"
            >
              <option value="">Select project…</option>
              {(wizardProjects ?? []).map((p) => (
                <option key={p._id} value={p._id}>
                  {p.title}
                </option>
              ))}
            </select>
          ) : null}
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="wizard-project-mode"
              checked={projectMode === "new"}
              onChange={() => setProjectMode("new")}
            />
            Create a new project under this client
          </label>
          {projectMode === "new" ? (
            <div>
              <Label htmlFor="wizard-project-title-routing">Project title</Label>
              <Input
                id="wizard-project-title-routing"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder="Project title"
              />
            </div>
          ) : null}
        </fieldset>
      ) : (
        <div>
          <Label htmlFor="wizard-project-title-new">New project workspace</Label>
          <Input
            id="wizard-project-title-new"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            placeholder="Project title"
          />
          {resolvedClientId && (wizardProjects ?? []).length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              No projects yet under this client — the first one will be created
              now.
            </p>
          ) : null}
        </div>
      )}

      <div className="space-y-3 border-t border-border/60 pt-3">
        <p className="text-xs font-medium text-foreground">Deal basics</p>
        <div>
          <Label htmlFor="wizard-file-name">Loan file name</Label>
          <Input
            id="wizard-file-name"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="Optional — defaults to client – project"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="wizard-funding">Funding amount</Label>
            <Input
              id="wizard-funding"
              inputMode="decimal"
              value={fundingAmount}
              onChange={(e) => setFundingAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="wizard-rate">Rate %</Label>
            <Input
              id="wizard-rate"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="wizard-term">Term</Label>
          <Input
            id="wizard-term"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
      </div>
    </div>
  );

  async function handleCreateInlineTemplate() {
    setError(null);
    const name = newTemplateName.trim();
    if (!name) {
      setError("Template name is required.");
      return;
    }
    if (!memberKey) {
      setError("Account unavailable — cannot save a template.");
      return;
    }
    setSavingTemplate(true);
    try {
      const id = await createUserTemplate({
        accountId: memberKey,
        name,
        description: newTemplateDesc.trim() || undefined,
        includedBlocks: [...PIPELINE_BLOCK_IDS],
      });
      setTemplateSel(`user:${id}`);
      setShowNewTemplateForm(false);
      setNewTemplateName("");
      setNewTemplateDesc("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingTemplate(false);
    }
  }

  const wizardStepStrategy = (
    <div className="space-y-4" data-testid="wizard-step-template">
      <div>
        <p className="text-sm font-medium text-foreground">
          Choose how this loan file should start
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick a catalog strategy, one of your saved templates, your default
          drawer layout, or create a new template. You must select an option
          before creating the file.
        </p>
      </div>

      {/* Scroll ownership lives on the dialog body — no nested max-height here. */}
      <div
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        data-testid="wizard-template-cards"
      >
        <button
          type="button"
          onClick={() => setTemplateSel("")}
          aria-pressed={templateSel === ""}
          data-testid="wizard-template-default"
          className={cn(
            "rounded-dlc-md border px-3 py-2.5 text-left transition-colors duration-dlc-standard",
            templateSel === ""
              ? "border-primary/60 bg-primary/10"
              : "border-border/70 bg-background hover:border-primary/35",
          )}
        >
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <FileStack className="h-3.5 w-3.5 shrink-0 opacity-70" />
            Use my saved default
            {templateSel === "" ? (
              <Check className="ml-auto h-3.5 w-3.5 text-primary" />
            ) : null}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            Your account drawer layout — no catalog strategy applied.
          </span>
        </button>
        {builtInTemplates.map((t) => (
          <button
            key={t.templateId}
            type="button"
            onClick={() => setTemplateSel(t.templateId)}
            aria-pressed={templateSel === t.templateId}
            className={cn(
              "rounded-dlc-md border px-3 py-2.5 text-left transition-colors duration-dlc-standard",
              templateSel === t.templateId
                ? "border-primary/60 bg-primary/10"
                : "border-border/70 bg-background hover:border-primary/35",
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              {t.name}
              {templateSel === t.templateId ? (
                <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />
              ) : null}
            </span>
            <span className="mt-0.5 line-clamp-2 block text-[11px] text-muted-foreground">
              {t.description}
            </span>
          </button>
        ))}
        {(userTemplates ?? []).map((t) => (
          <button
            key={t._id}
            type="button"
            onClick={() => setTemplateSel(`user:${t._id}`)}
            aria-pressed={templateSel === `user:${t._id}`}
            className={cn(
              "rounded-dlc-md border px-3 py-2.5 text-left transition-colors duration-dlc-standard",
              templateSel === `user:${t._id}`
                ? "border-primary/60 bg-primary/10"
                : "border-border/70 bg-background hover:border-primary/35",
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              {t.name}
              {templateSel === `user:${t._id}` ? (
                <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />
              ) : null}
            </span>
            <span className="mt-0.5 line-clamp-2 block text-[11px] text-muted-foreground">
              {t.description || "Personal template"}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-2 border-t border-border/60 pt-3">
        {!showNewTemplateForm ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="min-h-10 justify-start gap-1.5"
              onClick={() => {
                setError(null);
                setShowNewTemplateForm(true);
              }}
              data-testid="wizard-create-template-toggle"
            >
              <Plus className="h-4 w-4" />
              Create new template
            </Button>
            <Link
              href="/settings/loan-templates"
              className="text-xs text-primary underline underline-offset-2"
              onClick={onClose}
            >
              Manage templates in Settings
            </Link>
          </div>
        ) : (
          <div
            className="space-y-3 rounded-dlc-md border border-border/70 bg-muted/10 p-3"
            data-testid="wizard-new-template-form"
          >
            <p className="text-xs font-medium text-foreground">
              New personal template
            </p>
            <p className="text-[11px] text-muted-foreground">
              Starts with the full block set. Refine blocks, favorites, and
              playbooks later in Settings.
            </p>
            <div>
              <Label htmlFor="wizard-new-template-name">Template name</Label>
              <Input
                id="wizard-new-template-name"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g. My bridge layout"
              />
            </div>
            <div>
              <Label htmlFor="wizard-new-template-desc">Description</Label>
              <Input
                id="wizard-new-template-desc"
                value={newTemplateDesc}
                onChange={(e) => setNewTemplateDesc(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={savingTemplate || !newTemplateName.trim()}
                onClick={() => void handleCreateInlineTemplate()}
                data-testid="wizard-save-new-template"
              >
                {savingTemplate ? "Saving…" : "Save & select"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={savingTemplate}
                onClick={() => {
                  setShowNewTemplateForm(false);
                  setNewTemplateName("");
                  setNewTemplateDesc("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {templateSel === null ? (
        <p className="text-xs text-muted-foreground" role="status">
          Select a template card above to enable Create.
        </p>
      ) : null}
    </div>
  );

  return (
    <>
      <OverlayShell
        open
        onClose={onClose}
        layer="MODAL"
        align="bottom-sheet"
        wrapPanel={false}
        data-testid="pipeline-hierarchy-create-dialog"
      >
        <form
          className="relative flex max-h-[min(90dvh,720px)] w-full min-h-0 max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-dlc-surface-high p-5 shadow-dlc-3"
          onSubmit={(e) => {
            if (isWizard && step !== 3) {
              e.preventDefault();
              return;
            }
            void handleSubmit(e);
          }}
        >
          <div className="mb-4 flex shrink-0 items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              {isWizard ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Step {step} of 3
                </p>
              ) : null}
            </div>
            <button type="button" onClick={onClose} aria-label="Close dialog">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-scroll-y">
            {isWizard
              ? step === 1
                ? wizardStepOne
                : step === 2
                  ? wizardStepProject
                  : wizardStepStrategy
              : null}

            {mode === "project" && !lockedClientId ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="hier-pick-client">Client</Label>
                  <select
                    id="hier-pick-client"
                    className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value as Id<"clients"> | "");
                      setProjectId("");
                    }}
                  >
                    <option value="">Select client…</option>
                    {(clients ?? []).map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="hier-new-project">New project title</Label>
                  <Input
                    id="hier-new-project"
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {mode === "project" && lockedClientId ? (
              <div>
                <Label htmlFor="hier-new-project-locked">New project title</Label>
                <Input
                  id="hier-new-project-locked"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  placeholder="Project title"
                  autoFocus
                />
              </div>
            ) : null}

            {mode === "loan" && !lockedProjectId ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="hier-pick-client-loan">Client</Label>
                  <select
                    id="hier-pick-client-loan"
                    className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value as Id<"clients"> | "");
                      setProjectId("");
                    }}
                  >
                    <option value="">Select client…</option>
                    {(clients ?? []).map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="hier-pick-project">Project</Label>
                  <select
                    id="hier-pick-project"
                    className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
                    value={projectId}
                    disabled={!effectiveClientId}
                    onChange={(e) =>
                      setProjectId(e.target.value as Id<"projects"> | "")
                    }
                  >
                    <option value="">Select project…</option>
                    {(projects ?? []).map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            {!isWizard ? (
              <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
                <div>
                  <Label htmlFor="hier-file-name">Loan file name</Label>
                  <Input
                    id="hier-file-name"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    placeholder="Optional — defaults to client – project"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="hier-funding">Funding amount</Label>
                    <Input
                      id="hier-funding"
                      inputMode="decimal"
                      value={fundingAmount}
                      onChange={(e) => setFundingAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="hier-rate">Rate %</Label>
                    <Input
                      id="hier-rate"
                      inputMode="decimal"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="hier-term">Term</Label>
                  <Input
                    id="hier-term"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="mt-5 flex shrink-0 justify-end gap-2">
            {isWizard && step > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setStep((step - 1) as 1 | 2 | 3);
                }}
              >
                Back
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}
            {isWizard && step === 1 ? (
              <Button
                type="button"
                disabled={!selectedParty}
                onClick={() => {
                  setError(null);
                  setStep(2);
                }}
                data-testid="wizard-next-step"
              >
                Next
              </Button>
            ) : isWizard && step === 2 ? (
              <Button
                type="button"
                onClick={() => {
                  setError(null);
                  if (
                    projectMode === "existing" &&
                    resolvedClientId &&
                    !wizardProjectId
                  ) {
                    setError("Select a project.");
                    return;
                  }
                  if (projectMode === "new" && !projectTitle.trim()) {
                    setError("Project title is required.");
                    return;
                  }
                  const loan = parseNum(fundingAmount);
                  if (Number.isNaN(loan) || loan < 0) {
                    setError("Enter a valid funding amount (0 or more).");
                    return;
                  }
                  const r = rate.trim() === "" ? 0 : parseNum(rate);
                  if (Number.isNaN(r) || r < 0) {
                    setError("Enter a valid rate (0 or more).");
                    return;
                  }
                  setTemplateSel(TEMPLATE_UNSELECTED);
                  setShowNewTemplateForm(false);
                  setStep(3);
                }}
                data-testid="wizard-next-step"
              >
                Next
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={
                  submitting ||
                  (isWizard &&
                    (templateSel === null || !step3CreateArmed))
                }
                data-testid="wizard-create-file"
              >
                {submitting ? "Creating…" : "Create file"}
              </Button>
            )}
          </div>
        </form>
      </OverlayShell>

      {isWizard && activeOrganizationId ? (
        <UniversalContactModal
          open={contactModalOpen}
          onClose={() => setContactModalOpen(false)}
          organizationId={activeOrganizationId}
          memberUserKey={memberKey}
          onSelectIndividual={(cid) => {
            setSelectedParty({
              kind: "contact",
              contactId: cid,
              name: partySearch.trim() || "New contact",
            });
            setContactModalOpen(false);
          }}
          onSelectEntity={(eid) => {
            setSelectedParty({
              kind: "entity",
              clientId: eid,
              name: partySearch.trim() || "New entity",
            });
            setContactModalOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
