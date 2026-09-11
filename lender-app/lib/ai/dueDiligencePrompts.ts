/**
 * Due diligence prompt library — org-scoped templates the user can customize,
 * save, and deploy into the Document Vault Due Diligence picker.
 */

export const DUE_DILIGENCE_TEMPLATE_KEYS = [
  "fraud_irregularities",
  "loi_review",
  "deal_analysis",
  "custom",
] as const;

export type DueDiligenceTemplateKey =
  (typeof DUE_DILIGENCE_TEMPLATE_KEYS)[number];

export const DUE_DILIGENCE_PROMPT_TITLE_MAX = 120;
export const DUE_DILIGENCE_PROMPT_BODY_MAX = 20_000;
export const DUE_DILIGENCE_PROMPT_DESC_MAX = 400;
export const DUE_DILIGENCE_PROMPT_SLUG_MAX = 80;

export type DueDiligencePromptSeed = {
  templateKey: Exclude<DueDiligenceTemplateKey, "custom">;
  title: string;
  description: string;
  body: string;
};

export const DUE_DILIGENCE_PROMPT_SEEDS: readonly DueDiligencePromptSeed[] = [
  {
    templateKey: "fraud_irregularities",
    title: "Document irregularities / fraud signals",
    description:
      "Scan selected vault files for inconsistencies, altered docs, and red flags.",
    body:
      "You are a commercial lending due-diligence analyst. Review the attached documents " +
      "for irregularities that could indicate fraud, alteration, or misrepresentation.\n\n" +
      "Flag: mismatched names/EINs/addresses, inconsistent dates or amounts, missing pages, " +
      "copy-paste artifacts, implausible financials, and anything that does not reconcile " +
      "across files.\n\n" +
      "Return: (1) Executive summary, (2) Findings table (severity / evidence / file), " +
      "(3) Open questions, (4) Recommended next steps. Cite file names. If evidence is " +
      "thin, say so — do not invent facts.",
  },
  {
    templateKey: "loi_review",
    title: "Review an LOI (untrusted / new lender)",
    description:
      "Critique a letter of intent from a lender you do not fully trust yet.",
    body:
      "You are reviewing a Letter of Intent (LOI) from a lender that may be new or untrusted.\n\n" +
      "Analyze: term structure, fees, exclusivity, breakup / good-faith deposits, " +
      "conditions precedent, vague language, assignment rights, and anything unusual " +
      "versus market practice for alternative / commercial lending.\n\n" +
      "Call out clauses that could trap the borrower or broker. Separate (A) market-standard, " +
      "(B) aggressive but workable, (C) walk-away risks. Quote or paraphrase the LOI; " +
      "do not invent terms that are not in the documents.",
  },
  {
    templateKey: "deal_analysis",
    title: "Deal feasibility & lender-attractive restructure",
    description:
      "What is the borrower asking, is it feasible, and how would you restructure it?",
    body:
      "You are a senior originations analyst. From the attached deal / borrower documents:\n\n" +
      "1. Summarize what the borrower is asking (amount, use of funds, timeline, collateral).\n" +
      "2. Assess feasibility: credit, cash flow, collateral, sponsorship, and gaps.\n" +
      "3. Propose a lender-attractive restructure (structure, leverage, reserves, covenants, " +
      "phasing) that a conservative private or bank lender could underwrite.\n\n" +
      "Be explicit about assumptions. If a number is missing, list it under Diligence gaps.",
  },
] as const;

export type DueDiligencePromptUpsertInput = {
  title: string;
  body: string;
  description?: string;
  templateKey?: DueDiligenceTemplateKey;
  slug?: string;
  deployed?: boolean;
};

export type DueDiligencePromptValidationError = {
  field: "title" | "body" | "description" | "slug" | "templateKey";
  message: string;
};

export function isDueDiligenceTemplateKey(
  value: unknown,
): value is DueDiligenceTemplateKey {
  return (
    typeof value === "string" &&
    (DUE_DILIGENCE_TEMPLATE_KEYS as readonly string[]).includes(value)
  );
}

export function slugifyDueDiligencePromptTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, DUE_DILIGENCE_PROMPT_SLUG_MAX);
  return slug || "prompt";
}

export function validateDueDiligencePromptUpsert(
  input: DueDiligencePromptUpsertInput,
): DueDiligencePromptValidationError[] {
  const errors: DueDiligencePromptValidationError[] = [];
  const title = input.title.trim();
  if (!title) {
    errors.push({ field: "title", message: "Title is required." });
  } else if (title.length > DUE_DILIGENCE_PROMPT_TITLE_MAX) {
    errors.push({
      field: "title",
      message: `Title must be ${DUE_DILIGENCE_PROMPT_TITLE_MAX} characters or fewer.`,
    });
  }

  const body = input.body.trim();
  if (!body) {
    errors.push({ field: "body", message: "Prompt body is required." });
  } else if (body.length > DUE_DILIGENCE_PROMPT_BODY_MAX) {
    errors.push({
      field: "body",
      message: `Prompt body must be ${DUE_DILIGENCE_PROMPT_BODY_MAX} characters or fewer.`,
    });
  }

  const description = input.description?.trim() ?? "";
  if (description.length > DUE_DILIGENCE_PROMPT_DESC_MAX) {
    errors.push({
      field: "description",
      message: `Description must be ${DUE_DILIGENCE_PROMPT_DESC_MAX} characters or fewer.`,
    });
  }

  if (
    input.templateKey != null &&
    !isDueDiligenceTemplateKey(input.templateKey)
  ) {
    errors.push({ field: "templateKey", message: "Unknown template type." });
  }

  const slug = input.slug?.trim();
  if (slug && slug.length > DUE_DILIGENCE_PROMPT_SLUG_MAX) {
    errors.push({
      field: "slug",
      message: `Slug must be ${DUE_DILIGENCE_PROMPT_SLUG_MAX} characters or fewer.`,
    });
  }

  return errors;
}

export type DueDiligencePromptPublicDto = {
  id: string;
  title: string;
  slug: string;
  description?: string;
  templateKey: DueDiligenceTemplateKey;
  body: string;
  deployed: boolean;
  archivedAt?: number;
  createdAt: number;
  updatedAt: number;
};
