import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { libraryDocumentCategoryV } from "./contactStickyData/validators";
import { computeExpiresAt } from "../lib/library/documentVaultExpiry";
import {
  assertCanReadLibraryDocument,
  assertProofWrite,
  requireLinkForProof,
} from "./libraryDocuments";
import { resolveVaultOutboundFileName } from "../lib/library/vaultOutboundFileName";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const linkProof = v.union(
  v.object({ kind: v.literal("pipeline"), pipelineFileId: v.id("pipeline") }),
  v.object({ kind: v.literal("contact"), contactId: v.id("contacts") }),
  v.object({ kind: v.literal("task"), taskId: v.id("tasks") }),
);

const CATEGORY_IDS = [
  "id",
  "dd214",
  "tax_return",
  "deal_specific",
  "client_submitted",
  "other",
] as const;

type CategoryId = (typeof CATEGORY_IDS)[number];

type ClassificationResult = {
  category: CategoryId;
  confidence: number;
  taxYear?: string;
  folderName?: string;
};

function parseClassificationJson(text: string): ClassificationResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const category = (parsed as { category?: unknown }).category;
  const confidence = (parsed as { confidence?: unknown }).confidence;
  if (typeof category !== "string" || !CATEGORY_IDS.includes(category as CategoryId)) {
    return null;
  }
  const conf =
    typeof confidence === "number" && Number.isFinite(confidence)
      ? Math.min(1, Math.max(0, confidence))
      : 0.5;
  const taxYearRaw = (parsed as { taxYear?: unknown }).taxYear;
  const taxYear =
    typeof taxYearRaw === "string" && /^\d{4}$/.test(taxYearRaw.trim())
      ? taxYearRaw.trim()
      : undefined;
  const folderRaw = (parsed as { folderName?: unknown }).folderName;
  const folderName =
    typeof folderRaw === "string" && folderRaw.trim()
      ? folderRaw.trim().slice(0, 120)
      : undefined;
  return {
    category: category as CategoryId,
    confidence: conf,
    taxYear,
    folderName,
  };
}

async function callOpenAiClassify(args: {
  apiKey: string;
  fileName: string;
  previewText: string;
}): Promise<ClassificationResult | null> {
  const snippet = args.previewText.trim().slice(0, 12_000);
  const userContent =
    `File name: ${args.fileName}\n\n` +
    `Document text (first pages):\n${snippet || "(no extractable text — infer from file name only)"}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You classify mortgage / loan pipeline documents for a document vault. " +
            "Reply with JSON only: " +
            '{ "category": string, "confidence": number, "taxYear"?: string, "folderName"?: string }. ' +
            `category MUST be exactly one of: ${CATEGORY_IDS.join(", ")}. ` +
            "confidence is 0-1. Use tax_return + taxYear for W-2, 1040, tax returns. " +
            "Use id for driver's license, passport, state ID. Use dd214 for military discharge. " +
            "Use deal_specific for loan-specific underwriting docs. " +
            "Use client_submitted for generic client uploads. Use other when unsure. " +
            "folderName is an optional short folder label (e.g. Tax Returns, IDs) — omit if unclear.",
        },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return parseClassificationJson(text);
}

async function linkHasConfirmedCategory(
  ctx: QueryCtx | MutationCtx,
  documentId: Id<"libraryDocuments">,
  proof: Parameters<typeof requireLinkForProof>[2],
): Promise<boolean> {
  try {
    const link = await requireLinkForProof(ctx, documentId, proof);
    return link.documentCategory != null;
  } catch {
    return true;
  }
}

export const internalGetClassificationContext = internalQuery({
  args: {
    documentId: v.id("libraryDocuments"),
    proof: linkProof,
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCanReadLibraryDocument(ctx, args.documentId, args.memberUserKey);
    const confirmed = await linkHasConfirmedCategory(
      ctx,
      args.documentId,
      args.proof,
    );
    if (confirmed) return null;
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    return {
      documentId: args.documentId,
      fileName: resolveVaultOutboundFileName(doc.title, doc.latestFileName),
    };
  },
});

export const internalApplyClassificationSuggestion = internalMutation({
  args: {
    documentId: v.id("libraryDocuments"),
    category: libraryDocumentCategoryV,
    confidence: v.number(),
    taxYear: v.optional(v.string()),
    folderName: v.optional(v.string()),
  },
  handler: async (ctx, { documentId, category, confidence, taxYear, folderName }) => {
    const doc = await ctx.db.get(documentId);
    if (!doc) return { ok: false as const, reason: "not_found" };

    await ctx.db.patch(documentId, {
      aiSuggestedCategory: category,
      aiConfidence: confidence,
      aiSuggestedTaxYear: taxYear,
      aiSuggestedFolderName: folderName,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const internalClearClassificationSuggestion = internalMutation({
  args: { documentId: v.id("libraryDocuments") },
  handler: async (ctx, { documentId }) => {
    await ctx.db.patch(documentId, {
      aiSuggestedCategory: undefined,
      aiConfidence: undefined,
      aiSuggestedTaxYear: undefined,
      aiSuggestedFolderName: undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Background worker — OpenAI gpt-4o-mini classification. */
export const classifyDocument = internalAction({
  args: {
    documentId: v.id("libraryDocuments"),
    proof: linkProof,
    previewText: v.string(),
    fileName: v.string(),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) {
      return { ok: false as const, skipReason: "no_key" as const };
    }

    const payload = await ctx.runQuery(
      internal.documentIntelligence.internalGetClassificationContext,
      {
        documentId: args.documentId,
        proof: args.proof,
        memberUserKey: args.memberUserKey,
      },
    );
    if (!payload) {
      return { ok: false as const, skipReason: "no_access_or_confirmed" as const };
    }

    try {
      const result = await callOpenAiClassify({
        apiKey: key,
        fileName: args.fileName,
        previewText: args.previewText,
      });
      if (!result || result.confidence < 0.35) {
        return { ok: false as const, skipReason: "low_confidence" as const };
      }

      await ctx.runMutation(
        internal.documentIntelligence.internalApplyClassificationSuggestion,
        {
          documentId: args.documentId,
          category: result.category,
          confidence: result.confidence,
          taxYear: result.taxYear,
          folderName: result.folderName,
        },
      );
      return {
        ok: true as const,
        category: result.category,
        confidence: result.confidence,
      };
    } catch {
      return { ok: false as const, skipReason: "llm_error" as const };
    }
  },
});

/** Queue AI classification after client text extraction (non-blocking). */
export const enqueueDocumentClassification = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    proof: linkProof,
    previewText: v.string(),
    fileName: v.string(),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const { documentId, proof, previewText, fileName, memberUserKey } = args;
    await assertProofWrite(ctx, proof, memberUserKey);
    await requireLinkForProof(ctx, documentId, proof);

    const confirmed = await linkHasConfirmedCategory(ctx, documentId, proof);
    if (confirmed) {
      return { queued: false as const, reason: "category_confirmed" as const };
    }

    const trimmed = previewText.trim();
    if (!trimmed && !fileName.trim()) {
      return { queued: false as const, reason: "no_text" as const };
    }

    await ctx.scheduler.runAfter(0, internal.documentIntelligence.classifyDocument, {
      documentId,
      proof,
      previewText: trimmed,
      fileName: fileName.trim() || "document",
      memberUserKey,
    });
    return { queued: true as const };
  },
});

/** Accept AI suggestion — sets link category (and folder when pipeline). */
export const acceptAiCategorySuggestion = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    proof: linkProof,
    ...memberKeyArg,
  },
  handler: async (ctx, { documentId, proof, memberUserKey }) => {
    await assertProofWrite(ctx, proof, memberUserKey);
    const link = await requireLinkForProof(ctx, documentId, proof);
    const doc = await ctx.db.get(documentId);
    if (!doc?.aiSuggestedCategory) {
      throw new Error("No AI category suggestion for this document.");
    }

    const patch: Partial<Doc<"libraryDocumentLinks">> = {
      documentCategory: doc.aiSuggestedCategory,
    };
    if (
      doc.aiSuggestedCategory === "tax_return" &&
      doc.aiSuggestedTaxYear
    ) {
      patch.taxYear = doc.aiSuggestedTaxYear;
    }

    if (
      proof.kind === "pipeline" &&
      doc.aiSuggestedFolderName?.trim() &&
      !link.folderId
    ) {
      const hint = doc.aiSuggestedFolderName.trim().toLowerCase();
      const folders = await ctx.db
        .query("documentFolders")
        .withIndex("by_pipeline", (q) =>
          q.eq("pipelineFileId", proof.pipelineFileId),
        )
        .collect();
      const match = folders.find(
        (f) => f.name.trim().toLowerCase() === hint,
      );
      if (match) {
        patch.folderId = match._id;
      }
    }

    const mergedCategory = patch.documentCategory;
    patch.expiresAt = computeExpiresAt(
      doc.latestUploadedAt,
      mergedCategory ?? undefined,
    );

    await ctx.db.patch(link._id, patch);
    await ctx.db.patch(documentId, {
      aiSuggestedCategory: undefined,
      aiConfidence: undefined,
      aiSuggestedTaxYear: undefined,
      aiSuggestedFolderName: undefined,
      updatedAt: Date.now(),
    });

    return { ok: true as const, category: doc.aiSuggestedCategory };
  },
});
