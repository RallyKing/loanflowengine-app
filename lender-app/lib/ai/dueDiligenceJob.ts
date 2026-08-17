/**
 * Due diligence job argument validation (client + Convex actions).
 * External AI HTTP calls happen only in Convex actions — never queries.
 */

import type { AttachmentKind } from "@/lib/uploadToConvexStorage";
import type { OrgAiProviderKind } from "./orgAiProviders";
import {
  DUE_DILIGENCE_PROMPT_BODY_MAX,
  DUE_DILIGENCE_PROMPT_TITLE_MAX,
} from "./dueDiligencePrompts";

export const DUE_DILIGENCE_MIN_DOCUMENTS = 1;
export const DUE_DILIGENCE_MAX_DOCUMENTS = 20;
export const DUE_DILIGENCE_MAX_TEXT_PER_FILE = 20_000;
export const DUE_DILIGENCE_MAX_TOTAL_TEXT = 80_000;
export const DUE_DILIGENCE_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const DUE_DILIGENCE_MAX_IMAGES = 4;
export const DUE_DILIGENCE_MAX_WARNINGS = 20;

export type DueDiligenceFileUse = "text" | "vision" | "skipped";

export type DueDiligenceExtractedFile = {
  documentId: string;
  title: string;
  fileName?: string;
  contentType?: string;
  kind: AttachmentKind;
  usedAs: DueDiligenceFileUse;
  text?: string;
  /** data:image/...;base64,... — only when usedAs === "vision". Never log. */
  imageDataUrl?: string;
  skipReason?: string;
};

export type DueDiligenceJobArgs = {
  organizationId: string;
  memberUserKey: string;
  pipelineFileId?: string;
  providerId?: string;
  promptId?: string;
  promptTitle: string;
  promptBody: string;
  documentIds: string[];
  extractedFiles: DueDiligenceExtractedFile[];
  /** Only honored when Convex env DLC_AI_DUE_DILIGENCE_MOCK=1. */
  useMock?: boolean;
};

export type DueDiligenceJobValidationError = {
  field:
    | "organizationId"
    | "memberUserKey"
    | "promptTitle"
    | "promptBody"
    | "documentIds"
    | "extractedFiles"
    | "images";
  message: string;
};

/** Mutation-side create: prompt + document ids only (extraction lives on the action). */
export function validateDueDiligenceCreateArgs(args: {
  organizationId: string;
  memberUserKey: string;
  promptTitle: string;
  promptBody: string;
  documentIds: string[];
}): DueDiligenceJobValidationError[] {
  const errors: DueDiligenceJobValidationError[] = [];
  if (!args.organizationId?.trim()) {
    errors.push({
      field: "organizationId",
      message: "Organization is required.",
    });
  }
  if (!args.memberUserKey?.trim()) {
    errors.push({
      field: "memberUserKey",
      message: "Signed-in member key is required.",
    });
  }
  const title = args.promptTitle.trim();
  if (!title) {
    errors.push({ field: "promptTitle", message: "Prompt title is required." });
  } else if (title.length > DUE_DILIGENCE_PROMPT_TITLE_MAX) {
    errors.push({
      field: "promptTitle",
      message: `Prompt title must be ${DUE_DILIGENCE_PROMPT_TITLE_MAX} characters or fewer.`,
    });
  }
  const body = args.promptBody.trim();
  if (!body) {
    errors.push({ field: "promptBody", message: "Prompt body is required." });
  } else if (body.length > DUE_DILIGENCE_PROMPT_BODY_MAX) {
    errors.push({
      field: "promptBody",
      message: `Prompt body must be ${DUE_DILIGENCE_PROMPT_BODY_MAX} characters or fewer.`,
    });
  }
  const ids = args.documentIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length < DUE_DILIGENCE_MIN_DOCUMENTS) {
    errors.push({
      field: "documentIds",
      message: "Select at least one vault file.",
    });
  } else if (ids.length > DUE_DILIGENCE_MAX_DOCUMENTS) {
    errors.push({
      field: "documentIds",
      message: `Select at most ${DUE_DILIGENCE_MAX_DOCUMENTS} files.`,
    });
  }
  if (new Set(ids).size !== ids.length) {
    errors.push({
      field: "documentIds",
      message: "Duplicate document ids are not allowed.",
    });
  }
  return errors;
}

export function validateDueDiligenceJobArgs(
  args: DueDiligenceJobArgs,
): DueDiligenceJobValidationError[] {
  const errors: DueDiligenceJobValidationError[] = [];
  if (!args.organizationId?.trim()) {
    errors.push({
      field: "organizationId",
      message: "Organization is required.",
    });
  }
  if (!args.memberUserKey?.trim()) {
    errors.push({
      field: "memberUserKey",
      message: "Signed-in member key is required.",
    });
  }

  const title = args.promptTitle.trim();
  if (!title) {
    errors.push({ field: "promptTitle", message: "Prompt title is required." });
  } else if (title.length > DUE_DILIGENCE_PROMPT_TITLE_MAX) {
    errors.push({
      field: "promptTitle",
      message: `Prompt title must be ${DUE_DILIGENCE_PROMPT_TITLE_MAX} characters or fewer.`,
    });
  }

  const body = args.promptBody.trim();
  if (!body) {
    errors.push({ field: "promptBody", message: "Prompt body is required." });
  } else if (body.length > DUE_DILIGENCE_PROMPT_BODY_MAX) {
    errors.push({
      field: "promptBody",
      message: `Prompt body must be ${DUE_DILIGENCE_PROMPT_BODY_MAX} characters or fewer.`,
    });
  }

  const ids = args.documentIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length < DUE_DILIGENCE_MIN_DOCUMENTS) {
    errors.push({
      field: "documentIds",
      message: "Select at least one vault file.",
    });
  } else if (ids.length > DUE_DILIGENCE_MAX_DOCUMENTS) {
    errors.push({
      field: "documentIds",
      message: `Select at most ${DUE_DILIGENCE_MAX_DOCUMENTS} files.`,
    });
  }

  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    errors.push({
      field: "documentIds",
      message: "Duplicate document ids are not allowed.",
    });
  }

  if (args.extractedFiles.length !== ids.length) {
    errors.push({
      field: "extractedFiles",
      message: "Each selected file needs an extraction payload.",
    });
  }

  const extractIds = new Set(args.extractedFiles.map((f) => f.documentId));
  for (const id of ids) {
    if (!extractIds.has(id)) {
      errors.push({
        field: "extractedFiles",
        message: `Missing extraction for document ${id}.`,
      });
      break;
    }
  }

  let totalText = 0;
  let visionCount = 0;
  for (const file of args.extractedFiles) {
    const text = file.text?.trim() ?? "";
    if (text.length > DUE_DILIGENCE_MAX_TEXT_PER_FILE) {
      errors.push({
        field: "extractedFiles",
        message: `Text for “${file.title || file.documentId}” exceeds ${DUE_DILIGENCE_MAX_TEXT_PER_FILE} characters.`,
      });
    }
    totalText += text.length;
    if (file.usedAs === "vision") {
      visionCount += 1;
      const dataUrl = file.imageDataUrl ?? "";
      if (!dataUrl.startsWith("data:image/")) {
        errors.push({
          field: "images",
          message: `Vision payload for “${file.title || file.documentId}” is invalid.`,
        });
      } else {
        const approxBytes = Math.floor((dataUrl.length * 3) / 4);
        if (approxBytes > DUE_DILIGENCE_MAX_IMAGE_BYTES) {
          errors.push({
            field: "images",
            message: `Image “${file.title || file.documentId}” is too large for vision (max 4 MB).`,
          });
        }
      }
    }
  }

  if (totalText > DUE_DILIGENCE_MAX_TOTAL_TEXT) {
    errors.push({
      field: "extractedFiles",
      message: `Combined document text exceeds ${DUE_DILIGENCE_MAX_TOTAL_TEXT} characters.`,
    });
  }

  if (visionCount > DUE_DILIGENCE_MAX_IMAGES) {
    errors.push({
      field: "images",
      message: `At most ${DUE_DILIGENCE_MAX_IMAGES} images can be sent as vision.`,
    });
  }

  return errors;
}

export type DueDiligenceRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type DueDiligenceRunPublicDto = {
  id: string;
  organizationId: string;
  pipelineFileId?: string;
  promptTitle: string;
  promptBody: string;
  providerKind: OrgAiProviderKind | string;
  providerName: string;
  model: string;
  documentSummaries: Array<{
    documentId: string;
    title: string;
    fileName?: string;
    kind: string;
    usedAs: DueDiligenceFileUse;
    skipReason?: string;
  }>;
  status: DueDiligenceRunStatus;
  resultMarkdown?: string;
  errorMessage?: string;
  warnings: string[];
  createdByUserKey: string;
  createdAt: number;
  completedAt?: number;
};

export const DUE_DILIGENCE_MOCK_ANALYSIS = [
  "## Mock due diligence (local)",
  "",
  "This result was generated without calling a live AI provider.",
  "Set a real API key in Settings → AI API keys and run again with `DLC_AI_DUE_DILIGENCE_MOCK` unset.",
  "",
  "### Executive summary",
  "Two or more vault files were reviewed as fixtures. No live model inference ran.",
  "",
  "### Findings",
  "- Documents were accepted as context.",
  "- Prompt and file ACL validation succeeded.",
  "",
  "### Next steps",
  "Configure an org AI provider and re-run for a real analysis.",
].join("\n");

export function buildDueDiligenceUserMessage(args: {
  promptBody: string;
  files: Array<Pick<DueDiligenceExtractedFile, "title" | "fileName" | "kind" | "usedAs" | "text" | "skipReason">>;
}): string {
  const parts: string[] = [args.promptBody.trim(), "", "---", "Attached vault files:", ""];
  for (const file of args.files) {
    const label = file.fileName
      ? `${file.title} (${file.fileName})`
      : file.title;
    parts.push(`### ${label}`);
    parts.push(`Type: ${file.kind} · used as: ${file.usedAs}`);
    if (file.skipReason) parts.push(`Note: ${file.skipReason}`);
    if (file.text?.trim()) {
      parts.push("");
      parts.push(file.text.trim());
    }
    parts.push("");
  }
  return parts.join("\n").slice(0, DUE_DILIGENCE_MAX_TOTAL_TEXT + 8_000);
}
