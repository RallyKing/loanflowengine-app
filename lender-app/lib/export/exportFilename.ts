const SAFE = /[^a-z0-9._-]+/gi;

/** YYYY-MM-DD in local time (stable for filenames). */
export function exportDateStamp(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * `{module}-{tag1}-{tag2}-{date}.{ext}` — tags are slugged; empty segments dropped.
 */
export function buildExportFilename(
  module: string,
  ext: string,
  tags: string[] = []
): string {
  const slug = (s: string) =>
    s
      .trim()
      .replace(SAFE, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .toLowerCase();
  const parts = [slug(module), ...tags.map(slug).filter(Boolean), exportDateStamp()].filter(
    Boolean
  );
  const base = parts.join("-").replace(/-+/g, "-");
  const cleanExt = ext.replace(/^\./, "");
  return `${base}.${cleanExt}`;
}
