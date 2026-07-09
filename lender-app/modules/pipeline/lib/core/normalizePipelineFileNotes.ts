import type { Id } from "@/convex/_generated/dataModel";
import type {
  ClientPipelineFileNoteQueryRow,
  ClientPipelineFileNoteView,
  PipelineFileNoteAttachmentView,
  PipelineFileNoteLinkView,
  PipelineFileNoteQueryRow,
  PipelineFileNoteView,
} from "@/lib/pipeline/pipelineFileNotesTypes";

function normalizeLink(raw: unknown): PipelineFileNoteLinkView | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const url = typeof row.url === "string" ? row.url.trim() : "";
  if (!url) return null;
  const _id = row._id as Id<"pipelineFileNoteLinks">;
  const label =
    typeof row.label === "string" && row.label.trim()
      ? row.label.trim()
      : typeof row.title === "string" && row.title.trim()
        ? row.title.trim()
        : undefined;
  const displayLabel =
    typeof row.displayLabel === "string" && row.displayLabel.trim()
      ? row.displayLabel.trim()
      : label ?? url;
  return { _id, url, label, displayLabel };
}

function normalizeAttachment(raw: unknown): PipelineFileNoteAttachmentView | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const storageId = row.storageId as Id<"_storage">;
  const fileName =
    typeof row.fileName === "string" ? row.fileName : "attachment";
  const mimeType =
    typeof row.mimeType === "string" ? row.mimeType : "application/octet-stream";
  const size = typeof row.size === "number" ? row.size : 0;
  const url =
    typeof row.url === "string" && row.url.trim() ? row.url.trim() : null;
  return { storageId, fileName, mimeType, size, url };
}

/** Map Convex query rows to a stable UI shape (Phase 24.5.1 hydration guard). */
export function normalizePipelineFileNoteRow(
  row: PipelineFileNoteQueryRow | Record<string, unknown>,
): PipelineFileNoteView {
  const r = row as PipelineFileNoteQueryRow;
  const rawLinks = (r as { links?: unknown }).links;
  const links: PipelineFileNoteLinkView[] = Array.isArray(rawLinks)
    ? rawLinks
        .map(normalizeLink)
        .filter((x): x is PipelineFileNoteLinkView => x != null)
    : [];

  const rawAttachments = r.attachments;
  const attachments: PipelineFileNoteAttachmentView[] = Array.isArray(
    rawAttachments,
  )
    ? rawAttachments
        .map(normalizeAttachment)
        .filter((x): x is PipelineFileNoteAttachmentView => x != null)
    : [];

  return {
    _id: r._id,
    _creationTime: r._creationTime,
    content: typeof r.content === "string" ? r.content : "",
    authorUserKey: r.authorUserKey,
    authorDisplayName: r.authorDisplayName ?? "",
    attachments,
    links,
    isPinned: r.isPinned === true,
    pinnedAt: typeof r.pinnedAt === "number" ? r.pinnedAt : undefined,
    canDelete: r.canDelete === true,
    canPin: r.canPin === true,
    canEditContent: r.canEditContent === true,
    noteKind:
      (r as { noteKind?: string }).noteKind === "attempt" ? "attempt" : "standard",
    linkedTaskId: (r as { linkedTaskId?: Id<"tasks"> }).linkedTaskId,
    taskName:
      typeof (r as { taskName?: string }).taskName === "string" &&
      (r as { taskName: string }).taskName.trim()
        ? (r as { taskName: string }).taskName.trim()
        : undefined,
    attemptNumber:
      typeof (r as { attemptNumber?: number }).attemptNumber === "number"
        ? (r as { attemptNumber: number }).attemptNumber
        : undefined,
  };
}

export function normalizePipelineFileNotes(
  rows: PipelineFileNoteQueryRow[] | undefined,
): PipelineFileNoteView[] {
  if (!rows) return [];
  return rows.map(normalizePipelineFileNoteRow);
}

export function normalizeClientPipelineFileNoteRow(
  row: ClientPipelineFileNoteQueryRow | Record<string, unknown>,
): ClientPipelineFileNoteView {
  const base = normalizePipelineFileNoteRow(row);
  const r = row as ClientPipelineFileNoteQueryRow;
  const fileTitle =
    typeof r.fileTitle === "string" && r.fileTitle.trim()
      ? r.fileTitle.trim()
      : typeof r.fileName === "string" && r.fileName.trim()
        ? r.fileName.trim()
        : "Untitled file";
  return {
    ...base,
    pipelineFileId: r.pipelineFileId as Id<"pipeline">,
    fileName: fileTitle,
    fileTitle,
  };
}

export function normalizeClientPipelineFileNotes(
  rows: ClientPipelineFileNoteQueryRow[] | undefined,
): ClientPipelineFileNoteView[] {
  if (!rows) return [];
  return rows.map(normalizeClientPipelineFileNoteRow);
}
