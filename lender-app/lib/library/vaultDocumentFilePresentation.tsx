"use client";

import type { ComponentType } from "react";
import {
  Archive,
  FileIcon,
  FileSpreadsheet,
  FileText,
  FileType,
  ImageIcon,
  PenLine,
  Presentation,
  Video,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  guessAttachmentKind,
  type AttachmentKind,
} from "@/lib/uploadToConvexStorage";
import {
  isCreatedVaultHtmlDocument,
  splitVaultFileName,
  vaultDocumentOutboundFileName,
} from "@/lib/library/vaultOutboundFileName";
import type { LibraryDocumentListRow } from "@/components/library/LibraryDocumentsList";

export type VaultDocumentPresentationRow = Pick<
  LibraryDocumentListRow,
  "title" | "latestContentType" | "latestFileName"
>;

const KIND_LABELS: Record<AttachmentKind, string> = {
  image: "Image",
  pdf: "PDF",
  html: "HTML",
  text: "Text",
  spreadsheet: "Sheet",
  word: "Word",
  presentation: "Slides",
  video: "Video",
  archive: "Zip",
  other: "File",
};

export function resolveVaultDocumentTypeLabel(
  row: VaultDocumentPresentationRow,
): string {
  if (isCreatedVaultHtmlDocument(row)) return "Created doc";

  const outbound = vaultDocumentOutboundFileName(row);
  const { ext } = splitVaultFileName(outbound);
  if (ext.length > 1) {
    return ext.slice(1).toUpperCase();
  }

  const kind = guessAttachmentKind(row.latestContentType, outbound);
  return KIND_LABELS[kind];
}

type VaultDocumentIconKind = AttachmentKind | "created";

function resolveVaultDocumentIconKind(
  row: VaultDocumentPresentationRow,
): VaultDocumentIconKind {
  if (isCreatedVaultHtmlDocument(row)) return "created";

  const outbound = vaultDocumentOutboundFileName(row);
  return guessAttachmentKind(row.latestContentType, outbound);
}

const ICON_BY_KIND: Record<
  VaultDocumentIconKind,
  ComponentType<{ className?: string }>
> = {
  created: PenLine,
  image: ImageIcon,
  pdf: FileText,
  html: FileText,
  text: FileText,
  spreadsheet: FileSpreadsheet,
  word: FileType,
  presentation: Presentation,
  video: Video,
  archive: Archive,
  other: FileIcon,
};

const ICON_TONE_BY_KIND: Partial<Record<VaultDocumentIconKind, string>> = {
  created: "text-violet-600/80 dark:text-violet-400/80",
  image: "text-sky-600/80 dark:text-sky-400/80",
  pdf: "text-rose-600/80 dark:text-rose-400/80",
  spreadsheet: "text-emerald-600/80 dark:text-emerald-400/80",
  word: "text-blue-600/80 dark:text-blue-400/80",
  presentation: "text-orange-600/80 dark:text-orange-400/80",
  video: "text-amber-700/80 dark:text-amber-400/80",
  archive: "text-stone-600/80 dark:text-stone-400/80",
};

export function VaultDocumentTypeIcon({
  row,
  className,
}: {
  row: VaultDocumentPresentationRow;
  className?: string;
}) {
  const kind = resolveVaultDocumentIconKind(row);
  const Icon = ICON_BY_KIND[kind];
  return (
    <Icon
      className={cn(
        "shrink-0 text-primary/70",
        ICON_TONE_BY_KIND[kind],
        className,
      )}
      aria-hidden
    />
  );
}

export function VaultDocumentFileTitle({
  row,
  className,
  titleClassName,
  typeClassName,
  "data-testid": dataTestId,
}: {
  row: VaultDocumentPresentationRow;
  className?: string;
  titleClassName?: string;
  typeClassName?: string;
  "data-testid"?: string;
}) {
  const typeLabel = resolveVaultDocumentTypeLabel(row);

  return (
    <span className={cn("min-w-0", className)} data-testid={dataTestId}>
      <span className={titleClassName}>{row.title}</span>
      <span
        className={cn("font-normal text-muted-foreground", typeClassName)}
      >
        {" · "}
        {typeLabel}
      </span>
    </span>
  );
}
