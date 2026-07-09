/**
 * Optional AI pass for drawer block suggestions. Never mutates layout;
 * client merges with rule-based hints and only unhides on explicit user click.
 */
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import {
  ALL_PIPELINE_BLOCK_IDS,
  getPipelineBlock,
  type PipelineBlockId,
} from "../lib/pipelineBlockRegistry";
import {
  blockMeetsVisibilitySpec,
  extractDrawerVisibilitySignals,
} from "../lib/pipelineBlockVisibility";
import { buildDealSummaryStrings } from "../lib/pipelineBlockRecommendations";
import { readAiAssistEnabled, behaviorSettingsRecord } from "../lib/userPreferencesModel";

export type AiDrawerBlockSuggestion = {
  blockId: PipelineBlockId;
  reason: string;
};

type ActionResult = {
  suggestions: AiDrawerBlockSuggestion[];
  usedAi: boolean;
  skipReason?:
    | "no_key"
    | "no_editor"
    | "no_candidates"
    | "parse_error"
    | "user_disabled";
};

function parseAiSuggestionsJson(
  text: string,
  allowed: Set<PipelineBlockId>,
): AiDrawerBlockSuggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }
  const rawList = (parsed as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(rawList)) return [];
  const out: AiDrawerBlockSuggestion[] = [];
  const seen = new Set<string>();
  for (const item of rawList) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const blockId = (item as { blockId?: unknown }).blockId;
    const reason = (item as { reason?: unknown }).reason;
    if (typeof blockId !== "string" || !allowed.has(blockId as PipelineBlockId)) {
      continue;
    }
    if (typeof reason !== "string" || !reason.trim()) continue;
    if (seen.has(blockId)) continue;
    seen.add(blockId);
    out.push({
      blockId: blockId as PipelineBlockId,
      reason: reason.trim().slice(0, 220),
    });
    if (out.length >= 3) break;
  }
  return out;
}

async function callOpenAiSuggestions(args: {
  apiKey: string;
  userContent: string;
  allowedIds: PipelineBlockId[];
}): Promise<AiDrawerBlockSuggestion[]> {
  const allowed = new Set(args.allowedIds);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You help mortgage brokers decide which optional pipeline drawer sections to show. " +
            "Reply with compact JSON only: object with key \"suggestions\" — array of at most 3 items, " +
            "each { \"blockId\": string, \"reason\": string }. Only use blockIds from the allowed list. " +
            "If nothing is clearly useful, return {\"suggestions\":[]}.",
        },
        { role: "user", content: args.userContent },
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
  return parseAiSuggestionsJson(text, allowed);
}

export const suggestDrawerBlocks = action({
  args: {
    fileId: v.id("pipeline"),
    accountId: v.optional(v.string()),
    hiddenBlockIds: v.array(v.string()),
    focusedFieldPaths: v.array(v.string()),
    topExpandedBlocks: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<ActionResult> => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return { suggestions: [], usedAi: false, skipReason: "no_key" };
    }

    const acc = args.accountId?.trim() ?? "";
    if (acc) {
      const prefsRow = await ctx.runQuery(api.userPreferences.getByAccountId, {
        accountId: acc,
      });
      if (
        prefsRow &&
        !readAiAssistEnabled(behaviorSettingsRecord(prefsRow.behaviorSettings))
      ) {
        return { suggestions: [], usedAi: false, skipReason: "user_disabled" };
      }
    }

    const editor = await ctx.runQuery(api.pipeline.getDealForEditor, {
      fileId: args.fileId,
      ...(acc ? { memberUserKey: acc } : {}),
    });
    if (!editor) {
      return { suggestions: [], usedAi: false, skipReason: "no_editor" };
    }

    const signals = extractDrawerVisibilitySignals(editor.sheet);
    const validHidden = args.hiddenBlockIds.filter((id): id is PipelineBlockId =>
      ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId),
    );

    const candidates = validHidden.filter((id) => {
      const def = getPipelineBlock(id);
      if (def.isMandatory) return false;
      return blockMeetsVisibilitySpec(def.visibilityWhen, signals);
    });

    if (candidates.length === 0) {
      return { suggestions: [], usedAi: false, skipReason: "no_candidates" };
    }

    const summary = buildDealSummaryStrings(editor.sheet);
    const p = editor.pipeline;
    const lenderCount = p.lenders?.length ?? 0;
    const legacyContacts = Array.isArray(p.contacts) ? p.contacts.length : 0;
    const scenarioLine =
      typeof p.scenario === "string" ? p.scenario : "";

    const userContent = [
      `Allowed block ids (pick only from this list): ${candidates.join(", ")}.`,
      "",
      `Deal dealType: ${summary.dealType || "—"}`,
      `Deal fundingType (merged): ${summary.fundingType || "—"}`,
      `Cover purpose: ${summary.purpose || "—"}`,
      `Cover program: ${summary.program || "—"}`,
      `Embedded scenario notes: ${summary.scenarioText || "—"}`,
      `Pipeline scenario line: ${scenarioLine || "—"}`,
      `Lenders on file: ${lenderCount}`,
      `Legacy contact rows on pipeline: ${legacyContacts}`,
      `User recently focused field paths: ${args.focusedFieldPaths.join("; ") || "—"}`,
      `Drawer sections opened often (local hint): ${args.topExpandedBlocks.join(", ") || "—"}`,
      "",
      "Suggest at most 3 drawer blocks the broker should consider showing (unhiding).",
      "Skip blocks that are not a strong fit. Reasons must be one short sentence.",
    ].join("\n");

    try {
      const suggestions = await callOpenAiSuggestions({
        apiKey: key,
        userContent,
        allowedIds: candidates,
      });
      return { suggestions, usedAi: true };
    } catch {
      return { suggestions: [], usedAi: false, skipReason: "parse_error" };
    }
  },
});
