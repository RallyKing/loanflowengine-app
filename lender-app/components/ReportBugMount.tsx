"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useMutation } from "convex/react";
import { Bug, Camera, Loader2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { Button } from "@/components/ui/Button";
import { SilentFeatureErrorBoundary } from "@/components/SilentFeatureErrorBoundary";
import { useAuth } from "@/lib/sessionUiClient";
import { useViewer } from "@/lib/sessionContext";
import { cn } from "@/lib/cn";
import { layerZIndexStyle } from "@/lib/ui/layering";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import { postFileToConvexUploadUrl } from "@/lib/uploadToConvexStorage";
import { captureViewportScreenshot } from "@/lib/captureViewportScreenshot";
import {
  normalizeBugReportSeverity,
  parsePipelineFileIdFromPath,
  validateBugReportDescription,
  validateBugReportScreenshotFile,
  type BugReportSeverity,
} from "@/lib/bugReportValidation";

function isPublicOrUnauthenticatedPath(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname.startsWith("/sign-in")) return true;
  if (pathname.startsWith("/sign-up")) return true;
  if (pathname.startsWith("/forgot-password")) return true;
  if (pathname.startsWith("/reset-password")) return true;
  if (pathname.startsWith("/portal")) return true;
  if (pathname.startsWith("/apply")) return true;
  if (pathname.startsWith("/upload")) return true;
  if (pathname.startsWith("/client-portal")) return true;
  if (pathname.startsWith("/lender-delivery")) return true;
  return false;
}

function ReportBugFabAndDialog() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const viewer = useViewer();
  const generateUploadUrl = useMutation(api.bugReports.generateUploadUrl);
  const submitBugReport = useMutation(api.bugReports.submitBugReport);

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<BugReportSeverity>("medium");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  /** Bumps on close / new capture so late screenshot results are ignored. */
  const captureGenerationRef = useRef(0);

  const visible =
    Boolean(isSignedIn) &&
    Boolean(viewer?.userKey) &&
    Boolean(viewer?.organizationId) &&
    !isPublicOrUnauthenticatedPath(pathname);

  const revokePreview = useCallback(() => {
    if (previewUrl) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch {
        /* ignore */
      }
    }
  }, [previewUrl]);

  const resetForm = useCallback(() => {
    revokePreview();
    setDescription("");
    setSeverity("medium");
    setScreenshotFile(null);
    setPreviewUrl(null);
    setViewport(null);
    setCaptureError(null);
    setFormError(null);
    setCapturing(false);
    setSubmitting(false);
  }, [revokePreview]);

  const close = useCallback(() => {
    captureGenerationRef.current += 1;
    setOpen(false);
    resetForm();
  }, [resetForm]);

  const runCapture = useCallback(async () => {
    const generation = ++captureGenerationRef.current;
    setCapturing(true);
    setCaptureError(null);
    try {
      // DOM filter excludes FAB/overlay/dialog — safe while sheet is open.
      const shot = await captureViewportScreenshot();
      if (generation !== captureGenerationRef.current) return;
      revokePreview();
      setScreenshotFile(shot.file);
      setPreviewUrl(shot.objectUrl);
      setViewport({ w: shot.width, h: shot.height });
    } catch (err) {
      if (generation !== captureGenerationRef.current) return;
      const message =
        err instanceof Error ? err.message : "Screenshot capture failed.";
      setCaptureError(message);
    } finally {
      if (generation === captureGenerationRef.current) {
        setCapturing(false);
      }
    }
  }, [revokePreview]);

  /**
   * Open the sheet immediately; screenshot fills in async (shows “Capturing…”).
   * Previously we awaited capture before setOpen — FAB spun for seconds on heavy pages.
   */
  const openDialog = useCallback(() => {
    setOpen(true);
    setCaptureError(null);
    setFormError(null);
    revokePreview();
    setScreenshotFile(null);
    setPreviewUrl(null);
    setViewport(null);
    void runCapture();
  }, [revokePreview, runCapture]);

  const onSubmit = useCallback(async () => {
    if (!viewer?.organizationId || !viewer.userKey) return;
    setFormError(null);

    const descErr = validateBugReportDescription(description);
    if (descErr) {
      setFormError(descErr);
      return;
    }

    setSubmitting(true);
    try {
      let screenshotStorageId: Id<"_storage"> | undefined;
      if (screenshotFile) {
        const fileErr = validateBugReportScreenshotFile(screenshotFile);
        if (fileErr) {
          setFormError(fileErr);
          setSubmitting(false);
          return;
        }
        const uploadUrl = await generateUploadUrl({
          organizationId: viewer.organizationId as Id<"organizations">,
          memberUserKey: viewer.userKey,
        });
        const uploaded = await postFileToConvexUploadUrl(
          uploadUrl,
          screenshotFile,
          { validateFile: validateBugReportScreenshotFile },
        );
        screenshotStorageId = uploaded.storageId as Id<"_storage">;
      }

      // Optional context only — server omits invalid/missing/cross-org ids.
      const pipelineFileId =
        parsePipelineFileIdFromPath(pathname) ?? undefined;

      const result = await submitBugReport({
        organizationId: viewer.organizationId as Id<"organizations">,
        memberUserKey: viewer.userKey,
        description,
        severity: normalizeBugReportSeverity(severity),
        pageUrl:
          typeof window !== "undefined" ? window.location.href : pathname ?? "/",
        pagePath: pathname ?? "/",
        pipelineFileId,
        viewportWidth: viewport?.w ?? window.innerWidth,
        viewportHeight: viewport?.h ?? window.innerHeight,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        reporterEmail: viewer.email || undefined,
        screenshotStorageId,
      });

      // Never claim GitHub was scheduled when the opt-in/token gate is off.
      showOperationalToast({
        title: result.githubScheduled
          ? "Bug report sent — triage channels notified."
          : "Bug report saved — Cursor Cloud Minion will pick this up.",
        variant: "success",
        durationMs: 5200,
      });
      close();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to submit bug report.";
      setFormError(message);
      showOperationalToast({
        title: "Could not send bug report",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    viewer,
    description,
    screenshotFile,
    generateUploadUrl,
    submitBugReport,
    pathname,
    severity,
    viewport,
    close,
  ]);

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        data-bug-report-fab="true"
        data-testid="report-bug-fab"
        onClick={() => openDialog()}
        disabled={capturing && !open}
        className={cn(
          "fixed bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.75rem))] right-3 md:bottom-6 md:right-6",
          "inline-flex h-12 items-center gap-2 rounded-dlc-md border border-border bg-background px-3.5 text-sm font-medium text-foreground shadow-dlc-3",
          "hover:bg-muted hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent",
          "disabled:opacity-70",
        )}
        style={layerZIndexStyle("SHEET")}
        title="Report a bug"
        aria-label="Report a bug"
      >
        <Bug className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="hidden sm:inline">Report a bug</span>
      </button>

      <OverlayShell
        open={open}
        onClose={() => {
          if (!submitting) close();
        }}
        align="bottom-sheet"
        aria-label="Report a bug"
        data-testid="report-bug-dialog"
        panelClassName="flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col overflow-hidden p-0"
      >
        <div
          data-bug-report-overlay="true"
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight">
                Report a bug
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Screenshot and context are attached automatically for triage.
              </p>
            </div>
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
              disabled={submitting}
              onClick={close}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Screenshot
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={capturing || submitting}
                  onClick={() => void runCapture()}
                >
                  {capturing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Camera className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Re-capture
                </Button>
              </div>
              <div className="overflow-hidden rounded-dlc-sm border border-border bg-muted/30">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Current viewport screenshot preview"
                    className="max-h-40 w-full object-contain object-top"
                  />
                ) : (
                  <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">
                    {capturing
                      ? "Capturing…"
                      : captureError ?? "No screenshot yet"}
                  </div>
                )}
              </div>
              {captureError && previewUrl ? (
                <p className="mt-1 text-xs text-destructive">{captureError}</p>
              ) : null}
            </div>

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                What went wrong? <span className="text-destructive">*</span>
              </span>
              <textarea
                data-testid="report-bug-description"
                className="mt-1.5 min-h-[7rem] w-full resize-y rounded-dlc-sm border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Steps to reproduce, expected vs actual…"
                disabled={submitting}
                required
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                Severity
              </span>
              <select
                data-testid="report-bug-severity"
                className="mt-1.5 w-full rounded-dlc-sm border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
                value={severity}
                onChange={(e) =>
                  setSeverity(normalizeBugReportSeverity(e.target.value))
                }
                disabled={submitting}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>

            <dl className="grid grid-cols-1 gap-1 rounded-dlc-sm border border-border/70 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground sm:grid-cols-2">
              <div>
                <dt className="font-medium text-foreground/70">Path</dt>
                <dd className="truncate font-mono">{pathname ?? "/"}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground/70">Viewport</dt>
                <dd>
                  {viewport
                    ? `${viewport.w}×${viewport.h}`
                    : `${typeof window !== "undefined" ? window.innerWidth : "—"}×${typeof window !== "undefined" ? window.innerHeight : "—"}`}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground/70">User</dt>
                <dd className="truncate">
                  {viewer?.email || viewer?.userKey || "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground/70">File</dt>
                <dd className="truncate font-mono">
                  {parsePipelineFileIdFromPath(pathname) ?? "—"}
                </dd>
              </div>
            </dl>

            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={close}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              data-testid="report-bug-submit"
              disabled={submitting || capturing}
              onClick={() => void onSubmit()}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Submitting…
                </>
              ) : (
                "Submit report"
              )}
            </Button>
          </div>
        </div>
      </OverlayShell>
    </>
  );
}

/** Global floating Report-a-bug control + modal — authenticated app shell only. */
export function ReportBugMount() {
  return (
    <SilentFeatureErrorBoundary feature="report-bug">
      <ReportBugFabAndDialog />
    </SilentFeatureErrorBoundary>
  );
}
