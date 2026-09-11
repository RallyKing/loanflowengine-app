/**
 * Built-in + custom merge variables for communication templates.
 * Tokens use `{{key}}` syntax (see `templateRender.ts`).
 */

export type CustomInputType =
  | "text"
  | "textarea"
  | "number"
  | "phone"
  | "email";

export type CustomInputDefinition = {
  key: string;
  label: string;
  inputType: CustomInputType;
  defaultValue?: string;
  required?: boolean;
  helpText?: string;
};

export type BuiltInMergeVariable = {
  key: string;
  label: string;
  description: string;
  /** Typical source entity for this variable. */
  group: "organization" | "deal" | "contact" | "lender" | "sender" | "misc";
};

/** Canonical built-in tokens available when composing / previewing. */
export const BUILT_IN_MERGE_VARIABLES: readonly BuiltInMergeVariable[] = [
  {
    key: "organizationName",
    label: "Organization name",
    description: "Active workspace / team name",
    group: "organization",
  },
  {
    key: "fileName",
    label: "Deal / file name",
    description: "Pipeline file name",
    group: "deal",
  },
  {
    key: "dealName",
    label: "Deal name",
    description: "Alias of file name for readable templates",
    group: "deal",
  },
  {
    key: "stage",
    label: "Pipeline stage",
    description: "Current org stage name (or status fallback)",
    group: "deal",
  },
  {
    key: "status",
    label: "Deal status",
    description: "Pipeline status string",
    group: "deal",
  },
  {
    key: "contactName",
    label: "Contact name",
    description: "Linked contact display name",
    group: "contact",
  },
  {
    key: "contactPhone",
    label: "Contact phone",
    description: "Primary contact phone",
    group: "contact",
  },
  {
    key: "contactEmail",
    label: "Contact email",
    description: "Primary contact email",
    group: "contact",
  },
  {
    key: "companyName",
    label: "Company name",
    description: "Contact company / entity label when available",
    group: "contact",
  },
  {
    key: "lenderName",
    label: "Lender name",
    description: "Lender company / display name",
    group: "lender",
  },
  {
    key: "lenderPhone",
    label: "Lender phone",
    description: "Primary lender phone",
    group: "lender",
  },
  {
    key: "lenderEmail",
    label: "Lender email",
    description: "Primary lender email",
    group: "lender",
  },
  {
    key: "senderName",
    label: "Sender name",
    description: "Composing teammate label",
    group: "sender",
  },
  {
    key: "approvalSummary",
    label: "Approval summary",
    description: "Optional approval blurb (override when sending)",
    group: "misc",
  },
  {
    key: "fundingSummary",
    label: "Funding summary",
    description: "Optional funding blurb (override when sending)",
    group: "misc",
  },
  {
    key: "escalationReason",
    label: "Escalation reason",
    description: "Optional escalation blurb (override when sending)",
    group: "misc",
  },
] as const;

export const BUILT_IN_MERGE_VARIABLE_KEYS = BUILT_IN_MERGE_VARIABLES.map(
  (row) => row.key,
);

const CUSTOM_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;

export function normalizeCustomInputKey(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/^([^a-zA-Z])/, "f$1")
    .slice(0, 40);
}

export function isValidCustomInputKey(key: string): boolean {
  if (!CUSTOM_KEY_RE.test(key)) return false;
  if (BUILT_IN_MERGE_VARIABLE_KEYS.includes(key)) return false;
  return true;
}

export function sanitizeCustomInputs(
  inputs: CustomInputDefinition[] | undefined,
): CustomInputDefinition[] {
  if (!inputs?.length) return [];
  const seen = new Set<string>();
  const out: CustomInputDefinition[] = [];
  for (const row of inputs) {
    const key = normalizeCustomInputKey(row.key);
    if (!isValidCustomInputKey(key) || seen.has(key)) continue;
    seen.add(key);
    const label = row.label.trim().slice(0, 80) || key;
    out.push({
      key,
      label,
      inputType: row.inputType,
      defaultValue: row.defaultValue?.trim().slice(0, 500) || undefined,
      required: Boolean(row.required),
      helpText: row.helpText?.trim().slice(0, 200) || undefined,
    });
    if (out.length >= 24) break;
  }
  return out;
}

export function tokenForKey(key: string): string {
  return `{{${key}}}`;
}

export function slugifyTemplateName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base || `template-${Date.now().toString(36)}`;
}
