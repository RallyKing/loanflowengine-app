/**
 * Canonical Document Vault outbound file identity (download, ZIP entry,
 * lender package, portal). Rename historically only patched `title` while
 * `latestFileName` / version `fileName` stayed as the upload name — this
 * helper prefers the renamed title and preserves the blob extension.
 */

const MAX_NAME_LEN = 255;

function sanitizeFileNameSegment(name: string): string {
  return name.replace(/[/\\]/g, "").trim();
}

/** Split `stem` + extension (`.pdf`); leading-dot names have no extension. */
export function splitVaultFileName(fileName: string): {
  stem: string;
  ext: string;
} {
  const cleaned = sanitizeFileNameSegment(fileName);
  const lastDot = cleaned.lastIndexOf(".");
  if (lastDot > 0 && lastDot < cleaned.length - 1) {
    return {
      stem: cleaned.slice(0, lastDot),
      ext: cleaned.slice(lastDot),
    };
  }
  return { stem: cleaned, ext: "" };
}

/**
 * Treat a title suffix as an explicit extension change only when it looks like
 * a short file extension (e.g. `.docx`), not a dotted display name (`My.Report`).
 */
function looksLikeExplicitExtension(ext: string): boolean {
  return /^\.[a-zA-Z0-9]{1,5}$/.test(ext);
}

/**
 * Resolve the file name used for downloads, ZIP packages, and lender delivery.
 * When `title` diverges from the stored upload stem (historical rename), prefer
 * the title and keep the stored extension unless the title already includes a
 * different short extension.
 */
export function resolveVaultOutboundFileName(
  title: string | undefined | null,
  storedFileName: string | undefined | null,
): string {
  const stored = sanitizeFileNameSegment(storedFileName ?? "");
  const titleRaw = sanitizeFileNameSegment(title ?? "");

  if (!titleRaw && !stored) return "file";
  if (!titleRaw) return stored.slice(0, MAX_NAME_LEN);
  if (!stored) return titleRaw.slice(0, MAX_NAME_LEN) || "file";

  const { stem: storedStem, ext: storedExt } = splitVaultFileName(stored);
  const titleParts = splitVaultFileName(titleRaw);
  const titleHasExplicitExt =
    titleParts.ext.length > 0 && looksLikeExplicitExtension(titleParts.ext);

  if (
    titleHasExplicitExt &&
    titleParts.ext.toLowerCase() !== storedExt.toLowerCase()
  ) {
    return titleRaw.slice(0, MAX_NAME_LEN) || "file";
  }

  // Strip matching stored extension from title if the user typed it back in.
  let titleBase = titleRaw;
  if (
    storedExt &&
    titleRaw.toLowerCase().endsWith(storedExt.toLowerCase())
  ) {
    titleBase = titleRaw.slice(0, -storedExt.length).trimEnd();
  } else if (titleHasExplicitExt) {
    titleBase = titleParts.stem;
  }

  if (!titleBase) {
    return stored.slice(0, MAX_NAME_LEN);
  }

  if (titleBase !== storedStem) {
    return `${titleBase}${storedExt}`.slice(0, MAX_NAME_LEN) || "file";
  }

  return stored.slice(0, MAX_NAME_LEN);
}

/** Convenience for library document rows. */
export function vaultDocumentOutboundFileName(doc: {
  title?: string | null;
  latestFileName?: string | null;
}): string {
  return resolveVaultOutboundFileName(doc.title, doc.latestFileName);
}

function hasHtmlExtension(fileName?: string | null): boolean {
  const lower = (fileName ?? "").toLowerCase();
  return lower.endsWith(".html") || lower.endsWith(".htm");
}

/**
 * Editor-created vault documents are stored as HTML (`htmlDocumentToVaultFile`).
 * Uploaded native PDFs / images / office files are not.
 */
export function isCreatedVaultHtmlDocument(doc: {
  latestContentType?: string | null;
  latestFileName?: string | null;
  title?: string | null;
}): boolean {
  const ct = (doc.latestContentType ?? "").toLowerCase();
  if (ct.includes("html")) return true;
  return hasHtmlExtension(doc.latestFileName) || hasHtmlExtension(doc.title);
}

function hasImageExtension(fileName?: string | null): boolean {
  const lower = (fileName ?? "").toLowerCase();
  return /\.(png|jpe?g|webp|gif)$/i.test(lower);
}

/**
 * Standalone uploaded vault images (not editor-created HTML with embeds).
 * These keep original download and also support Download PDF.
 */
export function isVaultImageDocument(doc: {
  latestContentType?: string | null;
  latestFileName?: string | null;
  title?: string | null;
}): boolean {
  if (isCreatedVaultHtmlDocument(doc)) return false;
  const ct = (doc.latestContentType ?? "").toLowerCase();
  if (ct.startsWith("image/")) return true;
  return hasImageExtension(doc.latestFileName) || hasImageExtension(doc.title);
}

export type VaultDownloadFormat = "pdf" | "original";

/** Default single-file / ZIP entry format for a vault document. */
export function defaultVaultDownloadFormat(doc: {
  latestContentType?: string | null;
  latestFileName?: string | null;
  title?: string | null;
}): VaultDownloadFormat {
  return isCreatedVaultHtmlDocument(doc) ? "pdf" : "original";
}

/**
 * Outbound download name when exporting a vault document as PDF.
 * Uses the renamed canonical title and forces a `.pdf` extension.
 */
export function vaultOutboundPdfFileName(
  title: string | undefined | null,
  storedFileName: string | undefined | null,
): string {
  const outbound = resolveVaultOutboundFileName(title, storedFileName);
  const { stem, ext } = splitVaultFileName(outbound);
  if (ext.toLowerCase() === ".pdf") {
    return outbound.slice(0, MAX_NAME_LEN);
  }
  const base = stem || outbound || "document";
  return `${base}.pdf`.slice(0, MAX_NAME_LEN);
}

/**
 * Write-path identity after a vault rename / retitle.
 * Updates both display title and canonical `latestFileName` / version `fileName`.
 */
export function vaultFileIdentityFromRename(
  newTitle: string,
  previousFileName: string | undefined | null,
): { title: string; fileName: string } {
  const title =
    sanitizeFileNameSegment(newTitle).slice(0, 400) || "Document";
  const fileName = resolveVaultOutboundFileName(title, previousFileName);
  return { title, fileName };
}
