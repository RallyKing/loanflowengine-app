"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { postFileToConvexUploadUrl } from "@/lib/uploadToConvexStorage";
import { buildCommunicationPreview } from "@/lib/comms/templateRender";
import { tokenForKey, type CustomInputDefinition } from "@/lib/comms/mergeVariables";
import { cn } from "@/lib/cn";
import { useDocumentTabVisible } from "@/lib/hooks/useDocumentTabVisible";
import { CommunicationHistoryPanel } from "@/components/communications/CommunicationHistoryPanel";
import {
  useConvexSubMountTrace,
  useConvexSubQueryArgsTrace,
} from "@/lib/convexSubDiagnosticsHooks";
import { Mail, MessageSquare, MessageSquareMore, Paperclip, Send, Wand2, X } from "lucide-react";

type Channel = "email" | "sms" | "portal";

function splitRecipients(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function toDatetimeLocalValue(at: number | null): string {
  if (!at) return "";
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

export function UnifiedCommunicationPanel(props: {
  organizationId: Id<"organizations">;
  memberUserKey?: string;
  relatedPipelineFileId?: Id<"pipeline">;
  relatedContactId?: Id<"contacts">;
  relatedLenderId?: Id<"lenders">;
  className?: string;
  /** Hide history when embedded in a surface that already shows it. */
  hideHistory?: boolean;
  defaultChannel?: Channel;
}) {
  const [channel, setChannel] = useState<Channel>(props.defaultChannel ?? "email");
  const [draftId, setDraftId] = useState<Id<"outboundMessages"> | null>(null);
  const [recipientsInput, setRecipientsInput] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "critical">("normal");
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const [testMode, setTestMode] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [activeCustomInputs, setActiveCustomInputs] = useState<CustomInputDefinition[]>([]);
  const [customOverrides, setCustomOverrides] = useState<Record<string, string>>({});
  const [showResolvedPreview, setShowResolvedPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hydratedKeyRef = useRef<string>("");
  const tabVisible = useDocumentTabVisible();

  const templateCatalogArgs = useMemo(() => {
    if (!tabVisible) return "skip" as const;
    return {
      organizationId: props.organizationId,
      memberUserKey: props.memberUserKey,
      channel,
    };
  }, [tabVisible, props.organizationId, props.memberUserKey, channel]);

  const composerContextArgs = useMemo(() => {
    if (!tabVisible) return "skip" as const;
    return {
      organizationId: props.organizationId,
      memberUserKey: props.memberUserKey,
      relatedPipelineFileId: props.relatedPipelineFileId,
      relatedContactId: props.relatedContactId,
      relatedLenderId: props.relatedLenderId,
    };
  }, [
    tabVisible,
    props.organizationId,
    props.memberUserKey,
    props.relatedPipelineFileId,
    props.relatedContactId,
    props.relatedLenderId,
  ]);

  const draftArgs = useMemo(() => {
    if (!tabVisible) return "skip" as const;
    return {
      organizationId: props.organizationId,
      memberUserKey: props.memberUserKey,
      channel,
      relatedPipelineFileId: props.relatedPipelineFileId,
      relatedContactId: props.relatedContactId,
      relatedLenderId: props.relatedLenderId,
    };
  }, [
    tabVisible,
    props.organizationId,
    props.memberUserKey,
    channel,
    props.relatedPipelineFileId,
    props.relatedContactId,
    props.relatedLenderId,
  ]);

  useConvexSubMountTrace("UnifiedCommunicationPanel");
  useConvexSubQueryArgsTrace("UnifiedCommunicationPanel:draft", draftArgs, {
    queryKey: "communications.getDraft",
    route: "communications",
  });
  const templates = useQuery(api.communications.listTemplateCatalog, templateCatalogArgs);
  const context = useQuery(api.communications.getComposerContext, composerContextArgs);
  const draft = useQuery(api.communications.getDraft, draftArgs);

  const saveDraft = useMutation(api.communications.upsertDraft);
  const queueDraft = useMutation(api.communications.queueDraft);
  const generateAttachmentUploadUrl = useMutation(api.communications.generateAttachmentUploadUrl);
  const attachUploadToMessage = useMutation(api.communications.attachUploadToMessage);
  const removeAttachment = useMutation(api.communications.removeAttachment);

  const composerScopeKey = useMemo(
    () =>
      [
        props.organizationId,
        props.relatedPipelineFileId ?? "-",
        props.relatedContactId ?? "-",
        props.relatedLenderId ?? "-",
        channel,
      ].join(":"),
    [
      channel,
      props.organizationId,
      props.relatedContactId,
      props.relatedLenderId,
      props.relatedPipelineFileId,
    ],
  );

  useEffect(() => {
    if (draft === undefined) return;
    if (hydratedKeyRef.current === composerScopeKey) return;
    hydratedKeyRef.current = composerScopeKey;
    setDraftId(draft?._id ?? null);
    setRecipientsInput(
      draft?.recipientSummary?.join(", ") ??
        (channel === "portal" ? "Portal participants" : ""),
    );
    setSubject(draft?.subject ?? "");
    setBody(draft?.bodyText ?? "");
    setPriority(draft?.priority ?? "normal");
    setTestMode(Boolean(draft?.isTestMode));
    setScheduleAt(toDatetimeLocalValue(draft?.scheduledFor ?? null));
    setSelectedTemplate("");
    setActiveCustomInputs([]);
    setCustomOverrides({});
    setErr(null);
  }, [channel, composerScopeKey, draft]);

  const mergedVariables = useMemo(() => {
    const base = { ...(context?.variables ?? {}) };
    for (const input of activeCustomInputs) {
      base[input.key] =
        customOverrides[input.key] ?? input.defaultValue ?? "";
    }
    for (const [key, value] of Object.entries(customOverrides)) {
      base[key] = value;
    }
    return base;
  }, [activeCustomInputs, context?.variables, customOverrides]);

  const resolvedPreview = useMemo(
    () =>
      buildCommunicationPreview({
        subjectTemplate: subject,
        bodyTemplate: body,
        variables: mergedVariables,
      }),
    [body, mergedVariables, subject],
  );

  const ensureDraftSaved = useCallback(async () => {
    if (!props.memberUserKey?.trim()) {
      throw new Error("Sign in to compose a message.");
    }
    const normalizedRecipients =
      channel === "portal"
        ? splitRecipients(recipientsInput).length
          ? splitRecipients(recipientsInput)
          : ["Portal participants"]
        : splitRecipients(recipientsInput);
    const result = await saveDraft({
      organizationId: props.organizationId,
      memberUserKey: props.memberUserKey,
      channel,
      relatedPipelineFileId: props.relatedPipelineFileId,
      relatedContactId: props.relatedContactId,
      relatedLenderId: props.relatedLenderId,
      subject: channel === "sms" ? undefined : subject,
      bodyText: body,
      recipientSummary: normalizedRecipients,
      priority,
      isTestMode: testMode,
    });
    setDraftId(result.outboundMessageId);
    return result.outboundMessageId;
  }, [
    body,
    channel,
    priority,
    props.memberUserKey,
    props.organizationId,
    props.relatedContactId,
    props.relatedLenderId,
    props.relatedPipelineFileId,
    recipientsInput,
    saveDraft,
    subject,
    testMode,
  ]);

  useEffect(() => {
    if (!props.memberUserKey?.trim()) return;
    if (!body.trim() && !subject.trim() && !recipientsInput.trim()) return;
    const handle = window.setTimeout(() => {
      void ensureDraftSaved().catch(() => {
        /* non-blocking autosave */
      });
    }, 700);
    return () => window.clearTimeout(handle);
  }, [ensureDraftSaved, props.memberUserKey, recipientsInput, subject, body, channel]);

  const applyResolvedToCompose = useCallback(() => {
    setSubject(resolvedPreview.subject);
    setBody(resolvedPreview.bodyText);
    setShowResolvedPreview(false);
  }, [resolvedPreview]);

  const onPickTemplate = useCallback(
    (slug: string) => {
      setSelectedTemplate(slug);
      const template = templates?.find((row) => row.slug === slug);
      if (!template || !context?.variables) {
        setActiveCustomInputs([]);
        setCustomOverrides({});
        return;
      }
      const inputs = (template.customInputs ?? []) as CustomInputDefinition[];
      setActiveCustomInputs(inputs);
      const overrides: Record<string, string> = {};
      for (const input of inputs) {
        if (input.defaultValue) overrides[input.key] = input.defaultValue;
      }
      setCustomOverrides(overrides);
      const variables = { ...context.variables, ...overrides };
      for (const input of inputs) {
        if (!(input.key in variables)) {
          variables[input.key] = input.defaultValue ?? "";
        }
      }
      const preview = buildCommunicationPreview({
        subjectTemplate: template.subjectTemplate,
        bodyTemplate: template.bodyTemplate,
        variables,
      });
      // Keep tokens in draft when custom inputs exist so user can tweak then resolve.
      if (inputs.length) {
        setSubject(template.subjectTemplate ?? "");
        setBody(template.bodyTemplate);
        setShowResolvedPreview(true);
      } else {
        setSubject(preview.subject);
        setBody(preview.bodyText);
        setShowResolvedPreview(false);
      }
      const kind = channel === "sms" ? "sms" : channel === "email" ? "email" : null;
      if (kind && !recipientsInput.trim() && context.suggestedRecipients?.length) {
        const matches = context.suggestedRecipients.filter(
          (row) => !row.kind || row.kind === kind,
        );
        if (matches.length) {
          setRecipientsInput(matches.map((row) => row.value).join(", "));
        }
      }
    },
    [channel, context?.suggestedRecipients, context?.variables, recipientsInput, templates],
  );

  const onUploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setBusy(true);
      setErr(null);
      try {
        const outboundMessageId = draftId ?? (await ensureDraftSaved());
        for (const file of Array.from(files)) {
          const uploadUrl = await generateAttachmentUploadUrl({
            organizationId: props.organizationId,
            memberUserKey: props.memberUserKey,
            outboundMessageId,
          });
          const { storageId } = await postFileToConvexUploadUrl(uploadUrl, file);
          await attachUploadToMessage({
            organizationId: props.organizationId,
            memberUserKey: props.memberUserKey,
            outboundMessageId,
            storageId: storageId as Id<"_storage">,
            fileName: file.name,
            contentType: file.type || undefined,
            size: file.size,
          });
        }
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Could not attach file.");
      } finally {
        setBusy(false);
      }
    },
    [
      attachUploadToMessage,
      draftId,
      ensureDraftSaved,
      generateAttachmentUploadUrl,
      props.memberUserKey,
      props.organizationId,
    ],
  );

  const sendNow = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      // Resolve remaining tokens before queue when custom inputs were filled.
      if (activeCustomInputs.length || /\{\{/.test(body) || /\{\{/.test(subject)) {
        setSubject(resolvedPreview.subject);
        setBody(resolvedPreview.bodyText);
      }
      const outboundMessageId = draftId ?? (await ensureDraftSaved());
      // If we just resolved, persist resolved body once more.
      if (activeCustomInputs.length || /\{\{/.test(body) || /\{\{/.test(subject)) {
        await saveDraft({
          organizationId: props.organizationId,
          memberUserKey: props.memberUserKey,
          channel,
          relatedPipelineFileId: props.relatedPipelineFileId,
          relatedContactId: props.relatedContactId,
          relatedLenderId: props.relatedLenderId,
          subject: channel === "sms" ? undefined : resolvedPreview.subject,
          bodyText: resolvedPreview.bodyText,
          recipientSummary:
            channel === "portal"
              ? splitRecipients(recipientsInput).length
                ? splitRecipients(recipientsInput)
                : ["Portal participants"]
              : splitRecipients(recipientsInput),
          priority,
          isTestMode: testMode,
        });
      }
      const scheduledFor = scheduleAt ? new Date(scheduleAt).getTime() : undefined;
      await queueDraft({
        organizationId: props.organizationId,
        memberUserKey: props.memberUserKey,
        outboundMessageId,
        scheduledFor,
      });
      setDraftId(null);
      setRecipientsInput(channel === "portal" ? "Portal participants" : "");
      setSubject("");
      setBody("");
      setScheduleAt("");
      setSelectedTemplate("");
      setActiveCustomInputs([]);
      setCustomOverrides({});
      hydratedKeyRef.current = "";
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not queue message.");
    } finally {
      setBusy(false);
    }
  }, [
    activeCustomInputs.length,
    body,
    channel,
    draftId,
    ensureDraftSaved,
    priority,
    props.memberUserKey,
    props.organizationId,
    props.relatedContactId,
    props.relatedLenderId,
    props.relatedPipelineFileId,
    queueDraft,
    recipientsInput,
    resolvedPreview.bodyText,
    resolvedPreview.subject,
    saveDraft,
    scheduleAt,
    subject,
    testMode,
  ]);

  const suggestedForChannel = useMemo(() => {
    const kind = channel === "sms" ? "sms" : channel === "email" ? "email" : null;
    if (!kind || !context?.suggestedRecipients) return [];
    return context.suggestedRecipients.filter((row) => !row.kind || row.kind === kind);
  }, [channel, context?.suggestedRecipients]);

  const channelLabel =
    channel === "email" ? "email" : channel === "sms" ? "text" : "portal update";

  return (
    <div className={cn("space-y-4", props.className)} data-testid="unified-communications-panel">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Outbound communications</div>
            <p className="text-xs text-muted-foreground">
              Compose with templates, merge variables, draft autosave, and unified
              history.{" "}
              <Link
                href="/automations"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Manage templates
              </Link>
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-border/60 bg-background p-1">
            {(
              [
                { value: "email" as const, label: "Email", icon: Mail },
                { value: "sms" as const, label: "Text", icon: MessageSquare },
                { value: "portal" as const, label: "Portal", icon: MessageSquareMore },
              ] as const
            ).map((option) => {
              const Icon = option.icon;
              const active = channel === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                  onClick={() => setChannel(option.value)}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {channel === "sms" ? (
          <p className="mt-2 text-[11px] text-muted-foreground" role="status">
            SMS delivery uses the org SMS provider when configured; otherwise messages
            are queued through the stub adapter for history and testing.
          </p>
        ) : null}

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <label
                  htmlFor="communications-recipients"
                  className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
                >
                  Recipients
                </label>
                <Input
                  id="communications-recipients"
                  value={recipientsInput}
                  onChange={(event) => setRecipientsInput(event.target.value)}
                  placeholder={
                    channel === "email"
                      ? "email@example.com, teammate@example.com"
                      : channel === "sms"
                        ? "+1 555 010 2000, +1 555 010 3000"
                        : "Portal participants"
                  }
                  className="text-xs"
                />
                {suggestedForChannel.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedForChannel.slice(0, 6).map((recipient) => (
                      <button
                        key={`${recipient.value}-${recipient.contactId ?? ""}-${recipient.kind ?? ""}`}
                        type="button"
                        className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                        onClick={() =>
                          setRecipientsInput((current) =>
                            current.trim()
                              ? `${current}, ${recipient.value}`
                              : recipient.value,
                          )
                        }
                      >
                        {recipient.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="communications-template"
                  className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
                >
                  Template
                </label>
                <select
                  id="communications-template"
                  data-testid="communications-template-select"
                  value={selectedTemplate}
                  onChange={(event) => onPickTemplate(event.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-xs"
                >
                  <option value="">No template</option>
                  {(templates ?? []).map((template) => (
                    <option key={`${template.source}-${template.slug}`} value={template.slug}>
                      {template.name}
                      {template.source === "seed" ? " (starter)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="communications-priority"
                  className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
                >
                  Priority
                </label>
                <select
                  id="communications-priority"
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as "low" | "normal" | "high" | "critical")
                  }
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-xs"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              {channel !== "sms" ? (
                <div className="space-y-1 sm:col-span-2">
                  <label
                    htmlFor="communications-subject"
                    className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
                  >
                    Subject
                  </label>
                  <Input
                    id="communications-subject"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder={channel === "email" ? "Subject" : "Optional title"}
                    className="text-xs"
                  />
                </div>
              ) : null}
              <div className="space-y-1 sm:col-span-2">
                <label
                  htmlFor="communications-body"
                  className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
                >
                  Message
                </label>
                <textarea
                  id="communications-body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="min-h-[140px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder={
                    channel === "email"
                      ? "Write the message that will go to the selected recipients…"
                      : channel === "sms"
                        ? "Keep SMS short. Use {{contactName}} and other merge tokens…"
                        : "Write the portal update that borrowers will see in their thread…"
                  }
                  maxLength={channel === "sms" ? 1600 : 50000}
                />
              </div>
            </div>

            {activeCustomInputs.length ? (
              <div className="space-y-2 rounded-xl border border-border/60 bg-background/70 p-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Template inputs
                </p>
                {activeCustomInputs.map((input) => (
                  <div key={input.key} className="space-y-1">
                    <label
                      htmlFor={`custom-input-${input.key}`}
                      className="text-xs text-muted-foreground"
                    >
                      {input.label}{" "}
                      <span className="text-[10px]">{tokenForKey(input.key)}</span>
                    </label>
                    <Input
                      id={`custom-input-${input.key}`}
                      value={customOverrides[input.key] ?? input.defaultValue ?? ""}
                      onChange={(event) =>
                        setCustomOverrides((prev) => ({
                          ...prev,
                          [input.key]: event.target.value,
                        }))
                      }
                      className="text-xs"
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={applyResolvedToCompose}
                >
                  Apply resolved preview to message
                </Button>
              </div>
            ) : null}

            {(showResolvedPreview || activeCustomInputs.length > 0) &&
            (resolvedPreview.bodyText || resolvedPreview.subject) ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  <Wand2 className="h-3.5 w-3.5" aria-hidden />
                  Resolved preview
                </div>
                {channel !== "sms" && resolvedPreview.subject ? (
                  <p className="mb-1 text-xs font-semibold">{resolvedPreview.subject}</p>
                ) : null}
                <pre className="whitespace-pre-wrap text-xs text-foreground">
                  {resolvedPreview.bodyText}
                </pre>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={testMode}
                  onChange={(event) => setTestMode(event.target.checked)}
                />
                Test mode
              </label>
              {channel === "email" ? (
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5" aria-hidden />
                  <span>Attach files</span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => void onUploadFiles(event.target.files)}
                  />
                </label>
              ) : null}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Wand2 className="h-3.5 w-3.5" aria-hidden />
                Variables ready for{" "}
                {context?.fileName ?? context?.contactName ?? context?.lenderName ?? "this record"}
              </div>
            </div>

            {draft?.attachments?.length ? (
              <ul className="flex flex-wrap gap-2">
                {draft.attachments.map((attachment) => (
                  <li
                    key={attachment._id}
                    className="inline-flex items-center gap-2 rounded-full border border-border/60 px-2.5 py-1 text-[11px]"
                  >
                    <Paperclip className="h-3 w-3" aria-hidden />
                    <span>{attachment.fileName}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        void removeAttachment({
                          organizationId: props.organizationId,
                          memberUserKey: props.memberUserKey,
                          attachmentId: attachment._id,
                        })
                      }
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {err ? (
              <p className="text-xs text-destructive" role="alert">
                {err}
              </p>
            ) : null}
          </div>

          <div className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Send options
            </div>
            <div className="space-y-1">
              <label htmlFor="communications-schedule" className="text-[11px] text-muted-foreground">
                Schedule
              </label>
              <Input
                id="communications-schedule"
                type="datetime-local"
                value={scheduleAt}
                onChange={(event) => setScheduleAt(event.target.value)}
                className="text-xs"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Drafts autosave while you type. Email uses Resend; SMS uses the
              configured provider (stub until live SMS is enabled).
            </p>
            <Button
              type="button"
              className="w-full"
              disabled={busy}
              onClick={() => void sendNow()}
            >
              <Send className="mr-2 h-4 w-4" aria-hidden />
              {busy
                ? "Queueing…"
                : scheduleAt
                  ? `Schedule ${channelLabel}`
                  : `Send ${channelLabel}`}
            </Button>
          </div>
        </div>
      </div>

      {!props.hideHistory ? (
        <CommunicationHistoryPanel
          organizationId={props.organizationId}
          memberUserKey={props.memberUserKey}
          relatedPipelineFileId={props.relatedPipelineFileId}
          relatedContactId={props.relatedContactId}
          relatedLenderId={props.relatedLenderId}
        />
      ) : null}
    </div>
  );
}
