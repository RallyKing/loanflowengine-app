/**
 * @mention tokens in free-form text (user keys / handles). Used for notifications.
 * Pattern: whitespace or start + @ + 1–80 chars alnum, dot, underscore, hyphen.
 */
const MENTION_RE = /(?:^|[\s])@([a-zA-Z0-9_.-]{1,80})/g;

export function extractMentionHandles(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, MENTION_RE.flags);
  while ((m = re.exec(text)) !== null) {
    const h = m[1]?.trim();
    if (h) out.add(h);
  }
  return [...out];
}

export function newMentionHandlesOnly(
  previousText: string | undefined,
  nextText: string | undefined,
): string[] {
  const prev = new Set(extractMentionHandles(previousText ?? ""));
  return extractMentionHandles(nextText ?? "").filter((h) => !prev.has(h));
}
