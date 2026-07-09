"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Folder } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import {
  clearClientPortalSessionToken,
  getClientPortalSessionToken,
} from "@/lib/clientPortalSession";
import { postFileToConvexUploadUrl } from "@/lib/uploadToConvexStorage";
import { PortalMessagingSection } from "@/components/PortalMessagingSection";
import {
  TrustErrorBlock,
  TrustListSkeleton,
  TrustUploadReceipt,
} from "@/components/trust/TrustSurfaces";
import { formatPortalTrustError } from "@/lib/portalTrustErrors";
import {
  MAX_PLAINTEXT_PASSWORD_LENGTH,
  MIN_PLAINTEXT_PASSWORD_LENGTH,
  plaintextPasswordRequirementSummary,
  validatePlaintextPasswordPolicy,
} from "@/lib/auth/passwordPolicy";

export default function PortalFileDetailPage() {
  const router = useRouter();
  const params = useParams();
  const fileId = params.fileId as string;
  const token = getClientPortalSessionToken();

  const bundle = useQuery(
    api.clientPortal.getFileBundle,
    token && fileId
      ? {
          sessionToken: token,
          fileId: fileId as Id<"pipeline">,
        }
      : "skip",
  );

  const setPassword = useMutation(api.clientPortal.setPassword);
  const logFileView = useMutation(api.clientPortal.logFileView);
  const genUpload = useMutation(api.clientPortal.generateUploadUrl);
  const attachUpload = useMutation(api.clientPortal.attachUpload);
  const completeReq = useMutation(api.clientPortal.completeClientRequest);

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const viewedFileIdRef = useRef<string | null>(null);

  useEffect(() => {
    viewedFileIdRef.current = null;
  }, [fileId]);

  useEffect(() => {
    if (!getClientPortalSessionToken()) {
      router.replace("/portal/login");
    }
  }, [router]);

  useEffect(() => {
    if (bundle?.status === "unauthorized" || bundle?.status === "forbidden") {
      clearClientPortalSessionToken();
      router.replace("/portal/login");
    }
  }, [bundle, router]);

  useEffect(() => {
    if (
      !token ||
      bundle?.status !== "ok" ||
      viewedFileIdRef.current === fileId
    ) {
      return;
    }
    viewedFileIdRef.current = fileId;
    void logFileView({
      sessionToken: token,
      fileId: bundle.file._id,
    });
  }, [token, bundle, fileId, logFileView]);

  const portalRequests =
    bundle?.status === "ok" ? bundle.requests : [];

  const openRequests = useMemo(
    () => portalRequests.filter((r) => r.status === "open"),
    [portalRequests],
  );

  const groupedOpenRequests = useMemo(() => {
    const map = new Map<
      string,
      {
        heading: string;
        folderPath?: string;
        items: typeof openRequests;
      }
    >();
    for (const r of openRequests) {
      const key = r.targetFolderId ?? "__general__";
      const existing = map.get(key);
      if (existing) {
        existing.items.push(r);
      } else {
        map.set(key, {
          heading: r.folderGroupHeading ?? "General requests",
          folderPath: r.folderPath,
          items: [r],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.heading === "General requests") return -1;
      if (b.heading === "General requests") return 1;
      return a.heading.localeCompare(b.heading, undefined, {
        sensitivity: "base",
      });
    });
  }, [openRequests]);

  if (!token) return null;

  if (!bundle || bundle.status === "unauthorized") {
    return <TrustListSkeleton rows={4} label="Loading file" />;
  }

  if (bundle.status === "forbidden" || bundle.status === "not_found") {
    const trust = formatPortalTrustError(
      bundle.status === "not_found"
        ? "File not found"
        : "You do not have access to this file",
    );
    return (
      <div className="space-y-4">
        <TrustErrorBlock title={trust.title} description={trust.detail} />
        <Link href="/portal/files" className="text-sm font-medium text-primary underline">
          Back to your files
        </Link>
      </div>
    );
  }

  const { file, uploads, updates, requests, identityHasPassword, grant, workspaceName, sharedDocuments } =
    bundle;

  const canUpload = grant.canUpload;

  async function uploadPortalFile(
    fileToUpload: File,
    requestId?: Id<"clientPortalRequests">,
  ) {
    if (!token) return;
    if (fileToUpload.size > 25 * 1024 * 1024) {
      setUploadErr("Each file must be 25 MB or smaller.");
      return;
    }
    setUploadErr(null);
    setUploadNotice(null);
    setUploadBusy(true);
    try {
      const uploadUrl = await genUpload({
        sessionToken: token,
        fileId: file._id,
      });
      const { storageId } = await postFileToConvexUploadUrl(
        uploadUrl,
        fileToUpload,
      );
      await attachUpload({
        sessionToken: token,
        fileId: file._id,
        storageId: storageId as Id<"_storage">,
        fileName: fileToUpload.name,
        contentType: fileToUpload.type || undefined,
        size: fileToUpload.size,
        requestId,
      });
      setUploadNotice(fileToUpload.name);
      window.setTimeout(() => setUploadNotice(null), 12000);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setUploadErr(formatPortalTrustError(raw).detail ?? raw);
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/portal/files"
          className="text-xs font-medium text-primary hover:underline"
        >
          ← All files
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          {file.fileName}
        </h1>
        {workspaceName ? (
          <p className="mt-1 text-sm font-medium text-foreground/90">
            {workspaceName}
          </p>
        ) : null}
        {grant.label ? (
          <p className="text-sm text-muted-foreground">{grant.label}</p>
        ) : null}
        {grant.grantExpiresAt ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Your access to this file expires{" "}
            {new Date(grant.grantExpiresAt).toLocaleString()}.
          </p>
        ) : null}
        <dl className="mt-3 grid gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Pipeline stage</dt>
            <dd className="font-medium">{file.status}</dd>
          </div>
          {file.propertyAddress ? (
            <div>
              <dt className="text-muted-foreground">Property</dt>
              <dd>{file.propertyAddress}</dd>
            </div>
          ) : null}
          {file.scenario ? (
            <div>
              <dt className="text-muted-foreground">Scenario</dt>
              <dd className="line-clamp-3">{file.scenario}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Updates from your team</h2>
        <p className="text-xs text-muted-foreground">
          Summaries your lender posted for this file. For questions, contact them
          directly — messaging below is not instant legal advice.
        </p>
        {updates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No updates yet.</p>
        ) : (
          <ul className="space-y-2">
            {updates.map((u) => (
              <li
                key={u._id}
                className="rounded-lg border border-border bg-card/60 px-3 py-2 text-sm"
              >
                <div className="font-medium">{u.summary}</div>
                {u.detail ? (
                  <div className="mt-1 text-muted-foreground">{u.detail}</div>
                ) : null}
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(u.createdAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {token ? (
        <div className="mt-8">
          <PortalMessagingSection sessionToken={token} fileId={file._id} />
        </div>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Requested actions</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Uploads tied to a request are filed into the folder your loan team
            assigned — no extra sorting on their end.
          </p>
        </div>
        {actionErr ? (
          <TrustErrorBlock
            title="Could not update request"
            description={actionErr}
          />
        ) : null}
        {openRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing pending right now.
          </p>
        ) : (
          <div className="space-y-5">
            {groupedOpenRequests.map((group) => (
              <div key={group.heading} className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/90 px-3 py-2 dark:border-slate-700/80 dark:bg-slate-900/40">
                  <Folder
                    className="h-4 w-4 shrink-0 text-amber-600"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      {group.heading}
                    </div>
                    {group.folderPath ? (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {group.folderPath}
                      </div>
                    ) : null}
                  </div>
                </div>
                <ul className="space-y-3">
                  {group.items.map((r) => (
                    <li
                      key={r._id}
                      className="rounded-xl border border-amber-200/80 bg-white px-3 py-3 shadow-sm dark:border-amber-900/50 dark:bg-slate-900/50"
                    >
                      <div className="font-medium text-sm">{r.title}</div>
                      {r.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {r.description}
                        </p>
                      ) : null}
                      {r.folderPath ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Saves to{" "}
                          <span className="font-medium text-foreground">
                            {r.folderPath}
                          </span>
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canUpload ? (
                          <label
                            className={
                              uploadBusy
                                ? "inline-flex cursor-wait opacity-70"
                                : "inline-flex cursor-pointer"
                            }
                          >
                            <input
                              type="file"
                              className="sr-only"
                              disabled={uploadBusy}
                              onChange={(e) => {
                                const input = e.target;
                                const f = input.files?.[0];
                                input.value = "";
                                if (!f) return;
                                void uploadPortalFile(f, r._id);
                              }}
                            />
                            <span className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
                              {uploadBusy ? "Uploading…" : "Upload for this request"}
                            </span>
                          </label>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void (async () => {
                              setActionErr(null);
                              const note = window.prompt(
                                "Optional note for your loan officer (or leave blank):",
                              );
                              try {
                                await completeReq({
                                  sessionToken: token!,
                                  fileId: file._id,
                                  requestId: r._id,
                                  note: note?.trim() || undefined,
                                });
                              } catch (e) {
                                const raw =
                                  e instanceof Error ? e.message : String(e);
                                setActionErr(
                                  formatPortalTrustError(raw).detail ?? raw,
                                );
                              }
                            })()
                          }
                        >
                          Mark as done
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {sharedDocuments.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Shared by your loan officer</h2>
          <p className="text-xs text-muted-foreground">
            Documents your loan officer chose to share with you for this file.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {sharedDocuments.map((doc) => (
              <li key={doc._id}>
                <PortalSharedDocumentLink
                  sessionToken={token}
                  fileId={file._id}
                  documentId={doc._id}
                  label={doc.title || doc.fileName || "Document"}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Your documents</h2>
        {uploadErr ? (
          <TrustErrorBlock title="Upload did not complete" description={uploadErr} />
        ) : null}
        {uploadNotice ? <TrustUploadReceipt fileName={uploadNotice} /> : null}
        {canUpload ? (
          <p className="text-xs text-muted-foreground">
            PDF or images only. Maximum 25 MB per file. Uploads are scanned into
            this loan file — same visibility rules as other shared documents.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            You have view-only access; uploads are disabled. Contact your loan
            officer if you need to submit documents.
          </p>
        )}
        <label
          className={
            canUpload
              ? "inline-flex cursor-pointer"
              : "inline-flex cursor-not-allowed opacity-60"
          }
        >
          <input
            type="file"
            className="sr-only"
            disabled={uploadBusy || !canUpload}
            onChange={(e) => {
              const input = e.target;
              const f = input.files?.[0];
              input.value = "";
              if (!f) return;
              void uploadPortalFile(f);
            }}
          />
          <span className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted">
            {uploadBusy
              ? "Uploading…"
              : canUpload
                ? "Upload a file"
                : "Upload disabled"}
          </span>
        </label>
        <ul className="mt-2 space-y-1 text-sm">
          {uploads.map((u) => (
            <li key={u._id}>
              <PortalDownloadLink
                sessionToken={token}
                fileId={file._id}
                uploadId={u._id}
                label={u.fileName}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
        <h2 className="text-sm font-semibold">
          {identityHasPassword ? "Change password" : "Set a password (optional)"}
        </h2>
        <p className="text-xs text-muted-foreground">
          After you set a password, you can sign in from any device with your
          email and workspace — without a new magic link.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="password"
            autoComplete="new-password"
            placeholder={`New password (${plaintextPasswordRequirementSummary()})`}
            minLength={MIN_PLAINTEXT_PASSWORD_LENGTH}
            maxLength={MAX_PLAINTEXT_PASSWORD_LENGTH}
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Confirm"
            minLength={MIN_PLAINTEXT_PASSWORD_LENGTH}
            maxLength={MAX_PLAINTEXT_PASSWORD_LENGTH}
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        {pwMsg ? (
          <p className="text-xs text-muted-foreground">{pwMsg}</p>
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={() =>
            void (async () => {
              setPwMsg(null);
              const pwPolicy = validatePlaintextPasswordPolicy(pw1);
              if (pwPolicy) {
                setPwMsg(pwPolicy);
                return;
              }
              if (pw1 !== pw2) {
                setPwMsg("Passwords do not match.");
                return;
              }
              try {
                await setPassword({
                  sessionToken: token!,
                  newPassword: pw1,
                });
                setPw1("");
                setPw2("");
                setPwMsg("Password updated. You can sign in with it from any device.");
              } catch (e) {
                const raw = e instanceof Error ? e.message : String(e);
                const t = formatPortalTrustError(raw);
                setPwMsg(t.detail ?? t.title);
              }
            })()
          }
        >
          Save password
        </Button>
      </section>
    </div>
  );
}

function PortalSharedDocumentLink({
  sessionToken,
  fileId,
  documentId,
  label,
}: {
  sessionToken: string;
  fileId: Id<"pipeline">;
  documentId: Id<"libraryDocuments">;
  label: string;
}) {
  const res = useQuery(api.clientPortal.getSharedDocumentDownloadUrl, {
    sessionToken,
    fileId,
    documentId,
  });
  if (!res || res.status !== "ok" || !res.url) {
    return <span className="text-muted-foreground">{label}</span>;
  }
  return (
    <a
      href={res.url}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-primary underline"
    >
      {label}
    </a>
  );
}

function PortalDownloadLink({
  sessionToken,
  fileId,
  uploadId,
  label,
}: {
  sessionToken: string;
  fileId: Id<"pipeline">;
  uploadId: Id<"clientPortalUploads">;
  label: string;
}) {
  const res = useQuery(api.clientPortal.getUploadDownloadUrl, {
    sessionToken,
    fileId,
    uploadId,
  });
  if (!res || res.status !== "ok" || !res.url) {
    return <span className="text-muted-foreground">{label}</span>;
  }
  return (
    <a
      href={res.url}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-primary underline"
    >
      {label}
    </a>
  );
}
