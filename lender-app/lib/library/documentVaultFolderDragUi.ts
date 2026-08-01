import type { DragOverEvent } from "@dnd-kit/core";
import type { Id } from "@/convex/_generated/dataModel";
import {
  parseVaultFolderDropId,
  parseVaultFolderSortableId,
  VAULT_DROP_FOLDER_PREFIX,
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

/** Resolve folder id from droppable or sortable collision id. */
export function parseVaultFolderTargetId(
  overId: string,
): Id<"documentFolders"> | null | undefined {
  const drop = parseVaultFolderDropId(overId);
  if (drop !== undefined) return drop;
  const sort = parseVaultFolderSortableId(overId);
  return sort ?? undefined;
}

function pointerYInOverRect(event: DragOverEvent): number | null {
  const overRect = event.over?.rect;
  if (!overRect) return null;
  const translated = event.active.rect.current.translated;
  if (translated) {
    return translated.top + translated.height / 2;
  }
  const initial = event.active.rect.current.initial;
  if (initial) {
    return initial.top + initial.height / 2;
  }
  return overRect.top + overRect.height / 2;
}

export function resolveFolderDragVisual(
  event: DragOverEvent,
): FolderDragVisualState {
  const activeFolderId = parseVaultFolderSortableId(String(event.active.id));
  if (!activeFolderId || !event.over) {
    return EMPTY_FOLDER_DRAG_VISUAL;
  }

  const overId = String(event.over.id);
  const overDropId = parseVaultFolderDropId(overId);
  const overSortId = parseVaultFolderSortableId(overId);

  if (overId.startsWith(VAULT_DROP_FOLDER_PREFIX) && overDropId !== undefined) {
    if (overDropId === activeFolderId) {
      return EMPTY_FOLDER_DRAG_VISUAL;
    }
    return {
      mode: "nest",
      nestTargetFolderId: overDropId,
      insertBeforeFolderId: null,
    };
  }

  if (overSortId && overSortId !== activeFolderId) {
    const pointerY = pointerYInOverRect(event);
    const overRect = event.over.rect;
    if (pointerY != null && overRect.height > 0) {
      const relative = (pointerY - overRect.top) / overRect.height;
      if (relative > 0.2 && relative < 0.8) {
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
    return {
      mode: "nest",
      nestTargetFolderId: overSortId,
      insertBeforeFolderId: null,
    };
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

/** Folder under pointer during drag (for auto-expand). */
export function resolveFolderDragHoverExpandTarget(
  event: DragOverEvent,
): Id<"documentFolders"> | null {
  if (!event.over) return null;
  const target = parseVaultFolderTargetId(String(event.over.id));
  if (target === undefined || target === null) return null;
  return target;
}
