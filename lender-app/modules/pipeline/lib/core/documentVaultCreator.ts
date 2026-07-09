/** Mock document templates and deal tokens for the vault creator (Phase 4). */

export type DocumentCreatorStep = "select" | "editor";

export type DocumentCreatorTemplate = {
  id: string;
  title: string;
  description: string;
  bodyHtml: string;
};

export type DocumentCreatorToken = {
  id: string;
  label: string;
  token: string;
};

export const DOCUMENT_CREATOR_MOCK_TEMPLATES: DocumentCreatorTemplate[] = [
  {
    id: "executive-summary",
    title: "Executive Summary",
    description:
      "One-page overview of the borrower, collateral, and proposed structure.",
    bodyHtml: `<h1>Executive Summary</h1>
<p><strong>Borrower:</strong> {{borrower_name}}</p>
<p><strong>Entity:</strong> {{entity_name}}</p>
<p><strong>Loan amount:</strong> {{loan_amount}}</p>
<p><strong>Property:</strong> {{property_address}}</p>
<p>Summarize the transaction purpose, sponsor experience, and key underwriting highlights.</p>`,
  },
  {
    id: "letter-of-explanation",
    title: "Letter of Explanation",
    description:
      "Borrower-signed narrative for credit, employment, or deposit anomalies.",
    bodyHtml: `<h2>Letter of Explanation</h2>
<p>Date: {{today_date}}</p>
<p>To Whom It May Concern,</p>
<p>I, {{borrower_name}}, am writing to explain …</p>
<p>Sincerely,<br/>{{borrower_name}}</p>`,
  },
  {
    id: "term-sheet",
    title: "Term Sheet",
    description: "High-level economics and structure for lender review.",
    bodyHtml: `<h1>Term Sheet</h1>
<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">
  <tr><td>Borrower</td><td>{{borrower_name}}</td></tr>
  <tr><td>Guarantor</td><td>{{guarantor_name}}</td></tr>
  <tr><td>Loan Amount</td><td>{{loan_amount}}</td></tr>
  <tr><td>Rate</td><td>{{interest_rate}}</td></tr>
  <tr><td>Term</td><td>{{loan_term}}</td></tr>
  <tr><td>Primary Lender</td><td>{{primary_lender}}</td></tr>
</table>`,
  },
];

export const DEFAULT_DOCUMENT_CREATOR_TOKENS: DocumentCreatorToken[] = [
  { id: "borrower", label: "Borrower name", token: "{{borrower_name}}" },
  { id: "guarantor", label: "Guarantor name", token: "{{guarantor_name}}" },
  { id: "entity", label: "Entity name", token: "{{entity_name}}" },
  { id: "loan_amount", label: "Loan amount", token: "{{loan_amount}}" },
  { id: "interest_rate", label: "Interest rate", token: "{{interest_rate}}" },
  { id: "loan_term", label: "Loan term", token: "{{loan_term}}" },
  { id: "property", label: "Property address", token: "{{property_address}}" },
  { id: "stage", label: "Pipeline stage", token: "{{pipeline_stage}}" },
  { id: "primary_lender", label: "Primary lender", token: "{{primary_lender}}" },
  { id: "file_name", label: "File name", token: "{{file_name}}" },
  { id: "today", label: "Today's date", token: "{{today_date}}" },
];

export type DocumentCreatorTokenContext = Partial<
  Record<
    | "borrower_name"
    | "guarantor_name"
    | "entity_name"
    | "loan_amount"
    | "interest_rate"
    | "loan_term"
    | "property_address"
    | "pipeline_stage"
    | "primary_lender"
    | "file_name"
    | "today_date",
    string
  >
>;

const EMPTY_TOKEN_CONTEXT: DocumentCreatorTokenContext = {
  borrower_name: "—",
  guarantor_name: "—",
  entity_name: "—",
  loan_amount: "—",
  interest_rate: "—",
  loan_term: "—",
  property_address: "—",
  pipeline_stage: "—",
  primary_lender: "—",
  file_name: "Deal Package",
  today_date: "",
};

export function resolveDocumentCreatorTokenContext(
  overrides?: DocumentCreatorTokenContext,
): DocumentCreatorTokenContext {
  const today = new Date().toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
  return {
    ...EMPTY_TOKEN_CONTEXT,
    today_date: today,
    ...overrides,
  };
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Replace `{{token}}` placeholders with resolved deal values (for vault save). */
export function applyDocumentCreatorTokens(
  html: string,
  context?: DocumentCreatorTokenContext,
): string {
  const resolved = resolveDocumentCreatorTokenContext(context);
  let out = html;
  for (const [key, value] of Object.entries(resolved)) {
    if (!value) continue;
    const token = `{{${key}}}`;
    out = out.split(token).join(escapeHtmlText(value));
  }
  return out;
}

/** Allowed image URLs for inline editor inserts (Convex storage or HTTPS only). */
export function sanitizeDocumentEditorImageUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/** Safe `<img>` HTML for the contentEditable canvas. */
export function buildDocumentEditorImageInsertHtml(url: string): string {
  const safe = sanitizeDocumentEditorImageUrl(url);
  if (!safe) {
    throw new Error("Invalid image URL.");
  }
  const attr = safe.replace(/"/g, "&quot;");
  return `<img src="${attr}" alt="" class="max-w-full h-auto rounded-lg" style="max-width:100%;height:auto;margin:8px 0" data-dlc-editor-image="1" />`;
}

export function htmlDocumentToVaultFile(title: string, html: string): File {
  const safeTitle =
    title.replace(/[/\\?%*:|"<>]/g, "-").trim() || "Untitled document";
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtmlText(safeTitle)}</title><style>body{font-family:system-ui,sans-serif;line-height:1.5;padding:2rem;max-width:210mm;margin:0 auto}</style></head><body>${html}</body></html>`;
  return new File([fullHtml], `${safeTitle}.html`, { type: "text/html" });
}

/** Extract inner body HTML from a stored vault HTML document. */
export function extractHtmlDocumentBody(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch?.[1]) return bodyMatch[1].trim();
  return html.trim();
}

export type DocumentCreatorTemplateSource = DocumentCreatorTemplate & {
  source: "builtin" | "saved";
};
