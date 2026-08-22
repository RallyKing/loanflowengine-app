"use client";

/**
 * Org message template library + builder.
 * Canonical home: Automations (`/automations`). Settings keeps a thin link.
 * Extends canonical `communicationTemplates` — email and SMS channels.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Archive, Mail, MessageSquare, Pencil, Plus, RotateCcw, Wand2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import {
  RecordInspectorShell,
  RecordInspectorHeader,
  RecordInspectorBody,
  RecordInspectorFooter,
} from "@/components/RecordInspectorShell";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { buildCommunicationPreview } from "@/lib/comms/templateRender";
import {
  BUILT_IN_MERGE_VARIABLES,
  normalizeCustomInputKey,
  slugifyTemplateName,
  tokenForKey,
  type CustomInputDefinition,
  type CustomInputType,
} from "@/lib/comms/mergeVariables";
import { cn } from "@/lib/cn";
import { GLOBAL_COMMUNICATION_TEMPLATE_SEEDS } from "@/lib/comms/seedTemplates";

type ChannelTab = "email" | "sms";

type EditorState = {
  templateId?: Id<"communicationTemplates">;
  name: string;
  slug: string;
  description: string;
  channel: ChannelTab;
  subjectTemplate: string;
  bodyTemplate: string;
  customInputs: CustomInputDefinition[];
  publish: boolean;
};

const EMPTY_EDITOR = (channel: ChannelTab): EditorState => ({
  name: "",
  slug: "",
  description: "",
  channel,
  subjectTemplate: channel === "email" ? "" : "",
  bodyTemplate: "",
  customInputs: [],
  publish: true,
});

function insertToken(current: string, token: string, caretHint?: number): string {
  if (caretHint != null && caretHint >= 0 && caretHint <= current.length) {
    return `${current.slice(0, caretHint)}${token}${current.slice(caretHint)}`;
  }
  return current ? `${current}${token}` : token;
}

export type MessageTemplatesManagerProps = {
  /** Initial channel when uncontrolled (default email). */
  initialChannel?: ChannelTab;
  /** Controlled channel — when set, parent owns Email/SMS selection. */
  channel?: ChannelTab;
  onChannelChange?: (channel: ChannelTab) => void;
  /** Hide internal Email/SMS tabs when the Automations hub owns section tabs. */
  hideChannelTabs?: boolean;
};

export function MessageTemplatesManager({
  initialChannel = "email",
  channel: channelProp,
  onChannelChange,
  hideChannelTabs = false,
}: MessageTemplatesManagerProps = {}) {
  const orgScope = useOrgConvexQueryArgs();
  const [channelInternal, setChannelInternal] =
    useState<ChannelTab>(initialChannel);
  const channelTab = channelProp ?? channelInternal;
  const setChannelTab = useCallback(
    (next: ChannelTab) => {
      if (channelProp === undefined) setChannelInternal(next);
      onChannelChange?.(next);
    },
    [channelProp, onChannelChange],
  );
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<EditorState>(() =>
    EMPTY_EDITOR(initialChannel),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [customOverrides, setCustomOverrides] = useState<Record<string, string>>({});
  const [bodyCaret, setBodyCaret] = useState<number | null>(null);

  const libraryArgs = useMemo(() => {
    if (!orgScope) return "skip" as const;
    return {
      organizationId: orgScope.organizationId,
      memberUserKey: orgScope.memberUserKey,
      channel: channelTab,
      includeArchived,
      limit: 80,
    };
  }, [orgScope, channelTab, includeArchived]);

  const library = useQuery(api.communications.listTemplateLibrary, libraryArgs);
  const upsertTemplate = useMutation(api.communications.upsertTemplate);
  const archiveTemplate = useMutation(api.communications.archiveTemplate);

  const sampleVariables = useMemo(() => {
    const base: Record<string, string> = {
      organizationName: "Acme Brokerage",
      fileName: "Sample Deal",
      dealName: "Sample Deal",
      stage: "Underwriting",
      status: "active",
      contactName: "Jordan Lee",
      contactPhone: "(555) 010-2000",
      contactEmail: "jordan@example.com",
      companyName: "Lee Holdings",
      lenderName: "Northwind Capital",
      lenderPhone: "(555) 010-3000",
      lenderEmail: "desk@northwind.example",
      senderName: "Your team",
      approvalSummary: "Approved with conditions.",
      fundingSummary: "Funding targeted for next week.",
      escalationReason: "Missing bank statements.",
    };
    for (const input of draft.customInputs) {
      base[input.key] =
        customOverrides[input.key] ?? input.defaultValue ?? `[${input.label}]`;
    }
    for (const [key, value] of Object.entries(customOverrides)) {
      base[key] = value;
    }
    return base;
  }, [customOverrides, draft.customInputs]);

  const livePreview = useMemo(
    () =>
      buildCommunicationPreview({
        subjectTemplate: draft.subjectTemplate,
        bodyTemplate: draft.bodyTemplate,
        variables: sampleVariables,
      }),
    [draft.bodyTemplate, draft.subjectTemplate, sampleVariables],
  );

  const openCreate = useCallback(() => {
    setDraft(EMPTY_EDITOR(channelTab));
    setCustomOverrides({});
    setErr(null);
    setEditorOpen(true);
  }, [channelTab]);

  const openEdit = useCallback(
    (row: {
      _id: Id<"communicationTemplates">;
      name: string;
      slug: string;
      description?: string;
      channel: string;
      subjectTemplate?: string;
      bodyTemplate: string;
      customInputs: CustomInputDefinition[];
      status: string;
    }) => {
      setDraft({
        templateId: row._id,
        name: row.name,
        slug: row.slug,
        description: row.description ?? "",
        channel: row.channel === "sms" ? "sms" : "email",
        subjectTemplate: row.subjectTemplate ?? "",
        bodyTemplate: row.bodyTemplate,
        customInputs: row.customInputs ?? [],
        publish: row.status !== "draft",
      });
      const overrides: Record<string, string> = {};
      for (const input of row.customInputs ?? []) {
        if (input.defaultValue) overrides[input.key] = input.defaultValue;
      }
      setCustomOverrides(overrides);
      setErr(null);
      setEditorOpen(true);
    },
    [],
  );

  const save = useCallback(
    async (publish?: boolean) => {
      if (!orgScope) return;
      if (!draft.name.trim() || !draft.bodyTemplate.trim()) {
        setErr("Name and body are required.");
        return;
      }
      setBusy(true);
      setErr(null);
      try {
        const slug = draft.slug.trim() || slugifyTemplateName(draft.name);
        await upsertTemplate({
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
          templateId: draft.templateId,
          slug,
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          channel: draft.channel,
          subjectTemplate:
            draft.channel === "email" ? draft.subjectTemplate : undefined,
          bodyTemplate: draft.bodyTemplate,
          customInputs: draft.customInputs,
          publish: publish ?? draft.publish,
        });
        setEditorOpen(false);
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Could not save template.");
      } finally {
        setBusy(false);
      }
    },
    [draft, orgScope, upsertTemplate],
  );

  const onArchive = useCallback(
    async (templateId: Id<"communicationTemplates">, archive: boolean) => {
      if (!orgScope) return;
      setBusy(true);
      try {
        await archiveTemplate({
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
          templateId,
          archive,
        });
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Archive failed.");
      } finally {
        setBusy(false);
      }
    },
    [archiveTemplate, orgScope],
  );

  const addCustomInput = useCallback(() => {
    setDraft((prev) => {
      const key = normalizeCustomInputKey(`custom_${prev.customInputs.length + 1}`);
      return {
        ...prev,
        customInputs: [
          ...prev.customInputs,
          {
            key,
            label: "Custom field",
            inputType: "text" as CustomInputType,
            defaultValue: "",
            required: false,
          },
        ],
      };
    });
  }, []);

  const seedHints = useMemo(
    () =>
      GLOBAL_COMMUNICATION_TEMPLATE_SEEDS.filter((s) => s.channel === channelTab).slice(
        0,
        4,
      ),
    [channelTab],
  );

  useEffect(() => {
    if (!editorOpen) return;
    setDraft((prev) =>
      prev.templateId
        ? prev
        : { ...prev, channel: channelTab, slug: prev.slug || slugifyTemplateName(prev.name || channelTab) },
    );
  }, [channelTab, editorOpen]);

  if (!orgScope) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Sign in with an organization to manage message templates.
      </p>
    );
  }

  const rows = library?.page ?? [];

  return (
    <div className="space-y-4" data-testid="message-templates-manager">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {hideChannelTabs ? (
          <p className="text-xs text-muted-foreground">
            {channelTab === "email" ? "Email templates" : "Text / SMS templates"}
          </p>
        ) : (
          <div className="inline-flex rounded-dlc-lg border border-border/60 bg-dlc-surface p-1">
            {(
              [
                { value: "email" as const, label: "Email", icon: Mail },
                { value: "sms" as const, label: "Text / SMS", icon: MessageSquare },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = channelTab === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-dlc-md px-3 py-2 text-xs font-medium transition-colors duration-dlc-short",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                  onClick={() => setChannelTab(tab.value)}
                  data-testid={`message-templates-tab-${tab.value}`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            Show archived
          </label>
          <Button type="button" size="sm" onClick={openCreate} data-testid="message-templates-new">
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            New template
          </Button>
        </div>
      </div>

      {seedHints.length ? (
        <p className="text-xs text-muted-foreground">
          Built-in starters (available in compose):{" "}
          {seedHints.map((s) => s.name).join(" · ")}. Save your own org templates
          below with merge variables like {"{{contactName}}"} and custom inputs.
        </p>
      ) : null}

      {err && !editorOpen ? (
        <p className="text-xs text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      <ul className="divide-y divide-border/60 overflow-hidden rounded-dlc-lg border border-border/60 bg-dlc-surface">
        {library === undefined ? (
          <li className="px-4 py-6 text-sm text-muted-foreground">Loading templates…</li>
        ) : rows.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            No {channelTab === "sms" ? "SMS" : "email"} templates yet. Create one to
            reuse when messaging contacts, lenders, and deal partners.
          </li>
        ) : (
          rows.map((row) => (
            <li
              key={row._id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
              data-testid={`message-template-row-${row.slug}`}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
                  <span className="rounded-dlc-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {row.status}
                  </span>
                  {row.customInputs.length ? (
                    <span className="text-[10px] text-muted-foreground">
                      {row.customInputs.length} custom input
                      {row.customInputs.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
                {row.description ? (
                  <p className="text-xs text-muted-foreground">{row.description}</p>
                ) : null}
                {row.channel === "email" && row.subjectTemplate ? (
                  <p className="truncate text-xs text-muted-foreground">
                    Subject: {row.subjectTemplate}
                  </p>
                ) : null}
                <p className="line-clamp-2 whitespace-pre-wrap text-xs text-foreground/80">
                  {row.bodyTemplate}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => openEdit(row)}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Edit
                </Button>
                {row.status === "archived" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void onArchive(row._id, false)}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Restore
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void onArchive(row._id, true)}
                  >
                    <Archive className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Archive
                  </Button>
                )}
              </div>
            </li>
          ))
        )}
      </ul>

      {editorOpen ? (
        <RecordInspectorShell
          ariaLabel="Message template editor"
          recordKind="automation"
          onClose={() => setEditorOpen(false)}
          resizable
        >
          <RecordInspectorHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {draft.templateId ? "Edit template" : "New template"}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Email and SMS templates with merge variables and custom inputs.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditorOpen(false)}
                aria-label="Close template editor"
              >
                Close
              </Button>
            </div>
          </RecordInspectorHeader>
          <RecordInspectorBody>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="mt-name">Name</Label>
                  <Input
                    id="mt-name"
                    value={draft.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setDraft((prev) => ({
                        ...prev,
                        name,
                        slug: prev.templateId
                          ? prev.slug
                          : slugifyTemplateName(name),
                      }));
                    }}
                    placeholder="e.g. Borrower follow-up"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mt-slug">Slug</Label>
                  <Input
                    id="mt-slug"
                    value={draft.slug}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, slug: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mt-channel">Channel</Label>
                  <select
                    id="mt-channel"
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    value={draft.channel}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        channel: e.target.value === "sms" ? "sms" : "email",
                      }))
                    }
                  >
                    <option value="email">Email</option>
                    <option value="sms">Text / SMS</option>
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="mt-desc">Description</Label>
                  <Input
                    id="mt-desc"
                    value={draft.description}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="When to use this template"
                  />
                </div>
                {draft.channel === "email" ? (
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="mt-subject">Subject</Label>
                    <Input
                      id="mt-subject"
                      value={draft.subjectTemplate}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          subjectTemplate: e.target.value,
                        }))
                      }
                      placeholder="Following up on {{dealName}}"
                    />
                  </div>
                ) : null}
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="mt-body">Body</Label>
                  <Textarea
                    id="mt-body"
                    value={draft.bodyTemplate}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, bodyTemplate: e.target.value }))
                    }
                    onSelect={(e) =>
                      setBodyCaret((e.target as HTMLTextAreaElement).selectionStart)
                    }
                    className="min-h-[160px]"
                    placeholder="Hello {{contactName}}, …"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Insert merge variable
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {BUILT_IN_MERGE_VARIABLES.map((variable) => (
                    <button
                      key={variable.key}
                      type="button"
                      title={variable.description}
                      className="rounded-dlc-full border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          bodyTemplate: insertToken(
                            prev.bodyTemplate,
                            tokenForKey(variable.key),
                            bodyCaret ?? undefined,
                          ),
                        }))
                      }
                    >
                      {variable.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 rounded-dlc-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Custom inputs</p>
                  <Button type="button" size="sm" variant="secondary" onClick={addCustomInput}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Add input
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Define fields the sender fills when applying this template (e.g.
                  meeting time, custom ask). Keys become {"{{tokens}}"}.
                </p>
                {draft.customInputs.map((input, index) => (
                  <div
                    key={`${input.key}-${index}`}
                    className="grid gap-2 rounded-dlc-md border border-border/50 bg-background/80 p-2 sm:grid-cols-2"
                  >
                    <Input
                      value={input.label}
                      onChange={(e) =>
                        setDraft((prev) => {
                          const next = [...prev.customInputs];
                          const row = next[index];
                          if (!row) return prev;
                          next[index] = { ...row, label: e.target.value };
                          return { ...prev, customInputs: next };
                        })
                      }
                      placeholder="Label"
                    />
                    <Input
                      value={input.key}
                      onChange={(e) =>
                        setDraft((prev) => {
                          const next = [...prev.customInputs];
                          const row = next[index];
                          if (!row) return prev;
                          next[index] = {
                            ...row,
                            key: normalizeCustomInputKey(e.target.value),
                          };
                          return { ...prev, customInputs: next };
                        })
                      }
                      placeholder="key"
                    />
                    <select
                      className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                      value={input.inputType}
                      onChange={(e) =>
                        setDraft((prev) => {
                          const next = [...prev.customInputs];
                          const row = next[index];
                          if (!row) return prev;
                          next[index] = {
                            ...row,
                            inputType: e.target.value as CustomInputType,
                          };
                          return { ...prev, customInputs: next };
                        })
                      }
                    >
                      <option value="text">Text</option>
                      <option value="textarea">Long text</option>
                      <option value="number">Number</option>
                      <option value="phone">Phone</option>
                      <option value="email">Email</option>
                    </select>
                    <Input
                      value={input.defaultValue ?? ""}
                      onChange={(e) =>
                        setDraft((prev) => {
                          const next = [...prev.customInputs];
                          const row = next[index];
                          if (!row) return prev;
                          next[index] = { ...row, defaultValue: e.target.value };
                          return { ...prev, customInputs: next };
                        })
                      }
                      placeholder="Default value"
                    />
                    <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                      <button
                        type="button"
                        className="rounded-dlc-full border border-border/60 px-2 py-1 text-[11px]"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            bodyTemplate: insertToken(
                              prev.bodyTemplate,
                              tokenForKey(input.key),
                              bodyCaret ?? undefined,
                            ),
                          }))
                        }
                      >
                        Insert {tokenForKey(input.key)}
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            customInputs: prev.customInputs.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {draft.customInputs.length ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Preview sample values
                  </p>
                  {draft.customInputs.map((input) => (
                    <div key={input.key} className="space-y-1">
                      <Label htmlFor={`preview-${input.key}`}>{input.label}</Label>
                      <Input
                        id={`preview-${input.key}`}
                        value={customOverrides[input.key] ?? input.defaultValue ?? ""}
                        onChange={(e) =>
                          setCustomOverrides((prev) => ({
                            ...prev,
                            [input.key]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="rounded-dlc-lg border border-border/60 bg-dlc-surface-high p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Wand2 className="h-3.5 w-3.5" aria-hidden />
                  Resolved preview
                </div>
                {draft.channel === "email" && livePreview.subject ? (
                  <p className="mb-2 text-sm font-semibold">{livePreview.subject}</p>
                ) : null}
                <pre className="whitespace-pre-wrap text-sm text-foreground">
                  {livePreview.bodyText || "—"}
                </pre>
              </div>

              {err ? (
                <p className="text-xs text-destructive" role="alert">
                  {err}
                </p>
              ) : null}
            </div>
          </RecordInspectorBody>
          <RecordInspectorFooter>
            <div className="flex flex-wrap justify-end gap-2 p-3">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void save(false)}
              >
                Save draft
              </Button>
              <Button type="button" disabled={busy} onClick={() => void save(true)}>
                {busy ? "Saving…" : "Save & publish"}
              </Button>
            </div>
          </RecordInspectorFooter>
        </RecordInspectorShell>
      ) : null}
    </div>
  );
}
