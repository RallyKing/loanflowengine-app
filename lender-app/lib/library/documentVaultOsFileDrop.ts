import type { DragEvent } from "react";

/** True when the drag payload is native OS files (not @dnd-kit internal reorder). */
export function isOsFileDragEvent(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes("Files");
}

export function readOsFilesFromDragEvent(e: DragEvent): File[] {
  if (!isOsFileDragEvent(e)) return [];
  return Array.from(e.dataTransfer.files ?? []);
}
