"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Building2, ChevronRight, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { pipelineDealEditorHref } from "@/lib/pipeline/routes";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";

const DEFAULT_STATUS = "confirm_interest";
const STEPS = ["Client", "Project", "File"] as const;

export type HierarchyActionWizardEntityOption = {
  clientId: Id<"clients">;
  label: string;
};

export type HierarchyActionWizardContext =
  | {
      hubKind: "entity";
      clientId: Id<"clients">;
      clientLabel: string;
    }
  | {
      hubKind: "individual";
      contactId: Id<"contacts">;
      contactLabel: string;
      entityOptions: HierarchyActionWizardEntityOption[];
      /** Preferred workspace client when contact has a primary entity link. */
      preferredClientId?: Id<"clients">;
      preferredClientLabel?: string;
    };

export type HierarchyActionWizardProps = {
  open: boolean;
  onClose: () => void;
  context: HierarchyActionWizardContext;
  organizationId: Id<"organizations">;
  memberUserKey: string;
};

type ProjectChoice = "existing" | "new";

function parseNum(s: string): number {
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

export function HierarchyActionWizard({
  open,
  onClose,
  context,
  organizationId,
  memberUserKey,
}: HierarchyActionWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pickedClientId, setPickedClientId] = useState<Id<"clients"> | "">("");
  const [projectChoice, setProjectChoice] = useState<ProjectChoice>("existing");
  const [projectId, setProjectId] = useState<Id<"projects"> | "">("");
  const [projectTitle, setProjectTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [fundingAmount, setFundingAmount] = useState("");
  const [rate, setRate] = useState("");
  const [term, setTerm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockedClient = useMemo((): {
    clientId: Id<"clients"> | "";
    label: string;
    needsPick: boolean;
    missingEntity?: boolean;
  } => {
    if (context.hubKind === "entity") {
      return {
        clientId: context.clientId,
        label: context.clientLabel,
        needsPick: false,
      };
    }
    if (context.preferredClientId) {
      return {
        clientId: context.preferredClientId,
        label: context.preferredClientLabel?.trim() || "Linked entity",
        needsPick: false,
      };
    }
    if (context.entityOptions.length === 1) {
      return {
        clientId: context.entityOptions[0]!.clientId,
        label: context.entityOptions[0]!.label,
        needsPick: false,
      };
    }
    if (context.entityOptions.length > 1) {
      const selected =
        context.entityOptions.find((o) => String(o.clientId) === String(pickedClientId)) ??
        null;
      return {
        clientId: selected?.clientId ?? ("" as const),
        label: selected?.label ?? "",
        needsPick: true,
      };
    }
    return {
      clientId: "" as Id<"clients"> | "",
      label: context.contactLabel,
      needsPick: false,
      missingEntity: true,
    };
  }, [context, pickedClientId]);

  const effectiveClientId = lockedClient.clientId;

  const projects = useQuery(
    api.pipelineHierarchyQueries.listProjectsForClient,
    open && effectiveClientId && step >= 1
      ? {
          organizationId,
          clientId: effectiveClientId,
          memberUserKey,
        }
      : "skip",
  );

  const createProject = useMutation(
    api.pipelineHierarchyMutations.createProjectUnderClient,
  );
  const createLoan = useMutation(
    api.pipelineHierarchyMutations.createLoanFileUnderProject,
  );

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setPickedClientId(
      context.hubKind === "individual" && context.preferredClientId
        ? context.preferredClientId
        : context.hubKind === "individual" && context.entityOptions.length === 1
          ? context.entityOptions[0]!.clientId
          : "",
    );
    setProjectChoice("existing");
    setProjectId("");
    setProjectTitle("");
    setFileName("");
    setFundingAmount("");
    setRate("");
    setTerm("");
    setError(null);
  }, [open, context]);

  useEffect(() => {
    if (!open || projectChoice !== "existing") return;
    const rows = projects ?? [];
    if (rows.length > 0 && !projectId) {
      setProjectId(rows[0]!._id);
    }
    if (rows.length === 0) {
      setProjectChoice("new");
    }
  }, [open, projectChoice, projects, projectId]);

  function validateStep(current: number): string | null {
    if (current === 0) {
      if (lockedClient.missingEntity) {
        return "Link this contact to a business entity in Relationships before creating a deal.";
      }
      if (lockedClient.needsPick && !effectiveClientId) {
        return "Select the entity this deal belongs to.";
      }
      return null;
    }
    if (current === 1) {
      if (projectChoice === "existing") {
        if (!projectId) return "Select an existing project or create a new one.";
      } else if (!projectTitle.trim()) {
        return "Enter a title for the new project.";
      }
      return null;
    }
    return null;
  }

  function goNext() {
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const stepError = validateStep(1);
    if (stepError) {
      setError(stepError);
      setStep(1);
      return;
    }
    if (!effectiveClientId) {
      setError("Client context is missing.");
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

    const shell = {
      fileName:
        fileName.trim() ||
        `${lockedClient.label || "Client"} – ${projectChoice === "new" ? projectTitle.trim() || "Project" : (projects ?? []).find((p) => String(p._id) === String(projectId))?.title || "Project"}`,
      status: DEFAULT_STATUS,
      fundingAmount: loan,
      rate: r,
      term: term.trim(),
      lenders: [] as Id<"lenders">[],
      contacts: [],
      organizationId,
      memberUserKey,
    };

    setSubmitting(true);
    try {
      let fileId: Id<"pipeline">;
      if (projectChoice === "new") {
        const res = await createProject({
          ...shell,
          clientId: effectiveClientId,
          projectTitle: projectTitle.trim(),
        });
        fileId = res.fileId;
      } else {
        const res = await createLoan({
          ...shell,
          projectId: projectId as Id<"projects">,
        });
        fileId = res.fileId;
      }
      onClose();
      router.push(pipelineDealEditorHref(fileId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create deal.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const stepTitle =
    step === 0
      ? "Confirm client"
      : step === 1
        ? "Select or create project"
        : "New loan file";

  return (
    <OverlayShell
      open
      onClose={onClose}
      layer="MODAL"
      align="bottom-sheet"
      wrapPanel={false}
      data-testid="hierarchy-action-wizard"
    >
      <form
        className="relative w-full max-w-lg rounded-xl border border-border bg-dlc-surface-high p-5 shadow-dlc-3"
        onSubmit={(e) => void handleCreate(e)}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <p className="text-dlc-label-md font-medium uppercase tracking-wide text-muted-foreground">
              New deal / file
            </p>
            <h2 className="text-lg font-semibold">{stepTitle}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog">
            <X className="h-5 w-5" />
          </button>
        </div>

        <ol
          className="mb-5 flex items-center gap-1 text-dlc-label-md"
          aria-label="Wizard progress"
        >
          {STEPS.map((label, index) => (
            <li key={label} className="flex min-w-0 items-center gap-1">
              <span
                className={cn(
                  "inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 font-medium",
                  index === step
                    ? "bg-primary text-primary-foreground"
                    : index < step
                      ? "bg-muted text-foreground"
                      : "bg-muted/60 text-muted-foreground",
                )}
                aria-current={index === step ? "step" : undefined}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  "hidden truncate sm:inline",
                  index === step ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {index < STEPS.length - 1 ? (
                <ChevronRight
                  className="mx-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              ) : null}
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <div className="space-y-3">
            {context.hubKind === "individual" ? (
              <p className="text-dlc-body-sm text-muted-foreground">
                Deals are filed under a business entity workspace. This contact
                is the entry point; the client row below owns projects and loan
                files.
              </p>
            ) : null}
            {lockedClient.needsPick ? (
              <div>
                <Label htmlFor="wizard-pick-entity">Entity / client</Label>
                <select
                  id="wizard-pick-entity"
                  className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={pickedClientId}
                  onChange={(e) =>
                    setPickedClientId(e.target.value as Id<"clients"> | "")
                  }
                >
                  <option value="">Select entity…</option>
                  {context.hubKind === "individual"
                    ? context.entityOptions.map((opt) => (
                        <option key={opt.clientId} value={opt.clientId}>
                          {opt.label}
                        </option>
                      ))
                    : null}
                </select>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-dlc-lg border border-border/80 bg-muted/30 px-4 py-3">
                <Building2
                  className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-dlc-label-md font-medium text-muted-foreground">
                    {context.hubKind === "entity" ? "Entity" : "Client workspace"}
                  </p>
                  <p className="font-semibold text-foreground">
                    {lockedClient.label || "—"}
                  </p>
                  <p className="mt-1 text-dlc-body-sm text-muted-foreground">
                    Locked from this hub — change entity links in Relationships if
                    needed.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-dlc-label-md font-medium text-foreground">
                Project
              </legend>
              <label className="flex cursor-pointer items-center gap-2 rounded-dlc-md border border-border px-3 py-2.5 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
                <input
                  type="radio"
                  name="project-choice"
                  checked={projectChoice === "existing"}
                  onChange={() => setProjectChoice("existing")}
                  disabled={(projects ?? []).length === 0}
                />
                <span className="text-sm">Select an existing project</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-dlc-md border border-border px-3 py-2.5 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
                <input
                  type="radio"
                  name="project-choice"
                  checked={projectChoice === "new"}
                  onChange={() => setProjectChoice("new")}
                />
                <span className="text-sm">Create new project</span>
              </label>
            </fieldset>
            {projectChoice === "existing" ? (
              <div>
                <Label htmlFor="wizard-pick-project">Existing project</Label>
                <select
                  id="wizard-pick-project"
                  className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={projectId}
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
            ) : (
              <div>
                <Label htmlFor="wizard-new-project">New project title</Label>
                <Input
                  id="wizard-new-project"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  placeholder="e.g. Refinance Portfolio 2026"
                  autoFocus
                />
              </div>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
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
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <div>
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={goBack}>
                Back
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={goNext}>
                Continue
              </Button>
            ) : (
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create & open file"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </OverlayShell>
  );
}
