"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  ClipboardCopy,
  FileText,
  Link2,
  Mail,
  Plus,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  OperationalDisclosureChevron,
  OperationalDisclosurePanel,
} from "@/components/ui/OperationalDisclosure";
import { cn } from "@/lib/cn";
import {
  BUILTIN_INTAKE_FORM_PRESETS,
  DEAL_PARTY_FIELD_GROUPS,
  type BorrowerPartyType,
} from "@/lib/intake/dealPartyFieldRegistry";
import {
  premiumCardBodyPaddingClass,
  premiumCardClassName,
  premiumCardDividerClass,
  premiumCardHeaderPaddingClass,
  premiumFieldLabelClass,
  premiumSectionStackClass,
  premiumTabStackClass,
  premiumWorkspaceCanvasClass,
} from "@/lib/pipeline/premiumWorkspaceUi";

export type FormsApplicationsTabProps = {
  fileId: Id<"pipeline">;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  readOnly?: boolean;
  className?: string;
};

function applyUrlForToken(token: string): string {
  if (typeof window === "undefined") return `/apply/${token}`;
  return `${window.location.origin}/apply/${token}`;
}

function FieldCheckRow({
  checked,
  label,
  disabled,
  onToggle,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-9 cursor-pointer items-start gap-2.5 rounded-dlc-sm px-2 py-1.5 transition-colors duration-dlc-standard hover:bg-muted/40",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
      />
      <span className="text-[13px] leading-snug text-foreground">{label}</span>
    </label>
  );
}

function FormLinksPanel({
  form,
  memberUserKey,
  readOnly,
}: {
  form: Doc<"intakeForms">;
  memberUserKey: string;
  readOnly?: boolean;
}) {
  const links = useQuery(api.intakeForms.listLinksForForm, {
    formId: form._id,
    preferencesAccountId: memberUserKey,
  });
  const generateLink = useMutation(api.intakeForms.generateLink);
  const revokeLink = useMutation(api.intakeForms.revokeLink);
  const [busy, setBusy] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState(
    "Please complete this secure intake form at your earliest convenience.",
  );

  const latestLink = links?.[0];

  const copyLink = useCallback(async (token: string) => {
    const url = applyUrlForToken(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      /* fallback */
    }
  }, []);

  const onGenerate = async () => {
    setBusy(true);
    try {
      const { token } = await generateLink({
        formId: form._id,
        preferencesAccountId: memberUserKey,
      });
      await copyLink(token);
    } finally {
      setBusy(false);
    }
  };

  const mailtoHref = useMemo(() => {
    if (!latestLink || !inviteEmail.trim()) return null;
    const url = applyUrlForToken(latestLink.token);
    const subject = encodeURIComponent(`Complete: ${form.name}`);
    const body = encodeURIComponent(
      `${inviteMessage.trim()}\n\n${url}\n\nThank you.`,
    );
    return `mailto:${inviteEmail.trim()}?subject=${subject}&body=${body}`;
  }, [form.name, inviteEmail, inviteMessage, latestLink]);

  return (
    <div className="space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="min-h-9 gap-1.5"
          disabled={readOnly || busy}
          onClick={() => void onGenerate()}
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          Generate link
        </Button>
        {latestLink ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-9 gap-1.5"
            onClick={() => void copyLink(latestLink.token)}
          >
            {copiedToken === latestLink.token ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
            )}
            Copy link
          </Button>
        ) : null}
      </div>

      {latestLink ? (
        <p className="break-all font-mono text-[11px] text-muted-foreground">
          {applyUrlForToken(latestLink.token)}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Generate a secure tokenized URL to share with clients or partners.
        </p>
      )}

      {links && links.length > 0 ? (
        <ul className="space-y-1">
          {links.map((link) => (
            <li
              key={link._id}
              className="flex items-center justify-between gap-2 rounded-dlc-sm border border-gray-100 px-2 py-1.5 text-xs dark:border-gray-800"
            >
              <span className="truncate text-muted-foreground">
                {link.submissionCount ?? 0} submission
                {(link.submissionCount ?? 0) === 1 ? "" : "s"}
                {link.revokedAt ? " · revoked" : ""}
              </span>
              {!link.revokedAt && !readOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 text-destructive"
                  onClick={() =>
                    void revokeLink({
                      linkId: link._id,
                      preferencesAccountId: memberUserKey,
                    })
                  }
                >
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-2 rounded-dlc-md border border-dashed border-gray-200 p-3 dark:border-gray-700">
        <p className={premiumFieldLabelClass}>Portal invite</p>
        <Input
          type="email"
          placeholder="Client email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          disabled={readOnly || !latestLink}
          className="min-h-10"
        />
        <textarea
          rows={3}
          value={inviteMessage}
          onChange={(e) => setInviteMessage(e.target.value)}
          disabled={readOnly || !latestLink}
          className="w-full rounded-dlc-md border border-input bg-background px-3 py-2 text-sm"
        />
        {mailtoHref ? (
          <a
            href={mailtoHref}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-dlc-md border border-border bg-background px-3 text-sm font-medium transition-colors duration-dlc-standard hover:bg-muted"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden />
            Open in email
          </a>
        ) : null}
      </div>
    </div>
  );
}

function FormEditor({
  form,
  memberUserKey,
  readOnly,
  onRemoved,
}: {
  form: Doc<"intakeForms">;
  memberUserKey: string;
  readOnly?: boolean;
  onRemoved: () => void;
}) {
  const updateForm = useMutation(api.intakeForms.updateForm);
  const removeForm = useMutation(api.intakeForms.removeForm);
  const [fieldKeys, setFieldKeys] = useState<Set<string>>(
    () => new Set(form.fieldKeys),
  );
  const [name, setName] = useState(form.name);
  const [partyType, setPartyType] = useState<BorrowerPartyType>(
    form.borrowerPartyType,
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(DEAL_PARTY_FIELD_GROUPS.map((g) => g.id)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleField = (key: string) => {
    setFieldKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateForm({
        formId: form._id,
        name,
        fieldKeys: [...fieldKeys],
        borrowerPartyType: partyType,
        preferencesAccountId: memberUserKey,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete form “${form.name}”?`)) return;
    await removeForm({
      formId: form._id,
      preferencesAccountId: memberUserKey,
    });
    onRemoved();
  };

  return (
    <section className={premiumCardClassName}>
      <div
        className={cn(
          premiumCardHeaderPaddingClass,
          "border-b",
          premiumCardDividerClass,
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
              className="h-9 max-w-md border-0 bg-transparent px-0 text-dlc-title-s font-semibold shadow-none focus-visible:ring-0"
              aria-label="Form name"
            />
            <p className="text-[11px] text-muted-foreground">
              {form.sourceKind === "pfs_instance"
                ? "Linked Personal Financial Statement — title stays matched to that PFS"
                : form.formType === "referral"
                  ? "Referral — creates a new lead file on submit"
                  : "File intake — hydrates this pipeline file"}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {!readOnly ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="min-h-9"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-9 text-destructive"
                  onClick={() => void remove()}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {error ? (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className={cn(premiumCardBodyPaddingClass, "space-y-4")}>
        <div>
          <p className={cn(premiumFieldLabelClass, "mb-2")}>Borrower type</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["individual", "Individual"],
                ["entity", "Entity"],
                ["either", "Client chooses"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={readOnly}
                onClick={() => setPartyType(value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-dlc-standard",
                  partyType === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={cn(premiumFieldLabelClass, "mb-1")}>Requested fields</p>
          <div className="space-y-1">
            {DEAL_PARTY_FIELD_GROUPS.map((group) => {
              const open = expandedGroups.has(group.id);
              const selected = group.fields.filter((f) =>
                fieldKeys.has(f.registryKey),
              ).length;
              return (
                <div
                  key={group.id}
                  className="overflow-hidden rounded-dlc-md border border-gray-100 dark:border-gray-800"
                >
                  <button
                    type="button"
                    className="flex min-h-9 w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/30"
                    onClick={() =>
                      setExpandedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.id)) next.delete(group.id);
                        else next.add(group.id);
                        return next;
                      })
                    }
                    aria-expanded={open}
                  >
                    <OperationalDisclosureChevron expanded={open} axis="right" />
                    <span className="flex-1 text-xs font-semibold text-foreground">
                      {group.label}
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {selected}/{group.fields.length}
                    </span>
                  </button>
                  <OperationalDisclosurePanel open={open}>
                    <div className="border-t border-gray-100 px-1 py-1 dark:border-gray-800">
                      {group.fields.map((field) => (
                        <FieldCheckRow
                          key={field.registryKey}
                          label={field.label}
                          checked={fieldKeys.has(field.registryKey)}
                          disabled={readOnly}
                          onToggle={() => toggleField(field.registryKey)}
                        />
                      ))}
                    </div>
                  </OperationalDisclosurePanel>
                </div>
              );
            })}
          </div>
        </div>

        <FormLinksPanel
          form={form}
          memberUserKey={memberUserKey}
          readOnly={readOnly}
        />
      </div>
    </section>
  );
}

export function FormsApplicationsTab({
  fileId,
  organizationId,
  memberUserKey,
  readOnly = false,
  className,
}: FormsApplicationsTabProps) {
  const forms = useQuery(api.intakeForms.listForFile, {
    fileId,
    preferencesAccountId: memberUserKey,
  });
  const createForm = useMutation(api.intakeForms.createForm);
  const ensurePfsAssociations = useMutation(
    api.documentVaultFileTasks.ensurePfsInstanceAssociations,
  );
  const [selectedFormId, setSelectedFormId] = useState<Id<"intakeForms"> | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeFormId = selectedFormId ?? forms?.[0]?._id ?? null;
  const activeForm = forms?.find((f) => f._id === activeFormId) ?? null;

  const onCreatePreset = async (
    preset: (typeof BUILTIN_INTAKE_FORM_PRESETS)[number],
  ) => {
    setCreating(true);
    setError(null);
    try {
      const { id } = await createForm({
        organizationId,
        fileId,
        formType: preset.formType,
        name: preset.label,
        fieldKeys: [...preset.fieldKeys],
        borrowerPartyType: preset.borrowerPartyType,
        preferencesAccountId: memberUserKey,
      });
      setSelectedFormId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const onCreateCustom = async () => {
    setCreating(true);
    setError(null);
    try {
      const { id } = await createForm({
        organizationId,
        fileId,
        formType: "file_intake",
        name: "Custom intake form",
        fieldKeys: ["borrower_first_name", "borrower_last_name", "borrower_email"],
        borrowerPartyType: "individual",
        preferencesAccountId: memberUserKey,
      });
      setSelectedFormId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const onCreatePfsForm = async () => {
    setCreating(true);
    setError(null);
    try {
      const result = await ensurePfsAssociations({
        pipelineFileId: fileId,
        memberUserKey,
        createInstance: true,
      });
      const createdFormId = result.linked.find(
        (row) => row.pfsInstanceId === result.createdInstanceId,
      )?.intakeFormId;
      if (createdFormId) {
        setSelectedFormId(createdFormId as Id<"intakeForms">);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className={cn(premiumTabStackClass, premiumWorkspaceCanvasClass, className)}
      data-testid="pipeline-forms-applications-tab"
      id="pipeline-forms-applications"
    >
      <header className="space-y-1">
        <h2 className="text-dlc-title-m font-semibold leading-dlc-title-m text-foreground">
          Forms & Applications
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Compose registry-driven intake forms, generate secure external links, and
          auto-ingest submissions into borrowers, guarantors, and entity blocks.
        </p>
      </header>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,280px)_1fr]">
        <aside className={cn(premiumCardClassName, premiumCardBodyPaddingClass)}>
          <p className={cn(premiumFieldLabelClass, "mb-2")}>Form templates</p>
          <div className={premiumSectionStackClass}>
            {BUILTIN_INTAKE_FORM_PRESETS.filter(
              (p) => p.formType === "file_intake",
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={readOnly || creating}
                onClick={() => void onCreatePreset(preset)}
                className="rounded-dlc-md border border-gray-100 p-2.5 text-left transition-colors duration-dlc-standard hover:border-primary/30 hover:bg-muted/30 dark:border-gray-800"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="text-xs font-semibold">{preset.label}</span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {preset.description}
                </p>
              </button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 w-full justify-start gap-2"
              disabled={readOnly || creating}
              onClick={() => void onCreateCustom()}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Create custom form
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 w-full justify-start gap-2"
              disabled={readOnly || creating}
              data-testid="forms-create-pfs"
              onClick={() => void onCreatePfsForm()}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New PFS form
            </Button>
          </div>

          {forms && forms.length > 0 ? (
            <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
              <p className={cn(premiumFieldLabelClass, "mb-2")}>Your forms</p>
              <ul className="space-y-1">
                {forms.map((form) => (
                  <li key={form._id}>
                    <button
                      type="button"
                      onClick={() => setSelectedFormId(form._id)}
                      className={cn(
                        "w-full rounded-dlc-sm px-2 py-1.5 text-left text-xs transition-colors duration-dlc-standard",
                        activeFormId === form._id
                          ? "bg-primary/10 font-semibold text-primary"
                          : "text-foreground hover:bg-muted/40",
                      )}
                    >
                      <span className="block truncate">{form.name}</span>
                      {form.sourceKind === "pfs_instance" ? (
                        <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Personal financial statement
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

        <div className="min-w-0">
          {activeForm ? (
            <FormEditor
              key={activeForm._id}
              form={activeForm}
              memberUserKey={memberUserKey}
              readOnly={readOnly}
              onRemoved={() => setSelectedFormId(null)}
            />
          ) : (
            <div
              className={cn(
                premiumCardClassName,
                premiumCardBodyPaddingClass,
                "text-center",
              )}
            >
              <p className="text-sm font-medium text-foreground">
                No form selected
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose a built-in template or create a custom form to configure
                fields and generate a client portal link.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
