import type { DragOverEvent } from "@dnd-kit/core";
import type { Id } from "@/convex/_generated/dataModel";
import {
  parseVaultFolderDropId,
  parseVaultFolderSortableId,
} from "@/lib/library/documentVaultDnD";

export type FolderDragVisualState = {
  mode: "nest" | "insert";
  /** Folder to nest into (null = root). */
  nestTargetFolderId: Id<"documentFolders"> | null;
  /** Show insertion line before this sibling folder. */
  insertBeforeFolderId: Id<"documentFolders"> | null;
};

export const EMPTY_FOLDER_DRAG_VISUAL: FolderDragVisualState = {
  mode: "insert",
  nestTargetFolderId: null,
  insertBeforeFolderId: null,
};

export function resolveFolderDragVisual(
  event: DragOverEvent,
): FolderDragVisualState {
  const activeFolderId = parseVaultFolderSortableId(String(event.active.id));
  if (!activeFolderId || !event.over) {
    return EMPTY_FOLDER_DRAG_VISUAL;
  }

  const overSortId = parseVaultFolderSortableId(String(event.over.id));
  const overDropId = parseVaultFolderDropId(String(event.over.id));

  if (overSortId && overSortId !== activeFolderId) {
    const translated = event.active.rect.current.translated;
    const overRect = event.over.rect;
    if (translated && overRect.height > 0) {
      const pointerY = translated.top + translated.height / 2;
      const relative = (pointerY - overRect.top) / overRect.height;
      if (relative > 0.28 && relative < 0.72) {
        return {
          mode: "nest",
          nestTargetFolderId: overSortId,
          insertBeforeFolderId: null,
        };
      }
      return {
        mode: "insert",
        nestTargetFolderId: null,
        insertBeforeFolderId: overSortId,
      };
    }
  }

  if (overDropId !== undefined && overDropId !== activeFolderId) {
    return {
      mode: "nest",
      nestTargetFolderId: overDropId,
      insertBeforeFolderId: null,
    };
  }

  return EMPTY_FOLDER_DRAG_VISUAL;
}
