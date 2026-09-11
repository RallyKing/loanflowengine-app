"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, FileText, Upload } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { postFileToConvexUploadUrl } from "@/lib/uploadToConvexStorage";
import {
  buildVerifyAccessPath,
  readPortalAccessProof,
} from "@/lib/portalAccessProof";
import { FileTaskClientTemplateDownloads } from "@/components/library/FileTaskClientTemplateAttach";

type FileTaskUploadPortalClientProps = {
  taskToken: string;
};

export function FileTaskUploadPortalClient({
  taskToken,
}: FileTaskUploadPortalClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const accessProof = readPortalAccessProof(taskToken);
  const portal = useQuery(api.documentVaultFileTaskUploadPortal.getPortalByToken, {
    token: taskToken,
    accessProof,
  });
  const generateUploadUrl = useMutation(
    api.documentVaultFileTaskUploadPortal.generateUploadUrl,
  );
  const ingestUpload = useMutation(
    api.documentVaultFileTaskUploadPortal.ingestUpload,
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [uploadedTitles, setUploadedTitles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (portal?.status !== "verification_required") return;
    router.replace(buildVerifyAccessPath(taskToken, pathname || `/upload/${taskToken}`));
  }, [pathname, portal?.status, router, taskToken]);

  const uploading = uploadProgress !== null;

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const list = files.filter((f) => f.size > 0);
      if (list.length === 0 || uploading) return;
      setError(null);
      setUploadProgress({ current: 0, total: list.length });
      const uploaded: string[] = [];
      try {
        for (let index = 0; index < list.length; index++) {
          const file = list[index]!;
          setUploadProgress({ current: index + 1, total: list.length });
          const postUrl = await generateUploadUrl({ token: taskToken });
          const { storageId } = await postFileToConvexUploadUrl(postUrl, file);
          const result = await ingestUpload({
            token: taskToken,
            storageId: storageId as Id<"_storage">,
            fileName: file.name,
            contentType: file.type || undefined,
            size: file.size,
          });
          uploaded.push(result.title);
        }
        setUploadedTitles((prev) => [...uploaded, ...prev]);
      } catch (e) {
        if (uploaded.length > 0) {
          setUploadedTitles((prev) => [...uploaded, ...prev]);
        }
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setUploadProgress(null);
      }
    },
    [generateUploadUrl, ingestUpload, taskToken, uploading],
  );

  const onFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      void uploadFiles(list);
    },
    [uploadFiles],
  );

  if (portal === undefined || portal.status === "verification_required") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white px-6">
        <div className="h-8 w-48 animate-pulse rounded-dlc-md bg-neutral-100" />
      </div>
    );
  }

  if (portal.status === "revoked") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white px-6">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold text-neutral-900">Link Revoked</h1>
          <p className="mt-2 text-sm text-neutral-600">
            This upload link has been revoked. Contact your lender for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (portal.status !== "ok") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white px-6">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold text-neutral-900">
            Link unavailable
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            {portal.status === "expired"
              ? "This upload link has expired. Contact your loan officer for a new link."
              : "This upload link is invalid or has been revoked."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-white text-neutral-900">
      <div className="mx-auto flex w-full max-w-xl flex-col px-6 py-12">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          {portal.workspaceName}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
          {portal.taskTitle}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Loan file: {portal.fileLabel}
          {portal.isRequired ? (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
              Required
            </span>
          ) : null}
        </p>

        {portal.clientTemplates && portal.clientTemplates.length > 0 ? (
          <FileTaskClientTemplateDownloads
            templates={portal.clientTemplates}
            className="mt-6"
          />
        ) : null}

        <div
          className={cn(
            "mt-10 flex min-h-[16rem] cursor-pointer flex-col items-center justify-center rounded-dlc-lg border-2 border-dashed px-6 py-14 text-center transition-colors duration-dlc-standard ease-dlc-standard",
            dragOver
              ? "border-emerald-600 bg-emerald-50/80"
              : "border-neutral-300 bg-neutral-50/50 hover:border-emerald-500/60 hover:bg-emerald-50/30",
            uploading && "pointer-events-none opacity-70",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          data-testid="file-task-upload-dropzone"
        >
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            multiple
            accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
            onChange={(e) => {
              if (e.target.files) onFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            {uploading ? (
              <FileText className="h-7 w-7 animate-pulse" aria-hidden />
            ) : (
              <Upload className="h-7 w-7" aria-hidden />
            )}
          </div>
          <p className="mt-5 text-lg font-medium text-neutral-900">
            {uploading
              ? uploadProgress && uploadProgress.total > 1
                ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}…`
                : "Uploading…"
              : "Drop your files here"}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            or click to browse · multiple files · up to 25 MB each
          </p>
        </div>

        {uploadedTitles.length > 0 ? (
          <div
            className="mt-6 rounded-dlc-lg border border-emerald-200 bg-emerald-50 px-4 py-4"
            data-testid="file-task-upload-success"
          >
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              {uploadedTitles.length === 1
                ? "1 file received"
                : `${uploadedTitles.length} files received`}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-emerald-800">
              {uploadedTitles.map((title, index) => (
                <li key={`${title}-${index}`} className="truncate">
                  {title}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-emerald-700">
              You can keep uploading more files to this request.
            </p>
          </div>
        ) : null}

        {error ? (
          <p
            className="mt-4 text-center text-sm text-red-600"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <p className="mt-10 text-center text-xs text-neutral-400">
          Secure document upload · Files go directly to your loan officer
        </p>
      </div>
    </div>
  );
}
