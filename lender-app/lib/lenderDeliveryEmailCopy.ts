/**
 * Email-ready paste block after Deliver to Lender.
 * Mirrors Generate Client Link UX, but asks the lender to download (not upload).
 */

export type LenderDeliveryEmailItem = {
  title: string;
  /** Vault file-task / document-request description when present. */
  description?: string;
};

export function buildLenderDeliveryEmailCopy(
  items: readonly LenderDeliveryEmailItem[],
  portalUrl: string,
): string {
  const normalized: LenderDeliveryEmailItem[] = [];
  for (const item of items) {
    const title = item.title.trim();
    if (!title) continue;
    const description = item.description?.trim();
    const next: LenderDeliveryEmailItem = { title };
    if (description) next.description = description;
    normalized.push(next);
  }

  const bullets =
    normalized.length > 0
      ? normalized
          .map((item) => {
            if (item.description) {
              return `• ${item.title}\n  ${item.description}`;
            }
            return `• ${item.title}`;
          })
          .join("\n")
      : "• (documents)";

  const url = portalUrl.trim();
  return `${bullets}\n\nPlease download all documents securely using this link below:\n\n${url}`;
}

/**
 * Build email items from the operator's Deliver to Lender selection.
 * Prefer file-task titles + descriptions; then folders; then loose documents
 * (pulling description from the linked vault task when available).
 */
export function buildLenderDeliveryEmailItemsFromSelection(args: {
  selectedTaskIds: ReadonlySet<string>;
  selectedFolderIds: ReadonlySet<string>;
  selectedDocumentIds: ReadonlySet<string>;
  fileTasks: ReadonlyArray<{
    _id: { toString(): string } | string;
    title: string;
    description?: string;
    isArchived?: boolean;
  }>;
  folders: ReadonlyArray<{
    _id: { toString(): string } | string;
    name: string;
    fileTaskId?: { toString(): string } | string;
  }>;
  documents: ReadonlyArray<{
    _id: { toString(): string } | string;
    title: string;
    fileTaskId?: { toString(): string } | string;
  }>;
}): LenderDeliveryEmailItem[] {
  const items: LenderDeliveryEmailItem[] = [];
  const listedTaskKeys = new Set<string>();

  for (const task of args.fileTasks) {
    if (task.isArchived) continue;
    const id = String(task._id);
    if (!args.selectedTaskIds.has(id)) continue;
    listedTaskKeys.add(id);
    const next: LenderDeliveryEmailItem = {
      title: task.title.trim() || "Document request",
    };
    const description = task.description?.trim();
    if (description) next.description = description;
    items.push(next);
  }

  for (const folder of args.folders) {
    const id = String(folder._id);
    if (!args.selectedFolderIds.has(id)) continue;
    const parentTaskKey =
      folder.fileTaskId != null ? String(folder.fileTaskId) : null;
    if (parentTaskKey && listedTaskKeys.has(parentTaskKey)) continue;
    items.push({ title: folder.name.trim() || "Folder" });
  }

  const taskById = new Map(
    args.fileTasks.map((t) => [String(t._id), t] as const),
  );

  for (const doc of args.documents) {
    const id = String(doc._id);
    if (!args.selectedDocumentIds.has(id)) continue;
    const linkedTaskKey =
      doc.fileTaskId != null ? String(doc.fileTaskId) : null;
    if (linkedTaskKey && listedTaskKeys.has(linkedTaskKey)) continue;
    const linked = linkedTaskKey ? taskById.get(linkedTaskKey) : undefined;
    const next: LenderDeliveryEmailItem = {
      title: doc.title.trim() || "Document",
    };
    const description = linked?.description?.trim();
    if (description) next.description = description;
    items.push(next);
  }

  return items;
}
