/**
 * Draft term options from Generate Terms in PipelineDrawer. `key` is
 * client-only; formatters use rate/term/prepay/notes only.
 */
export type TermOptionFields = {
  rate: string;
  term: string;
  prepaymentPenalty: string;
  notes: string;
};

const EM_DASH = "—";

function lineValue(s: string): string {
  const t = s.trim();
  return t || EM_DASH;
}

/**
 * Bullet-point term sheet, one block per option.
 * ```
 * Option 1:
 * - Rate: …
 * - Term: …
 * - Prepayment: …
 * ```
 * Notes are included as an extra line when non-empty.
 */
export function formatTermOptionsBulletTermSheet(
  options: ReadonlyArray<TermOptionFields>
): string {
  if (options.length === 0) return "";
  const blocks: string[] = [];
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    const lines = [
      `Option ${i + 1}:`,
      `- Rate: ${lineValue(o.rate)}`,
      `- Term: ${lineValue(o.term)}`,
      `- Prepayment: ${lineValue(o.prepaymentPenalty)}`,
    ];
    if (o.notes.trim()) {
      lines.push(`- Notes: ${o.notes.trim()}`);
    }
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n").trim();
}

/**
 * Email-friendly text: short intro, same structure with blank line between
 * options (same bullet style for reliable copy into mail clients).
 */
export function formatTermOptionsEmail(
  options: ReadonlyArray<TermOptionFields>,
  fileName?: string
): string {
  if (options.length === 0) return "";
  const name = fileName?.trim();
  const intro = name
    ? `Options — ${name}\n\n`
    : "Options\n\n";
  const blocks: string[] = [];
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    const lines = [
      `Option ${i + 1}:`,
      `- Rate: ${lineValue(o.rate)}`,
      `- Term: ${lineValue(o.term)}`,
      `- Prepayment: ${lineValue(o.prepaymentPenalty)}`,
    ];
    if (o.notes.trim()) {
      lines.push(`- Notes: ${o.notes.trim()}`);
    }
    blocks.push(lines.join("\n"));
  }
  return (intro + blocks.join("\n\n")).trim();
}
