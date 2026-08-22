import { parseJsonUnknown } from "@/lib/safeJson";

/** Align with server `convex/lenderFiles.ts` — keeps uploads reasonable on mobile networks. */
export const MAX_LENDER_ATTACHMENT_BYTES = 80 * 1024 * 1024;

/** Task attachments use the same per-file cap as lender uploads. */
export const MAX_TASK_ATTACHMENT_BYTES = MAX_LENDER_ATTACHMENT_BYTES;

/**
 * Returns an error message if the file should not be uploaded, or `null` if OK.
 */
export function validateLenderAttachmentFile(file: File): string | null {
  if (!file || file.size <= 0) {
    return "File is empty.";
  }
  if (file.size > MAX_LENDER_ATTACHMENT_BYTES) {
    const mb = Math.round(MAX_LENDER_ATTACHMENT_BYTES / (1024 * 1024));
    return `File is too large (max ${mb} MB per file).`;
  }
  return null;
}

/** Alias for task UI — same rules as lender attachments. */
export const validateTaskAttachmentFile = validateLenderAttachmentFile;

/**
 * Client-side upload to a Convex `generateUploadUrl` URL.
 * Sets Content-Type (empty `File.type` breaks some paths) and parses the JSON body.
 */
export async function postFileToConvexUploadUrl(
  postUrl: string,
  file: File,
  opts?: {
    signal?: AbortSignal;
    validateFile?: (file: File) => string | null;
  },
): Promise<{ storageId: string }> {
  const validate = opts?.validateFile ?? validateLenderAttachmentFile;
  const err = validate(file);
  if (err) throw new Error(err);

  const contentType = file.type?.trim()
    ? file.type
    : "application/octet-stream";

  const res = await fetch(postUrl, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
    },
    body: file,
    cache: "no-store",
    mode: "cors",
    credentials: "omit",
    signal: opts?.signal,
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(
      raw?.trim()
        ? `Upload failed (${res.status}): ${raw.slice(0, 240)}`
        : `Upload failed (HTTP ${res.status}). Check Convex file storage and network.`
    );
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(
      "Empty response from upload URL — is Convex file storage enabled for this deployment?"
    );
  }

  const parsed = parseJsonUnknown(trimmed) as { storageId?: unknown } | undefined;
  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      `Invalid JSON from upload (got: ${trimmed.slice(0, 120)}…). Is Convex file storage enabled?`
    );
  }
  const storageId = parsed.storageId;
  if (typeof storageId !== "string" || !storageId.trim()) {
    throw new Error("Upload response missing storageId");
  }
  return { storageId: storageId.trim() };
}

/** Org white-label logos — small images only. */
export const MAX_BRANDING_LOGO_BYTES = 2 * 1024 * 1024;

/** Inline document editor images — PNG/JPEG/WebP/GIF only. */
export const MAX_DOCUMENT_EDITOR_IMAGE_BYTES = 15 * 1024 * 1024;

const DOCUMENT_EDITOR_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export function validateDocumentEditorImageFile(file: File): string | null {
  if (!file || file.size <= 0) {
    return "File is empty.";
  }
  if (file.size > MAX_DOCUMENT_EDITOR_IMAGE_BYTES) {
    const mb = Math.round(MAX_DOCUMENT_EDITOR_IMAGE_BYTES / (1024 * 1024));
    return `Image must be ${mb} MB or smaller.`;
  }
  const t = file.type?.trim().toLowerCase() ?? "";
  if (t && !DOCUMENT_EDITOR_IMAGE_TYPES.has(t)) {
    return "Use PNG, JPEG, WebP, or GIF.";
  }
  const n = file.name.toLowerCase();
  if (
    !t &&
    !/\.(png|jpe?g|webp|gif)$/i.test(n)
  ) {
    return "Use PNG, JPEG, WebP, or GIF.";
  }
  return null;
}

export function validateBrandingLogoFile(file: File): string | null {
  if (!file || file.size <= 0) {
    return "File is empty.";
  }
  if (file.size > MAX_BRANDING_LOGO_BYTES) {
    return "Logo must be 2 MB or smaller.";
  }
  const t = file.type?.trim().toLowerCase() ?? "";
  if (t && !t.startsWith("image/")) {
    return "Logo must be an image (PNG, JPEG, WebP, SVG, or GIF).";
  }
  return null;
}

/** Payload passed to your mutation after each successful POST to the upload URL. */
export type ConvexAttachmentUploadPayload = {
  storageId: string;
  fileName: string;
  contentType?: string;
  size: number;
};

/**
 * Shared upload pipeline for **lender** and **task** attachments (and any
 * future entity): validate → `generateUploadUrl` → `postFileToConvexUploadUrl`
 * → `commitEach` (mutation linking `_storage` to the parent row).
 */
export async function uploadLocalFilesViaConvexUrl(options: {
  files: File[];
  generateUploadUrl: () => Promise<string>;
  commitEach: (payload: ConvexAttachmentUploadPayload) => Promise<void>;
  validateFile?: (file: File) => string | null;
  onProgress?: (current: number, total: number) => void;
}): Promise<{ ok: number; failures: string[]; attempted: number }> {
  const validate = options.validateFile ?? validateLenderAttachmentFile;
  const multi = options.files.length > 1;
  const items: File[] = [];
  const failures: string[] = [];
  for (const file of options.files) {
    const v = validate(file);
    if (v) {
      failures.push(multi ? `${file.name}: ${v}` : v);
      continue;
    }
    items.push(file);
  }
  if (!items.length) {
    return {
      ok: 0,
      failures:
        failures.length > 0 ? failures : ["No valid files to upload."],
      attempted: 0,
    };
  }

  let ok = 0;
  const total = items.length;
  for (let i = 0; i < items.length; i++) {
    options.onProgress?.(i + 1, total);
    const file = items[i]!;
    try {
      const postUrl = await options.generateUploadUrl();
      const { storageId } = await postFileToConvexUploadUrl(postUrl, file);
      await options.commitEach({
        storageId,
        fileName: file.name,
        contentType: file.type || undefined,
        size: file.size,
      });
      ok += 1;
    } catch (caught) {
      const msg = caught instanceof Error ? caught.message : "Upload failed";
      failures.push(multi ? `${file.name}: ${msg}` : msg);
    }
  }
  return { ok, failures, attempted: total };
}

export type AttachmentKind =
  | "image"
  | "pdf"
  | "html"
  | "text"
  | "spreadsheet"
  | "word"
  | "other";

export function guessAttachmentKind(
  contentType: string | undefined,
  fileName: string,
): AttachmentKind {
  const ct = (contentType || "").toLowerCase();
  const n = fileName.toLowerCase();
  if (ct.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i.test(n)) {
    return "image";
  }
  if (ct === "application/pdf" || n.endsWith(".pdf")) {
    return "pdf";
  }
  if (
    ct === "text/html" ||
    ct.includes("html") ||
    n.endsWith(".html") ||
    n.endsWith(".htm")
  ) {
    return "html";
  }
  if (
    ct.includes("spreadsheet") ||
    ct.includes("excel") ||
    ct === "text/csv" ||
    ct === "application/csv" ||
    /\.(xlsx|xls|csv)$/i.test(n)
  ) {
    return "spreadsheet";
  }
  if (
    ct.includes("wordprocessingml") ||
    ct.includes("msword") ||
    /\.(docx|doc)$/i.test(n)
  ) {
    return "word";
  }
  if (ct.startsWith("text/") || /\.(txt|md|log)$/i.test(n)) {
    return "text";
  }
  return "other";
}
