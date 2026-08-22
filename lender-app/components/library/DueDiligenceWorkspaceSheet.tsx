"use client";

/**
 * AI Due Diligence: pick a saved/one-off prompt, run against selected vault
 * files, persist history, show review UI with copy/export.
 * Reuses libraryDocuments selection — not a second picker.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { Copy, Download, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import { extractVaultFilesForDueDiligence } from "@/lib/ai/extractVaultFilesForDueDiligence";
import { DUE_DILIGENCE_PROMPT_SEEDS } from "@/lib/ai/dueDiligencePrompts";
import type { OrgAiProviderKind } from "@/lib/ai/orgAiProviders";
import { AI_PROVIDERS_PATH } from "@/lib/settingsRegistry";

type SelectedDoc = {
  _id: Id<"libraryDocuments">;
  title: string;
  latestVersionId?: Id<"libraryDocumentVersions"> | null;
  latestFileName?: string | null;
  latestContentType?: string | null;
};

const MOCK_CLIENT = process.env.NEXT_PUBLIC_DLC_AI_DUE_DILIGENCE_MOCK === "1";

export type DueDiligenceWorkspaceSheetProps = {
  open: boolean;
  onClose: () => void;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  pipelineFileId?: Id<"pipeline"> | null;
  selectedDocuments: SelectedDoc[];
};

export function DueDiligenceWorkspaceSheet({
  open,
  onClose,
  organizationId,
  memberUserKey,
  pipelineFileId,
  selectedDocuments,
}: DueDiligenceWorkspaceSheetProps) {
  const scopedPipelineFileId = pipelineFileId ?? undefined;
  const providers = useQuery(
    api.orgAiProviders.listEnabledProviders,
    open ? { organizationId, memberUserKey } : "skip",
  );
  const prompts = useQuery(
    api.dueDiligencePrompts.listDeployedPrompts,
    open ? { organizationId, memberUserKey } : "skip",
  );
  const pipelineHistory = useQuery(
    api.dueDiligence.listRunsForPipeline,
    open && scopedPipelineFileId
      ? {
          organizationId,
          pipelineFileId: scopedPipelineFileId,
          memberUserKey,
          limit: 15,
        }
      : "skip",
  );
  const orgHistory = useQuery(
    api.dueDiligence.listRunsForOrg,
    open && !scopedPipelineFileId
      ? { organizationId, memberUserKey, limit: 15 }
      : "skip",
  );
  const history = scopedPipelineFileId ? pipelineHistory : orgHistory;

  const convex = useConvex();
  const createRun = useMutation(api.dueDiligence.createRun);
  const execute = useAction(api.dueDiligenceActions.executeDueDiligence);

  const [promptId, setPromptId] = useState<string>("__oneoff__");
  const [promptTitle, setPromptTitle] = useState("One-off due diligence");
  const [promptBody, setPromptBody] = useState("");
  const [providerId, setProviderId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [activeRunId, setActiveRunId] = useState<Id<"dueDiligenceRuns"> | null>(
    null,
  );
  const [viewTab, setViewTab] = useState<"run" | "history">("run");

  const activeRun = useQuery(
    api.dueDiligence.getRun,
    open && activeRunId
      ? { organizationId, runId: activeRunId, memberUserKey }
      : "skip",
  );

  useEffect(() => {
    if (!open) return;
    setViewTab("run");
    setActiveRunId(null);
    setPromptId("__oneoff__");
    setPromptTitle("One-off due diligence");
    setPromptBody("");
    setProviderId("");
  }, [open]);

  useEffect(() => {
    if (!providers?.length || providerId) return;
    const def = providers.find((p) => p.isDefault) ?? providers[0];
    if (def) setProviderId(String(def._id));
  }, [providers, providerId]);

  const selectedPrompt = useMemo(
    () => prompts?.find((p) => String(p._id) === promptId) ?? null,
    [prompts, promptId],
  );

  useEffect(() => {
    if (selectedPrompt) {
      setPromptTitle(selectedPrompt.title);
      setPromptBody(selectedPrompt.body);
    }
  }, [selectedPrompt]);

  const selectedProvider = useMemo(
    () => providers?.find((p) => String(p._id) === providerId) ?? null,
    [providers, providerId],
  );

  const seedOneOff = useCallback((seedTitle?: string) => {
    const seed =
      DUE_DILIGENCE_PROMPT_SEEDS.find((s) => s.title === seedTitle) ??
      DUE_DILIGENCE_PROMPT_SEEDS[0];
    setPromptId("__oneoff__");
    setPromptTitle(seed?.title ?? "One-off due diligence");
    setPromptBody(seed?.body ?? "");
  }, []);

  const runAnalysis = useCallback(async () => {
    if (busy) return;
    const title = promptTitle.trim();
    const body = promptBody.trim();
    if (!title || !body) {
      showOperationalToast({
        title: "Add a prompt",
        description: "Title and prompt body are required.",
        variant: "destructive",
      });
      return;
    }
    if (selectedDocuments.length === 0) {
      showOperationalToast({
        title: "Select files first",
        description: "Choose at least one vault file.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const extractedInputs = [];
      for (const doc of selectedDocuments) {
        if (!doc.latestVersionId) {
          throw new Error(`“${doc.title}” has no stored file version.`);
        }
        const urlResult = await convex.query(api.libraryDocuments.getVersionUrl, {
          documentId: doc._id,
          versionId: doc.latestVersionId,
          memberUserKey,
        });
        if (urlResult.status !== "ok" || !urlResult.url) {
          throw new Error(`Could not download “${doc.title}”.`);
        }
        extractedInputs.push({
          documentId: String(doc._id),
          title: doc.title,
          fileName: doc.latestFileName ?? undefined,
          contentType: doc.latestContentType ?? undefined,
          url: urlResult.url,
        });
      }

      const kind = (selectedProvider?.kind ?? "openai") as OrgAiProviderKind;
      const { extracted, warnings } = await extractVaultFilesForDueDiligence({
        files: extractedInputs,
        providerKind: kind,
      });
      const usable = extracted.filter((f) => f.usedAs !== "skipped");
      if (usable.length === 0) {
        throw new Error(
          warnings[0] || "None of the selected files could be sent to the model.",
        );
      }

      const created = await createRun({
        organizationId,
        memberUserKey,
        ...(scopedPipelineFileId
          ? { pipelineFileId: scopedPipelineFileId }
          : {}),
        promptId:
          promptId !== "__oneoff__"
            ? (promptId as Id<"dueDiligencePrompts">)
            : undefined,
        promptTitle: title,
        promptBody: body,
        providerId: providerId
          ? (providerId as Id<"orgAiProviders">)
          : undefined,
        providerKind: selectedProvider?.kind ?? (MOCK_CLIENT ? "custom" : "openai"),
        providerName: selectedProvider?.name ?? (MOCK_CLIENT ? "Mock (local)" : "Default"),
        model: selectedProvider?.model ?? (MOCK_CLIENT ? "mock" : ""),
        documentIds: selectedDocuments.map((d) => d._id),
        documentSummaries: extracted.map((f) => ({
          documentId: f.documentId as Id<"libraryDocuments">,
          title: f.title,
          fileName: f.fileName,
          kind: f.kind,
          usedAs: f.usedAs,
          skipReason: f.skipReason,
        })),
        warnings,
      });

      setActiveRunId(created.runId);
      setViewTab("run");
      const executed = await execute({
        organizationId,
        memberUserKey,
        runId: created.runId,
        providerId: providerId
          ? (providerId as Id<"orgAiProviders">)
          : undefined,
        promptBody: body,
        extractedFiles: extracted.map((f) => ({
          documentId: f.documentId,
          title: f.title,
          fileName: f.fileName,
          contentType: f.contentType,
          kind: f.kind,
          usedAs: f.usedAs,
          text: f.text,
          imageDataUrl: f.imageDataUrl,
          skipReason: f.skipReason,
        })),
        useMock: MOCK_CLIENT || undefined,
      });
      if (!executed.ok) {
        throw new Error(executed.error || "Due diligence failed.");
      }
      showOperationalToast({
        title: executed.mocked ? "Mock analysis complete" : "Due diligence complete",
        variant: "success",
      });
    } catch (e) {
      showOperationalToast({
        title: "Due diligence failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    convex,
    createRun,
    execute,
    memberUserKey,
    organizationId,
    promptBody,
    promptId,
    promptTitle,
    providerId,
    scopedPipelineFileId,
    selectedDocuments,
    selectedProvider,
  ]);

  const resultMarkdown = activeRun?.resultMarkdown?.trim() || "";

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      align="bottom-sheet"
      aria-label="AI Due Diligence"
      data-testid="due-diligence-sheet"
      panelClassName="flex max-h-[min(92dvh,860px)] w-full max-w-3xl flex-col overflow-hidden p-0"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4" aria-hidden />
            Due Diligence
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {selectedDocuments.length} selected file
            {selectedDocuments.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={viewTab === "run" ? "secondary" : "ghost"}
            className="min-h-10"
            onClick={() => setViewTab("run")}
          >
            Run
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewTab === "history" ? "secondary" : "ghost"}
            className="min-h-10"
            onClick={() => setViewTab("history")}
            data-testid="due-diligence-history-tab"
          >
            History
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {viewTab === "history" ? (
          <ul className="space-y-2" data-testid="due-diligence-history">
            {(history ?? []).length === 0 ? (
              <li className="text-sm text-muted-foreground">No runs yet.</li>
            ) : (
              (history ?? []).map((run) => (
                <li key={String(run._id)}>
                  <button
                    type="button"
                    className="w-full rounded-dlc-md border border-border/70 bg-dlc-surface p-3 text-left"
                    onClick={() => {
                      setActiveRunId(run._id);
                      setViewTab("run");
                    }}
                  >
                    <span className="block text-sm font-medium text-foreground">
                      {run.promptTitle}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {run.status} · {run.providerName}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <Label>Prompt</Label>
                <Select
                  className="mt-1 h-10 min-h-[40px]"
                  value={promptId}
                  data-testid="due-diligence-prompt-pick"
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === "__oneoff__") {
                      seedOneOff();
                      return;
                    }
                    setPromptId(next);
                  }}
                >
                  <option value="__oneoff__">One-off prompt</option>
                  {(prompts ?? []).map((p) => (
                    <option key={String(p._id)} value={String(p._id)}>
                      {p.title}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <Label>AI provider</Label>
                <Select
                  className="mt-1 h-10 min-h-[40px]"
                  value={providerId}
                  data-testid="due-diligence-provider"
                  onChange={(e) => setProviderId(e.target.value)}
                >
                  {(providers ?? []).length === 0 ? (
                    <option value="">No providers configured</option>
                  ) : (
                    (providers ?? []).map((p) => (
                      <option key={String(p._id)} value={String(p._id)}>
                        {p.name}
                        {p.isDefault ? " (default)" : ""}
                      </option>
                    ))
                  )}
                </Select>
              </label>
            </div>
            {(providers ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Add an API key in{" "}
                <Link href={AI_PROVIDERS_PATH} className="underline">
                  Settings → AI API keys
                </Link>
                {MOCK_CLIENT
                  ? " Mock mode can still run without a live key."
                  : ""}
              </p>
            ) : null}
            <label className="block">
              <Label>Title</Label>
              <Input
                className="mt-1 h-10 min-h-[40px]"
                value={promptTitle}
                onChange={(e) => setPromptTitle(e.target.value)}
              />
            </label>
            <label className="block">
              <Label>Prompt body</Label>
              <Textarea
                className="mt-1 min-h-[140px]"
                value={promptBody}
                data-testid="due-diligence-prompt-body"
                onChange={(e) => setPromptBody(e.target.value)}
              />
            </label>
            <ul className="text-[11px] text-muted-foreground">
              {selectedDocuments.map((d) => (
                <li key={String(d._id)}>{d.title}</li>
              ))}
            </ul>
            {activeRun?.errorMessage ? (
              <p className="text-xs text-red-700" role="alert">
                {activeRun.errorMessage}
              </p>
            ) : null}
            {resultMarkdown ? (
              <div className="space-y-2" data-testid="due-diligence-result">
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-10"
                    data-testid="due-diligence-copy"
                    onClick={() => {
                      void navigator.clipboard.writeText(resultMarkdown);
                      showOperationalToast({
                        title: "Copied analysis",
                        variant: "success",
                      });
                    }}
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                    Copy
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-10"
                    data-testid="due-diligence-export"
                    onClick={() => {
                      const blob = new Blob([resultMarkdown], {
                        type: "text/markdown",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "due-diligence.md";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    Export
                  </Button>
                </div>
                <pre
                  className={cn(
                    "whitespace-pre-wrap rounded-dlc-md border border-border/70 bg-dlc-surface p-3 text-xs text-foreground",
                  )}
                >
                  {resultMarkdown}
                </pre>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border/70 px-4 py-3">
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-h-10"
          disabled={
            busy ||
            selectedDocuments.length === 0 ||
            (!providerId && !MOCK_CLIENT)
          }
          data-testid="due-diligence-run"
          onClick={() => void runAnalysis()}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Running…
            </>
          ) : (
            "Run analysis"
          )}
        </Button>
      </div>
    </OverlayShell>
  );
}
