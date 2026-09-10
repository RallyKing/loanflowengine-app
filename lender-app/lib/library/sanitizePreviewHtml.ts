import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize untrusted HTML before `dangerouslySetInnerHTML` in file preview.
 * Strips script tags, inline event handlers, and javascript: URLs.
 */
export function sanitizePreviewHtml(html: string): string {
  if (typeof html !== "string") {
    return "";
  }
  if (html.length === 0) {
    return "";
  }
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}
