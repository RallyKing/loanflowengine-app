/**
 * Email-ready paste block after Generate Client Link.
 * Bullets include the full request: title, description, instruction text, and links.
 */

import { fileTaskTitleForClientLinkEmail } from "./fileTaskClientTemplates";

export type ClientLinkEmailItem = {
  title: string;
  description?: string;
  instructionText?: string;
  instructionUrl?: string;
};

export function flattenRichTextForEmail(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n");
  text = text.replace(
    /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, inner: string) => {
      const label = inner.replace(/<[^>]+>/g, "").trim();
      if (!label || label === href) return href;
      return `${label} (${href})`;
    },
  );
  text = text.replace(/<[^>]+>/g, "");
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, "").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function uniqueNonEmpty(parts: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function clientLinkEmailItemFromFileTask(task: {
  title?: string | null;
  description?: string | null;
  clientInstructionText?: string | null;
  instructionUrl?: string | null;
  clientTemplateAttachments?: { length: number } | null;
}): ClientLinkEmailItem {
  const title = fileTaskTitleForClientLinkEmail(
    task.title?.trim() || "Document request",
    (task.clientTemplateAttachments?.length ?? 0) > 0,
  );
  const description = flattenRichTextForEmail(task.description ?? "");
  const instructionText = flattenRichTextForEmail(task.clientInstructionText ?? "");
  const instructionUrl = task.instructionUrl?.trim() ?? "";
  const item: ClientLinkEmailItem = { title };
  if (description && description.toLowerCase() !== title.toLowerCase()) {
    item.description = description;
  }
  if (instructionText) item.instructionText = instructionText;
  if (instructionUrl) item.instructionUrl = instructionUrl;
  return item;
}

function formatEmailBullet(item: ClientLinkEmailItem): string | null {
  const title = item.title.trim();
  if (!title) return null;

  const bodyChunks = uniqueNonEmpty([
    flattenRichTextForEmail(item.description ?? ""),
    flattenRichTextForEmail(item.instructionText ?? ""),
  ]).filter((chunk) => chunk.toLowerCase() !== title.toLowerCase());

  const url = item.instructionUrl?.trim() ?? "";
  const combinedBody = bodyChunks.join("\n");
  const urlAlreadyIncluded =
    url.length > 0 && combinedBody.toLowerCase().includes(url.toLowerCase());

  const lines = [`• ${title}`];
  for (const chunk of bodyChunks) {
    for (const line of chunk.split("\n")) {
      lines.push(line.trim() ? `  ${line.trim()}` : "");
    }
  }
  if (url && !urlAlreadyIncluded) {
    lines.push(`  ${url}`);
  }
  return lines.join("\n");
}

export function buildClientLinkEmailCopy(
  items: readonly ClientLinkEmailItem[] | readonly string[],
  portalUrl: string,
): string {
  const normalized: ClientLinkEmailItem[] = items.map((item) =>
    typeof item === "string" ? { title: item } : item,
  );
  const bullets = normalized
    .map((item) => formatEmailBullet(item))
    .filter((bullet): bullet is string => Boolean(bullet));

  const block =
    bullets.length > 0 ? bullets.join("\n") : "• (document requests)";
  const url = portalUrl.trim();
  return `${block}\n\nPlease upload the documents securely using the link below:\n\n${url}`;
}
