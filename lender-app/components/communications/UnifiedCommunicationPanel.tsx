"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { postFileToConvexUploadUrl } from "@/lib/uploadToConvexStorage";
import { buildCommunicationPreview } from "@/lib/comms/templateRender";
import { cn } from "@/lib/cn";
import { useDocumentTabVisible } from "@/lib/hooks/useDocumentTabVisible";
import { CommunicationHistoryPanel } from "@/components/communications/CommunicationHistoryPanel";
import {
  useConvexSubMountTrace,
  useConvexSubQueryArgsTrace,
} from "@/lib/convexSubDiagnosticsHooks";
import { Mail, MessageSquareMore, Paperclip, Send, Wand2, X } from "lucide-react";

type Channel = "email" | "portal";

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
}) {
  const [channel, setChannel] = useState<Channel>("email");
  const [draftId, setDraftId] = useState<Id<"outboundMessages"> | null>(null);
  const [recipientsInput, setRecipientsInput] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "critical">("normal");
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const [testMode, setTestMode] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hydratedKeyRef = useRef<string>("");
  const tabVisible = useDocumentTabVisible();

  const templateCatalogArgs = useMemo(
    () => {
      if (!tabVisible) return "skip" as const;
      return {
        organizationId: props.organizationId,
        memberUserKey: props.memberUserKey,
        channel,
      };
    },
    [tabVisible, props.organizationId, props.memberUserKey, channel],
  );

  const composerContextArgs = useMemo(
    () => {
      if (!tabVisible) return "skip" as const;
      return {
        organizationId: props.organizationId,
        memberUserKey: props.memberUserKey,
        relatedPipelineFileId: props.relatedPipelineFileId,
        relatedContactId: props.relatedContactId,
        relatedLenderId: props.relatedLenderId,
      };
    },
    [
      tabVisible,
      props.organizationId,
      props.memberUserKey,
      props.relatedPipelineFileId,
      props.relatedContactId,
      props.relatedLenderId,
    ],
  );

  const draftArgs = useMemo(
    () => {
      if (!tabVisible) return "skip" as const;
      return {
        organizationId: props.organizationId,
        memberUserKey: props.memberUserKey,
        channel,
        relatedPipelineFileId: props.relatedPipelineFileId,
        relatedContactId: props.relatedContactId,
        relatedLenderId: props.relatedLenderId,
      };
    },
    [
      tabVisible,
      props.organizationId,
      props.memberUserKey,
      channel,
      props.relatedPipelineFileId,
      props.relatedContactId,
      props.relatedLenderId,
    ],
  );

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
    setErr(null);
  }, [channel, composerScopeKey, draft]);

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
      subject,
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

  const onPickTemplate = useCallback(
    (slug: string) => {
      setSelectedTemplate(slug);
      const template = templates?.find((row) => row.slug === slug);
      if (!template || !context?.variables) return;
      const preview = buildCommunicationPreview({
        subjectTemplate: template.subjectTemplate,
        bodyTemplate: template.bodyTemplate,
        variables: context.variables,
      });
      setSubject(preview.subject);
      setBody(preview.bodyText);
      if (channel === "email" && !recipientsInput.trim() && context.suggestedRecipients?.length) {
        setRecipientsInput(context.suggestedRecipients.map((row) => row.value).join(", "));
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
      const outboundMessageId = draftId ?? (await ensureDraftSaved());
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
      hydratedKeyRef.current = "";
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not queue message.");
    } finally {
      setBusy(false);
    }
  }, [
    channel,
    draftId,
    ensureDraftSaved,
    props.memberUserKey,
    props.organizationId,
    queueDraft,
    scheduleAt,
  ]);

  return (
    <div className={cn("space-y-4", props.className)} data-testid="unified-communications-panel">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Outbound communications</div>
            <p className="text-xs text-muted-foreground">
              Provider-agnostic compose with draft autosave, templates, scheduling, and
              unified history.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-border/60 bg-background p-1">
            {([
              { value: "email", label: "Email", icon: Mail },
              { value: "portal", label: "Portal", icon: MessageSquareMore },
            ] as const).map((option) => {
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
                      : "Portal participants"
                  }
                  className="text-xs"
                />
                {context?.suggestedRecipients?.length && channel === "email" ? (
                  <div className="flex flex-wrap gap-1.5">
                    {context.suggestedRecipients.slice(0, 6).map((recipient) => (
                      <button
                        key={`${recipient.value}-${recipient.contactId ?? ""}`}
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
                      : "Write the portal update that borrowers will see in their thread…"
                  }
                  maxLength={50000}
                />
              </div>
            </div>

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
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Wand2 className="h-3.5 w-3.5" aria-hidden />
                Variables ready for {context?.fileName ?? context?.contactName ?? "this record"}
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
              Drafts autosave while you type. Queued email uses the shared provider router,
              and portal sends mirror into the live borrower thread.
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
                  ? `Schedule ${channel === "email" ? "email" : "portal update"}`
                  : `Send ${channel === "email" ? "email" : "portal update"}`}
            </Button>
          </div>
        </div>
      </div>

      <CommunicationHistoryPanel
        organizationId={props.organizationId}
        memberUserKey={props.memberUserKey}
        relatedPipelineFileId={props.relatedPipelineFileId}
        relatedContactId={props.relatedContactId}
        relatedLenderId={props.relatedLenderId}
      />
    </div>
  );
}
