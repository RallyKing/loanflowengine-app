"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useMutation, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, Clock, Eye, Pencil, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { ClientPortalBlockPanel } from "@/components/library/ClientPortalBlockPanel";
import { ClientPortalRevisionBanner } from "@/components/library/FileTaskReviewActions";
import { ClientPortalFolderUploadTree } from "@/components/library/ClientPortalFolderUploadTree";
import { FileTaskClientTemplateDownloads } from "@/components/library/FileTaskClientTemplateAttach";
import { PortalFileTaskPasswordGate } from "@/components/library/PortalFileTaskPasswordGate";
import { cn } from "@/lib/cn";
import { normalizePortalToken } from "@/lib/portalToken";
import {
  buildVerifyAccessPath,
  readPortalAccessProof,
} from "@/lib/portalAccessProof";
import { readPortalTaskAccessProof } from "@/lib/portalTaskAccessProof";
import { postFileToConvexUploadUrl } from "@/lib/uploadToConvexStorage";
import { resolveTaskType } from "@/lib/documentVaultTaskTypes";
import { usePortalSession } from "@/lib/usePortalCollaborationSession";
import { PortalPageComposition } from "@/components/portal/PortalPageSectionRenderer";
import type { PortalPageSectionInstance } from "@/lib/portalPageSections";
import { defaultStatusSteps } from "@/lib/portalSectionConfig";

type ClientPortalBundleClientProps = {
  bundleToken: string;
  companySlug?: string;
};

const MAX_CLIENT_UPLOAD_BYTES = 25 * 1024 * 1024;

function validateClientUploadFile(file: File): string | null {
  if (!file || file.size <= 0) return "File is empty.";
  if (file.size > MAX_CLIENT_UPLOAD_BYTES) {
    return "File is too large (max 25 MB).";
  }
  return null;
}

type TaskOverride = {
  status?: "pending_review" | "complete";
};

type UploadProgress = {
  current: number;
  total: number;
};

export function ClientPortalBundleClient({
  bundleToken,
  companySlug,
}: ClientPortalBundleClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const normalizedToken = normalizePortalToken(bundleToken);
  const accessProof = readPortalAccessProof(normalizedToken);
  const portal = useQuery(api.documentVaultClientBundlePortal.getBundleByToken, {
    token: normalizedToken,
    companySlug,
    accessProof,
  });
  const generateUploadUrl = useMutation(
    api.documentVaultClientBundlePortal.generateBundleUploadUrl,
  );
  const ingestUpload = useMutation(
    api.documentVaultClientBundlePortal.ingestBundleUpload,
  );
  const markInstructionComplete = useMutation(
    api.documentVaultClientBundlePortal.markClientInstructionComplete,
  );

  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, TaskOverride>
  >({});
  const [uploadBusyTaskId, setUploadBusyTaskId] = useState<string | null>(null);
  const [uploadProgressByTaskId, setUploadProgressByTaskId] = useState<
    Record<string, UploadProgress>
  >({});
  const [uploadErrorByTaskId, setUploadErrorByTaskId] = useState<
    Record<string, string>
  >({});
  const [instructionBusyId, setInstructionBusyId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (portal?.status !== "verification_required") return;
    const returnTo =
      pathname ||
      (companySlug
        ? `/${companySlug}/${encodeURIComponent(normalizedToken)}`
        : `/client-portal/${encodeURIComponent(normalizedToken)}`);
    router.replace(buildVerifyAccessPath(normalizedToken, returnTo));
  }, [companySlug, normalizedToken, pathname, portal?.status, router]);

  const uploadFiles = useCallback(
    async (
      fileTaskId: Id<"documentVaultFileTasks">,
      files: File[],
      folderId?: Id<"documentFolders"> | null,
    ) => {
      setUploadBusyTaskId(String(fileTaskId));
      setUploadErrorByTaskId((prev) => {
        const next = { ...prev };
        delete next[String(fileTaskId)];
        return next;
      });
      try {
        for (let index = 0; index < files.length; index++) {
          const file = files[index]!;
          setUploadProgressByTaskId((prev) => ({
            ...prev,
            [String(fileTaskId)]: {
              current: index + 1,
              total: files.length,
            },
          }));
          const postUrl = await generateUploadUrl({
            bundleToken: normalizedToken,
            fileTaskId,
            accessProof,
            taskAccessProof: readPortalTaskAccessProof(
              normalizedToken,
              String(fileTaskId),
            ),
          });
          const { storageId } = await postFileToConvexUploadUrl(postUrl, file, {
            validateFile: validateClientUploadFile,
          });
          await ingestUpload({
            bundleToken: normalizedToken,
            fileTaskId,
            ...(folderId ? { folderId } : {}),
            storageId: storageId as Id<"_storage">,
            fileName: file.name,
            contentType: file.type || undefined,
            size: file.size,
            accessProof,
            taskAccessProof: readPortalTaskAccessProof(
              normalizedToken,
              String(fileTaskId),
            ),
          });
        }
        setTaskOverrides((prev) => ({
          ...prev,
          [String(fileTaskId)]: {
            status: "pending_review",
          },
        }));
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Upload failed. Try again.";
        setUploadErrorByTaskId((prev) => ({
          ...prev,
          [String(fileTaskId)]: message,
        }));
      } finally {
        setUploadBusyTaskId(null);
        setUploadProgressByTaskId((prev) => {
          const next = { ...prev };
          delete next[String(fileTaskId)];
          return next;
        });
      }
    },
    [accessProof, generateUploadUrl, ingestUpload, normalizedToken],
  );

  if (portal === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (portal.status === "verification_required") {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Redirecting to verification…
      </div>
    );
  }

  if (portal.status === "not_found") {
    return <StatusCard tone="error">This portal link is invalid.</StatusCard>;
  }
  if (portal.status === "revoked") {
    return <StatusCard tone="error">This portal link has been revoked.</StatusCard>;
  }
  if (portal.status === "slug_mismatch") {
    return (
      <StatusCard tone="error">
        This portal link does not match the company URL.
      </StatusCard>
    );
  }
  if (portal.status === "expired") {
    return <StatusCard tone="error">This portal link has expired.</StatusCard>;
  }
  if (portal.status !== "ok") {
    return <StatusCard tone="error">This portal link is unavailable.</StatusCard>;
  }

  return (
    <ClientPortalBundleLoaded
      bundleToken={normalizedToken}
      companySlug={companySlug}
      portal={portal}
      taskOverrides={taskOverrides}
      setTaskOverrides={setTaskOverrides}
      uploadBusyTaskId={uploadBusyTaskId}
      uploadProgressByTaskId={uploadProgressByTaskId}
      uploadErrorByTaskId={uploadErrorByTaskId}
      instructionBusyId={instructionBusyId}
      setUploadBusyTaskId={setUploadBusyTaskId}
      setInstructionBusyId={setInstructionBusyId}
      uploadFiles={uploadFiles}
      markInstructionComplete={markInstructionComplete}
      accessProof={accessProof}
    />
  );
}

type LoadedPortal = {
  status: "ok";
  readOnlyPreview: boolean;
  brokerAgentCapable?: boolean;
  workspaceName: string;
  fileLabel: string;
  tasks: PortalTask[];
};

function ClientPortalBundleLoaded({
  bundleToken,
  companySlug,
  portal,
  taskOverrides,
  setTaskOverrides,
  uploadBusyTaskId,
  uploadProgressByTaskId,
  uploadErrorByTaskId,
  instructionBusyId,
  setUploadBusyTaskId: _setUploadBusyTaskId,
  setInstructionBusyId,
  uploadFiles,
  markInstructionComplete,
  accessProof,
}: {
  bundleToken: string;
  companySlug?: string;
  portal: LoadedPortal;
  taskOverrides: Record<string, TaskOverride>;
  setTaskOverrides: Dispatch<SetStateAction<Record<string, TaskOverride>>>;
  uploadBusyTaskId: string | null;
  uploadProgressByTaskId: Record<string, UploadProgress>;
  uploadErrorByTaskId: Record<string, string>;
  instructionBusyId: string | null;
  setUploadBusyTaskId: (id: string | null) => void;
  setInstructionBusyId: (id: string | null) => void;
  uploadFiles: (
    fileTaskId: Id<"documentVaultFileTasks">,
    files: File[],
    folderId?: Id<"documentFolders"> | null,
  ) => Promise<void>;
  markInstructionComplete: ReturnType<
    typeof useMutation<
      typeof api.documentVaultClientBundlePortal.markClientInstructionComplete
    >
  >;
  accessProof?: string;
}) {
  const portalSession = usePortalSession({
    brokerAgentCapable: portal.brokerAgentCapable === true,
    readOnlyPreview: portal.readOnlyPreview === true,
  });

  const composition = useQuery(
    api.portalDefaults.resolveCompositionForClientBundle,
    {
      token: bundleToken,
      ...(companySlug ? { companySlug } : {}),
    },
  );

  const statusSection = useMemo(() => {
    if (composition?.status !== "ok") return null;
    return (
      (composition.sections as PortalPageSectionInstance[]).find(
        (s) =>
          s.sectionId === "status_pipeline_stage" &&
          s.enabled !== false &&
          s.props?.statusMode === "custom_checklist",
      ) ?? null
    );
  }, [composition]);

  const completedSteps = useQuery(
    api.portalSectionProgress.listCompletedStepsForBundle,
    statusSection
      ? {
          token: bundleToken,
          sectionInstanceId: statusSection.instanceId,
        }
      : "skip",
  );
  const completeStatusStep = useMutation(
    api.portalSectionProgress.completeStatusStepForBundle,
  );

  const effectiveTasks = useMemo(() => {
    return portal.tasks.map((task) => {
      const override = taskOverrides[String(task.fileTaskId)];
      return {
        ...task,
        status: override?.status ?? task.status,
      };
    });
  }, [portal.tasks, taskOverrides]);

  const readOnly = !portalSession.canWrite;
  const useComposition =
    composition?.status === "ok" && (composition.sections?.length ?? 0) > 0;
  const compositionChrome =
    composition?.status === "ok" ? composition.chrome ?? null : null;
  const compositionUsesChrome = Boolean(
    compositionChrome &&
      ((compositionChrome.sidebar?.items?.length ?? 0) > 0 ||
        compositionChrome.top),
  );

  const tasksList = (
    <ul className="space-y-4">
      {effectiveTasks.map((task) => {
        const taskKey = String(task.fileTaskId);
        const progress = uploadProgressByTaskId[taskKey];
        const uploadBusyLabel =
          progress && progress.total > 1
            ? `Uploading ${progress.current} of ${progress.total}…`
            : progress
              ? "Uploading…"
              : null;

        return (
          <ClientPortalTaskCard
            key={task.fileTaskId}
            task={task}
            readOnly={readOnly}
            bundleToken={bundleToken}
            uploadBusy={uploadBusyTaskId === taskKey}
            uploadBusyLabel={uploadBusyLabel}
            uploadError={uploadErrorByTaskId[taskKey]}
            instructionBusy={instructionBusyId === taskKey}
            onUpload={(files, folderId) =>
              uploadFiles(
                task.fileTaskId as Id<"documentVaultFileTasks">,
                files,
                folderId,
              )
            }
            onInstructionComplete={async () => {
              setInstructionBusyId(String(task.fileTaskId));
              try {
                await markInstructionComplete({
                  bundleToken,
                  fileTaskId: task.fileTaskId as Id<"documentVaultFileTasks">,
                  accessProof,
                });
                setTaskOverrides((prev) => ({
                  ...prev,
                  [String(task.fileTaskId)]: { status: "complete" },
                }));
              } finally {
                setInstructionBusyId(null);
              }
            }}
            onBlockSubmitted={() => {
              setTaskOverrides((prev) => ({
                ...prev,
                [String(task.fileTaskId)]: { status: "pending_review" },
              }));
            }}
          />
        );
      })}
    </ul>
  );

  return (
    <div
      className={cn(
        "min-h-dvh bg-neutral-50",
        compositionUsesChrome ? "px-0 py-0 sm:px-3 sm:py-6" : "px-4 py-10",
      )}
    >
      <div
        className={cn(
          "mx-auto",
          compositionUsesChrome ? "max-w-6xl" : "max-w-xl",
        )}
      >
        {portalSession.showAgentToggle ? (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-dlc-md border border-border/70 bg-white px-2 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Broker session
            </span>
            <div className="flex gap-1 rounded-dlc-sm border border-border/60 p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded-dlc-sm px-2 py-1 text-[10px] font-medium",
                  portalSession.mode === "read"
                    ? "bg-dlc-surface-high shadow-dlc-1"
                    : "text-muted-foreground",
                )}
                onClick={() => portalSession.setMode("read")}
              >
                <Eye className="mr-1 inline h-3 w-3" aria-hidden />
                View as client
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-dlc-sm px-2 py-1 text-[10px] font-medium",
                  portalSession.mode === "write"
                    ? "bg-dlc-surface-high shadow-dlc-1"
                    : "text-muted-foreground",
                )}
                onClick={() => portalSession.setMode("write")}
              >
                <Pencil className="mr-1 inline h-3 w-3" aria-hidden />
                Edit as agent
              </button>
            </div>
          </div>
        ) : readOnly ? (
          <div className="mb-4 flex items-center gap-2 rounded-dlc-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Broker preview — read-only. Switch to Edit as agent or send a client invite.
          </div>
        ) : (
          <div className="mb-4 flex items-center gap-2 rounded-dlc-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Collaborative portal — changes sync live with your broker.
          </div>
        )}
        {useComposition && composition ? (
          <PortalPageComposition
            sections={composition.sections as PortalPageSectionInstance[]}
            chrome={compositionChrome}
            context={{
              ...composition.context,
              fileLabel:
                composition.context?.fileLabel ?? portal.fileLabel,
              workspaceName:
                composition.context?.workspaceName ?? portal.workspaceName,
              outstandingCount:
                composition.context?.outstandingCount ??
                effectiveTasks.length,
            }}
            slots={{
              outstandingDocuments: (
                <div className="space-y-4">
                  {tasksList}
                  {effectiveTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No document requests are available on this link.
                    </p>
                  ) : null}
                </div>
              ),
              statusChecklist: statusSection ? (
                <ul className="space-y-2" data-testid="portal-live-status-checklist">
                  {(statusSection.props?.statusSteps?.length
                    ? statusSection.props.statusSteps
                    : defaultStatusSteps()
                  ).map((step) => {
                    const done = (completedSteps ?? []).some(
                      (r) => r.stepId === step.id,
                    );
                    return (
                      <li key={step.id}>
                        <button
                          type="button"
                          disabled={done || readOnly}
                          className={cn(
                            "flex min-h-10 w-full items-start gap-2.5 rounded-dlc-md border border-border/60 px-3 py-2 text-left",
                            done && "border-primary/30 bg-primary/5",
                            !done && !readOnly && "hover:bg-muted/40",
                          )}
                          onClick={() => {
                            if (done || readOnly) return;
                            void completeStatusStep({
                              token: bundleToken,
                              sectionInstanceId: statusSection.instanceId,
                              stepId: step.id,
                              portalDefaultId: composition?.defaultId,
                            });
                          }}
                        >
                          <CheckCircle2
                            className={cn(
                              "mt-0.5 h-4 w-4 shrink-0",
                              done ? "text-primary" : "text-muted-foreground/40",
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-foreground">
                              {step.label}
                            </span>
                            {step.description ? (
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {step.description}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : undefined,
            }}
          />
        ) : (
          <>
            <header className="mb-6 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {portal.workspaceName}
              </p>
              <h1 className="mt-1 text-lg font-semibold text-foreground">
                Document requests
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {portal.fileLabel}
              </p>
            </header>

            {tasksList}

            {effectiveTasks.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                No document requests are available on this link.
              </p>
            ) : null}
          </>
        )}

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          Secure portal · Your broker will review submitted items
        </p>
      </div>
    </div>
  );
}

type PortalTask = {
  fileTaskId: Id<"documentVaultFileTasks">;
  title: string;
  isRequired: boolean;
  status: "incomplete" | "pending_review" | "complete";
  taskType: string;
  passwordProtected?: boolean;
  clientInstructionText?: string;
  instructionUrl?: string;
  clientTemplates?: Array<{
    fileName: string;
    mimeType: string;
    size: number;
    url: string;
  }>;
  assignedBlocks: string[];
  rejectionNote?: string;
  blockPrefill: Record<string, Record<string, string>>;
};

function ClientPortalTaskCard({
  task,
  readOnly,
  bundleToken,
  uploadBusy,
  uploadBusyLabel,
  uploadError,
  instructionBusy,
  onUpload,
  onInstructionComplete,
  onBlockSubmitted,
}: {
  task: PortalTask;
  readOnly: boolean;
  bundleToken: string;
  uploadBusy: boolean;
  uploadBusyLabel?: string | null;
  uploadError?: string;
  instructionBusy: boolean;
  onUpload: (
    files: File[],
    folderId?: Id<"documentFolders"> | null,
  ) => Promise<void>;
  onInstructionComplete: () => Promise<void>;
  onBlockSubmitted: () => void;
}) {
  const [unlocked, setUnlocked] = useState(() =>
    Boolean(readPortalTaskAccessProof(bundleToken, String(task.fileTaskId))),
  );
  const taskType = resolveTaskType(task.taskType);
  const isComplete = task.status === "complete";
  const isPendingReview = task.status === "pending_review";
  const needsPassword = Boolean(task.passwordProtected) && !unlocked;
  const canUpload =
    taskType === "document_upload" && !readOnly && !isComplete && !needsPassword;
  const canCompleteInstruction =
    taskType === "client_instruction" && !readOnly && !isComplete && !needsPassword;
  const showBlocks =
    taskType === "block_assignment" &&
    task.assignedBlocks.length > 0 &&
    !needsPassword;

  return (
    <li
      className={cn(
        "rounded-dlc-lg border bg-white p-4 shadow-dlc-1",
        isComplete
          ? "border-emerald-200/80"
          : isPendingReview
            ? "border-blue-200/80"
            : "border-border/80",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {task.title}
          {task.isRequired ? (
            <span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-700">
              Required
            </span>
          ) : null}
        </p>
        {isComplete ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Complete
          </p>
        ) : isPendingReview ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {taskType === "block_assignment"
              ? "Submitted — under review"
              : "Under review"}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            {taskType === "client_instruction"
              ? "Action required"
              : taskType === "block_assignment"
                ? "Fill out the form, then Submit when ready"
                : "Upload required"}
          </p>
        )}
      </div>

      {needsPassword ? (
        <PortalFileTaskPasswordGate
          bundleToken={bundleToken}
          fileTaskId={task.fileTaskId}
          title={task.title}
          onUnlocked={() => setUnlocked(true)}
        />
      ) : null}

      {task.rejectionNote && !isPendingReview && !isComplete && !needsPassword ? (
        <ClientPortalRevisionBanner
          note={task.rejectionNote}
          className="mt-3"
        />
      ) : null}

      {task.clientTemplates && task.clientTemplates.length > 0 ? (
        <FileTaskClientTemplateDownloads templates={task.clientTemplates} />
      ) : null}

      {taskType === "client_instruction" && task.instructionUrl ? (
        <a
          href={task.instructionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex text-sm font-medium text-primary hover:underline"
        >
          Open link
        </a>
      ) : null}

      {taskType === "client_instruction" && task.clientInstructionText ? (
        <div className="mt-3 rounded-dlc-md border border-border/60 bg-muted/10 px-3 py-3 text-sm text-foreground whitespace-pre-wrap">
          {task.clientInstructionText}
        </div>
      ) : null}

      {canCompleteInstruction ? (
        <Button
          type="button"
          size="sm"
          variant="primary"
          className="mt-4 w-full"
          disabled={instructionBusy}
          onClick={() => void onInstructionComplete()}
        >
          {instructionBusy ? "Saving…" : "Mark as complete"}
        </Button>
      ) : null}

      {canUpload ? (
        <div className="mt-4">
          {isPendingReview ? (
            <p className="mb-2 text-[11px] text-muted-foreground">
              Under review — you can still add more files to this request.
            </p>
          ) : null}
          <ClientPortalFolderUploadTree
            bundleToken={bundleToken}
            fileTaskId={task.fileTaskId}
            disabled={readOnly}
            busy={uploadBusy}
            busyLabel={uploadBusyLabel}
            onUpload={onUpload}
          />
          {uploadError ? (
            <p className="mt-2 text-xs text-red-600" role="alert">
              {uploadError}
            </p>
          ) : null}
        </div>
      ) : null}

      {showBlocks ? (
        <ClientPortalBlockPanel
          bundleToken={bundleToken}
          fileTaskId={task.fileTaskId}
          assignedBlocks={task.assignedBlocks}
          taskStatus={task.status}
          disabled={readOnly || isComplete}
          onSubmitted={onBlockSubmitted}
        />
      ) : null}
    </li>
  );
}

function StatusCard({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "error" | "info";
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div
        className={cn(
          "max-w-md rounded-2xl border p-6 text-center text-sm",
          tone === "error"
            ? "border-red-200 bg-red-50 text-red-800"
            : "border-neutral-200 bg-neutral-50 text-neutral-800",
        )}
      >
        {children}
      </div>
    </div>
  );
}
