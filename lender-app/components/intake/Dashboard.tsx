"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { pipelineDealEditorHref, pipelineLicensesHref } from "@/lib/pipeline/routes";
import { Button, Field, TextInput } from "./ui/Field";
import { SearchField } from "@/components/ui/SearchField";
import { SettingsLink } from "@/components/SettingsLink";
import {
  livePhaseLabel,
  useLiveConnection,
} from "@/lib/useLiveConnection";
import { decodeFileCreationTemplateSelect } from "@/lib/pipelineFileCreationTemplateSelect";
import { PipelineFileCreationTemplateSelect } from "@/components/PipelineFileCreationTemplateSelect";
import { PlanLimitUpgradeBanner } from "@/components/PlanLimitUpgradeBanner";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";
import { layerZIndexStyle } from "@/lib/ui/layering";
import { contactMethodsCreateArgs } from "@/lib/contact/contactMethods";
import { effectiveContactRoleIdFromDoc } from "@/lib/contact/contactRoles";

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day > 1 ? "s" : ""} ago`;
  return new Date(ts).toLocaleDateString();
}

const DEFAULT_PIPELINE_STATUS = "confirm_interest";
type ContactLinkDraft = {
  key: string;
  mode: "existing" | "new";
  contactId: Id<"contacts"> | "";
  name: string;
  email: string;
  phone: string;
  role: string;
};

function newContactLinkDraft(): ContactLinkDraft {
  return {
    key: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    mode: "existing",
    contactId: "",
    name: "",
    email: "",
    phone: "",
    role: "",
  };
}

function NewIntakeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { canUseHub } = useLiveConnection();
  const { accountId: preferencesAccountId } = useUserPreferences();
  const { activeOrganizationId } = useOrgPermissions();
  const memberKey = preferencesAccountId.trim();
  const contacts = useQuery(
    api.contacts.list,
    activeOrganizationId
      ? memberKey
        ? { organizationId: activeOrganizationId, memberUserKey: memberKey }
        : "skip"
      : "skip",
  );
  const createFileWithDeal = useMutation(api.pipeline.createFileWithDeal);
  const createContact = useMutation(api.contacts.create);
  const upsertContactFileLink = useMutation(api.contactFileLinks.upsert);
  const entitlements = useQuery(
    api.organizationPlan.featureEntitlements,
    activeOrganizationId && memberKey
      ? {
          organizationId: activeOrganizationId,
          memberUserKey: memberKey,
        }
      : "skip",
  );
  const [projectName, setProjectName] = useState("");
  const [fileName, setFileName] = useState("");
  const [contactLinks, setContactLinks] = useState<ContactLinkDraft[]>([
    { ...newContactLinkDraft(), mode: "new", role: "client" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateSelect, setTemplateSelect] = useState("");

  const entitlementsPending = Boolean(
    activeOrganizationId && memberKey && entitlements === undefined,
  );

  if (!open) return null;

  async function handleCreate() {
    setError(null);
    if (!canUseHub) {
      setError("Live data is not connected yet. Wait a moment or refresh the page.");
      return;
    }
    if (!projectName.trim()) {
      setError("Project name is required.");
      return;
    }
    if (contactLinks.length === 0) {
      setError("Add at least one associated contact.");
      return;
    }
    const firstClient = contactLinks.find((c) =>
      c.role.trim().toLowerCase().includes("client")
    );
    const fallbackFirst = contactLinks[0];
    const derivedClientName = (
      firstClient?.mode === "existing"
        ? contacts?.find((x) => x._id === firstClient.contactId)?.name
        : firstClient?.name
    )?.trim() ||
      (fallbackFirst.mode === "existing"
        ? contacts?.find((x) => x._id === fallbackFirst.contactId)?.name
        : fallbackFirst.name
      )?.trim();
    if (!derivedClientName) {
      setError("At least one contact must have a name.");
      return;
    }
    if (entitlementsPending) {
      setError("Plan limits are still loading. Wait a moment and try again.");
      return;
    }
    if (activeOrganizationId && entitlements?.atPipelineFileLimit) {
      setError(
        "This team has reached its pipeline file limit. Go to Settings → Team billing to upgrade or remove a file.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const displayName =
        fileName.trim() || `${derivedClientName} – ${projectName.trim()}`;
      const tpl = decodeFileCreationTemplateSelect(templateSelect);
      const { id } = await createFileWithDeal({
        fileName: displayName,
        status: DEFAULT_PIPELINE_STATUS,
        fundingAmount: 0,
        rate: 0,
        term: "",
        propertyAddress: undefined,
        lenders: [],
        contacts: [],
        clientName: derivedClientName,
        projectName: projectName.trim(),
        preferencesAccountId: preferencesAccountId || undefined,
        ...(activeOrganizationId && memberKey
          ? { organizationId: activeOrganizationId }
          : {}),
        catalogFileTemplateId: tpl.catalogFileTemplateId,
        userPipelineFileTemplateId: tpl.userPipelineFileTemplateId,
        allowLegacyHierarchyBypass: true,
      });
      for (const row of contactLinks) {
        const role = row.role.trim();
        if (!role) throw new Error("Each associated contact needs a role.");
        let contactId: Id<"contacts">;
        if (row.mode === "existing") {
          if (!row.contactId) {
            throw new Error("Pick a contact for existing-contact rows.");
          }
          contactId = row.contactId;
        } else {
          const name = row.name.trim();
          if (!name) throw new Error("New contact name is required.");
          contactId = await createContact({
            name,
            ...contactMethodsCreateArgs({
              email: row.email,
              phone: row.phone,
            }),
            notes: undefined,
            ...(activeOrganizationId && memberKey
              ? {
                  organizationId: activeOrganizationId,
                  memberUserKey: memberKey,
                }
              : {}),
          });
        }
        const existingContact =
          row.mode === "existing"
            ? contacts?.find((c) => c._id === contactId)
            : undefined;
        await upsertContactFileLink({
          contactId,
          fileId: id,
          role,
          notes: undefined,
          ...(existingContact
            ? {
                contactRoleId: effectiveContactRoleIdFromDoc(existingContact),
              }
            : {}),
          ...(memberKey ? { memberUserKey: memberKey } : {}),
        });
      }
      router.push(pipelineDealEditorHref(id));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/20 p-4"
      style={layerZIndexStyle("MODAL")}
    >
      <div className="max-h-[min(90vh,640px)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-border bg-background p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">
          New client file
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates a pipeline file with deal details on the file (no separate
          intake row). Edit funding amount, rate, and term from the pipeline or in
          the deal editor.
        </p>
        <div className="mt-5 flex flex-col gap-4">
          {activeOrganizationId && entitlements ? (
            <p className="text-xs text-muted-foreground">
              Pipeline files:{" "}
              <span className="font-medium text-foreground">
                {entitlements.usage.pipelineFileCount}
                {entitlements.limits.maxPipelineFiles != null
                  ? ` / ${entitlements.limits.maxPipelineFiles}`
                  : " (no limit)"}
              </span>
            </p>
          ) : null}
          {activeOrganizationId && entitlements?.atPipelineFileLimit ? (
            <PlanLimitUpgradeBanner
              variant="files"
              message={
                entitlements.limits.maxPipelineFiles != null
                  ? `Using ${entitlements.usage.pipelineFileCount} of ${entitlements.limits.maxPipelineFiles} files on the ${entitlements.plan} plan.`
                  : undefined
              }
            />
          ) : null}
          <Field label="Project name *">
            <TextInput
              autoFocus
              placeholder="e.g. Cash-Out Refi 2026"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </Field>
          <Field
            label="File name"
            hint="Optional. Defaults to “Client – Project”."
          >
            <TextInput
              placeholder="Custom file name"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
            />
          </Field>
          <Field
            label="Drawer layout template"
            hint="Optional. Uses your Settings layout when unset."
          >
            <PipelineFileCreationTemplateSelect
              accountId={preferencesAccountId}
              value={templateSelect}
              onChange={setTemplateSelect}
              selectClassName="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            />
          </Field>
          <Field label="Associated contacts *" hint="Select or create contacts, then assign a role for this file.">
            <div className="space-y-2">
              {contactLinks.map((row) => (
                <div key={row.key} className="rounded-md border border-border/70 p-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <select
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                      value={row.mode}
                      onChange={(e) =>
                        setContactLinks((all) =>
                          all.map((x) =>
                            x.key === row.key
                              ? {
                                  ...x,
                                  mode: e.target.value as "existing" | "new",
                                  contactId: "",
                                }
                              : x
                          )
                        )
                      }
                    >
                      <option value="existing">Existing contact</option>
                      <option value="new">Create new contact</option>
                    </select>
                    <TextInput
                      placeholder="Role"
                      value={row.role}
                      onChange={(e) =>
                        setContactLinks((all) =>
                          all.map((x) =>
                            x.key === row.key ? { ...x, role: e.target.value } : x
                          )
                        )
                      }
                    />
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted disabled:opacity-50"
                      onClick={() =>
                        setContactLinks((all) => all.filter((x) => x.key !== row.key))
                      }
                      disabled={contactLinks.length === 1}
                    >
                      Remove
                    </button>
                  </div>
                  {row.mode === "existing" ? (
                    <select
                      className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={row.contactId}
                      onChange={(e) =>
                        setContactLinks((all) =>
                          all.map((x) =>
                            x.key === row.key
                              ? { ...x, contactId: e.target.value as Id<"contacts"> | "" }
                              : x
                          )
                        )
                      }
                    >
                      <option value="">Select contact…</option>
                      {(contacts ?? []).map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <TextInput
                        placeholder="Name"
                        value={row.name}
                        onChange={(e) =>
                          setContactLinks((all) =>
                            all.map((x) =>
                              x.key === row.key ? { ...x, name: e.target.value } : x
                            )
                          )
                        }
                      />
                      <TextInput
                        placeholder="Email"
                        value={row.email}
                        onChange={(e) =>
                          setContactLinks((all) =>
                            all.map((x) =>
                              x.key === row.key ? { ...x, email: e.target.value } : x
                            )
                          )
                        }
                      />
                      <TextInput
                        placeholder="Phone"
                        value={row.phone}
                        onChange={(e) =>
                          setContactLinks((all) =>
                            all.map((x) =>
                              x.key === row.key ? { ...x, phone: e.target.value } : x
                            )
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setContactLinks((all) => [...all, newContactLinkDraft()])
                }
              >
                + Add contact
              </Button>
            </div>
          </Field>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              submitting ||
              !canUseHub ||
              entitlementsPending ||
              Boolean(activeOrganizationId && entitlements?.atPipelineFileLimit)
            }
          >
            {submitting ? "Creating…" : "Create & open"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const SheetCard = memo(function SheetCard({
  id,
  clientName,
  projectName,
  fileName,
  updatedAt,
  linkedPipelineId,
  onDelete,
  mutationsEnabled = true,
  organizationId,
  atPipelineFileLimit = false,
  pipelineFileLimitsPending = false,
}: {
  id: Id<"intakeSheets">;
  clientName: string;
  projectName: string;
  fileName?: string;
  updatedAt: number;
  linkedPipelineId: Id<"pipeline"> | null;
  onDelete: () => void;
  /** Convex hub live — offlines create-from-intake / delete until reconnected. */
  mutationsEnabled?: boolean;
  organizationId?: Id<"organizations">;
  atPipelineFileLimit?: boolean;
  /** Org context: limits query still loading — block new file from row until known. */
  pipelineFileLimitsPending?: boolean;
}) {
  const { confirm } = useOperationalConfirm();
  const router = useRouter();
  const { accountId: preferencesAccountId } = useUserPreferences();
  const createFileFromIntake = useMutation(api.pipeline.createFileFromIntakeSheet);
  const [opening, setOpening] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const openHref =
    linkedPipelineId != null ? pipelineDealEditorHref(linkedPipelineId) : null;

  async function handleOpenCard() {
    if (openHref) {
      router.push(openHref);
      return;
    }
    if (!mutationsEnabled) return;
    if (pipelineFileLimitsPending) return;
    if (atPipelineFileLimit) {
      window.alert(
        "Pipeline file limit reached for this team. Open Settings → Team billing to upgrade or free a slot.",
      );
      return;
    }
    setOpening(true);
    setCardError(null);
    try {
      const { id: newFileId } = await createFileFromIntake({
        intakeSheetId: id,
        ...(organizationId ? { organizationId } : {}),
        preferencesAccountId: preferencesAccountId || undefined,
        allowLegacyHierarchyBypass: true,
      });
      router.push(pipelineDealEditorHref(newFileId));
    } catch (e) {
      setCardError((e as Error).message);
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="group relative flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-sm transition hover:border-primary/25 hover:shadow-md sm:p-5">
      <button
        type="button"
        className="absolute inset-0 cursor-pointer rounded-xl"
        aria-label={openHref ? "Open file deal" : "Create pipeline file and open deal"}
        onClick={() => void handleOpenCard()}
        disabled={
          opening ||
          (!mutationsEnabled && !openHref) ||
          (!openHref && (atPipelineFileLimit || pipelineFileLimitsPending))
        }
        title={
          !mutationsEnabled && !openHref
            ? "Connect live data to create a pipeline file from this row."
            : pipelineFileLimitsPending && !openHref
              ? "Loading plan limits…"
              : !openHref && atPipelineFileLimit
                ? "Pipeline file limit reached — upgrade in Team billing."
                : undefined
        }
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 pr-2">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {projectName}
          </p>
          <h3 className="mt-1 break-words text-base font-semibold text-foreground">
            {clientName}
          </h3>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!mutationsEnabled) return;
            void (async () => {
              const ok = await confirm({
                ...simpleDeleteConfirm(`${clientName} – ${projectName}`, {
                  title: "Delete intake",
                  impact: "This intake sheet is permanently removed.",
                }),
              });
              if (!ok) return;
              onDelete();
            })();
          }}
          disabled={!mutationsEnabled}
          className="relative z-20 shrink-0 rounded-md p-1 text-muted-foreground opacity-100 transition hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
          title={mutationsEnabled ? "Delete" : "Connect live data to delete"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></svg>
        </button>
      </div>
      {fileName ? (
        <p className="text-sm text-muted-foreground">{fileName}</p>
      ) : null}
      {linkedPipelineId != null ? (
        <p className="relative z-10 text-xs text-muted-foreground">
          Opens in the file deal workspace
        </p>
      ) : (
        <p className="relative z-10 text-xs text-muted-foreground">
          Opens as a new pipeline file (one-time setup)
        </p>
      )}
      {linkedPipelineId == null && atPipelineFileLimit ? (
        <div className="relative z-10 mt-1">
          <PlanLimitUpgradeBanner
            variant="files"
            className="px-2.5 py-2 text-xs [&_p:first-child]:text-xs"
          />
        </div>
      ) : null}
      {cardError ? (
        <p className="relative z-10 text-sm text-destructive" role="alert">
          {cardError}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">Updated {formatRelative(updatedAt)}</p>
    </div>
  );
});

export function Dashboard() {
  const { accountId } = useUserPreferences();
  const { activeOrganizationId } = useOrgPermissions();
  const memberKey = accountId.trim();
  const orgEntitlementsArgs =
    activeOrganizationId && memberKey
      ? { organizationId: activeOrganizationId, memberUserKey: memberKey }
      : "skip";
  const sheetsQueryArgs = orgEntitlementsArgs;
  const featureEntitlements = useQuery(
    api.organizationPlan.featureEntitlements,
    orgEntitlementsArgs,
  );
  const sheets = useQuery(api.intakeSheets.listSummary, sheetsQueryArgs);
  const remove = useMutation(api.intakeSheets.remove);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const { canUseHub, phase, reconnectingDetail } = useLiveConnection();
  const atPipelineFileLimit = Boolean(featureEntitlements?.atPipelineFileLimit);
  const orgScopedForLimits = Boolean(activeOrganizationId && memberKey);
  const pipelineLimitsPending =
    orgScopedForLimits && featureEntitlements === undefined;
  const blockNewPipelineFileActions =
    pipelineLimitsPending || atPipelineFileLimit;

  const filtered = useMemo(() => {
    if (!sheets) return undefined;
    if (!search.trim()) return sheets;
    const q = search.toLowerCase();
    return sheets.filter(
      (s) =>
        s.clientName.toLowerCase().includes(q) ||
        s.projectName.toLowerCase().includes(q) ||
        (s.fileName ?? "").toLowerCase().includes(q),
    );
  }, [sheets, search]);

  const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  const hubLive = canUseHub;

  return (
    <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-6xl flex-1 flex-col gap-6 py-6 sm:gap-8 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Deal library
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Your client files
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            New work starts as a pipeline file with embedded deal data. Older rows
            without a file open into the same deal workspace automatically.
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href="/pipeline"
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-muted px-3.5 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted/80"
          >
            Pipeline
          </Link>
          <Link
            href={pipelineLicensesHref()}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            Licenses
          </Link>
          <Button
            onClick={() => setOpen(true)}
            disabled={
              !hasConvex ||
              !hubLive ||
              (orgScopedForLimits && blockNewPipelineFileActions)
            }
            title={
              orgScopedForLimits && atPipelineFileLimit
                ? "Pipeline file limit reached. Open Team billing to upgrade or remove a file."
                : orgScopedForLimits && pipelineLimitsPending
                  ? "Loading plan limits…"
                  : undefined
            }
          >
            + New file
          </Button>
          <SettingsLink
            section="accessibility"
            iconOnly
            ariaLabel="Open settings: display, motion, and focus"
          />
        </div>
      </header>

      {orgScopedForLimits && atPipelineFileLimit && featureEntitlements ? (
        <PlanLimitUpgradeBanner
          variant="files"
          message={
            featureEntitlements.limits.maxPipelineFiles != null
              ? `Using ${featureEntitlements.usage.pipelineFileCount} of ${featureEntitlements.limits.maxPipelineFiles} files on the ${featureEntitlements.plan} plan.`
              : undefined
          }
        />
      ) : null}

      {hasConvex && !hubLive ? (
        <div
          className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground"
          role="status"
        >
          <p className="font-medium">{livePhaseLabel(phase)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Deal library updates stream over a live channel. You can browse cached
            rows, but creating or deleting files waits until the connection is
            ready.
            {reconnectingDetail ? ` ${reconnectingDetail}` : ""}
          </p>
        </div>
      ) : null}

      <div className="flex min-w-0 items-center gap-3">
        <SearchField
          containerClassName="min-w-0 flex-1"
          placeholder="Search by client, project, or file name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {sheets === undefined ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span
            className="inline-block h-7 w-7 shrink-0 rounded-full border-2 border-muted-foreground/20 border-t-primary motion-safe:animate-spin"
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : filtered && filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {sheets.length === 0
              ? "No deal records in the library yet."
              : "No results match your search."}
          </p>
          {sheets.length === 0 ? (
            <Button
              className="mt-4"
              onClick={() => setOpen(true)}
              disabled={
                !hasConvex ||
                !hubLive ||
                (orgScopedForLimits && blockNewPipelineFileActions)
              }
              title={
                orgScopedForLimits && atPipelineFileLimit
                  ? "Pipeline file limit reached. Open Team billing to upgrade or remove a file."
                  : orgScopedForLimits && pipelineLimitsPending
                    ? "Loading plan limits…"
                    : undefined
              }
            >
              + Create your first file
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered!.map((s) => (
            <SheetCard
              key={s._id}
              id={s._id}
              clientName={s.clientName}
              projectName={s.projectName}
              fileName={s.fileName}
              updatedAt={s.updatedAt}
              linkedPipelineId={s.linkedPipelineId}
              mutationsEnabled={hubLive}
              organizationId={activeOrganizationId ?? undefined}
              atPipelineFileLimit={atPipelineFileLimit}
              pipelineFileLimitsPending={pipelineLimitsPending}
              onDelete={() => remove({ id: s._id })}
            />
          ))}
        </div>
      )}

      <NewIntakeDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
