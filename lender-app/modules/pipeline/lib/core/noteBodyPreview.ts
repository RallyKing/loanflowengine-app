/** Deal Info / file notes — truncated body preview + history page size. */

export const NOTE_BODY_PREVIEW_MAX_CHARS = 220;
export const NOTE_BODY_PREVIEW_MAX_LINES = 4;
/** Latest unpinned notes shown before “Show remaining”. */
export const NOTE_HISTORY_INITIAL_VISIBLE = 5;

/**
 * Whether a note body should start collapsed behind Show more.
 */
export function noteBodyNeedsPreview(
  content: string,
  maxChars = NOTE_BODY_PREVIEW_MAX_CHARS,
  maxLines = NOTE_BODY_PREVIEW_MAX_LINES,
): boolean {
  const text = content.replace(/\r\n/g, "\n");
  if (!text.trim()) return false;
  if (text.split("\n").length > maxLines) return true;
  return text.length > maxChars;
}

/**
 * Truncated preview for collapsed note bodies (preserves leading lines).
 */
export function truncateNoteBodyPreview(
  content: string,
  maxChars = NOTE_BODY_PREVIEW_MAX_CHARS,
  maxLines = NOTE_BODY_PREVIEW_MAX_LINES,
): string {
  const text = content.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  let preview =
    lines.length > maxLines ? lines.slice(0, maxLines).join("\n") : text;
  if (preview.length > maxChars) {
    const cut = preview.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(" ");
    preview =
      lastSpace > Math.floor(maxChars * 0.55)
        ? cut.slice(0, lastSpace)
        : cut;
  }
  return preview.replace(/\s+$/u, "") + "…";
}
