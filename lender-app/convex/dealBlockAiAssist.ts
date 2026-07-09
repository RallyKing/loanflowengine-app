/**
 * Optional LLM layer for in-block deal assistance. Returns suggestion objects only;
 * the client applies patches only after explicit user acceptance.
 */
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import {
  type DealBlockAiKind,
  parseAiSuggestionsResponse,
} from "../lib/dealBlockAiAssistModel";
import { readAiAssistEnabled, behaviorSettingsRecord } from "../lib/userPreferencesModel";

const blockKindValidator = v.union(
  v.literal("dti"),
  v.literal("scenario"),
  v.literal("funding"),
  v.literal("lender_match"),
);

async function callOpenAiDealAssist(args: {
  apiKey: string;
  blockKind: DealBlockAiKind;
  contextSnippet: string;
}): Promise<string> {
  const kindHint =
    args.blockKind === "dti"
      ? "DTI calculator: explain ratios, flag guideline stress, suggest safe numeric tweaks only in patch.dti (strings)."
      : args.blockKind === "scenario"
        ? "Scenario snapshot: structure, risk, and narrative notes. patch.scenario only."
        : args.blockKind === "funding"
          ? "Coversheet / funding: product fit, leverage, prepay. patch.cover only."
          : "Lender matching: criteria tuning and which dimensions to tighten; patch.lenderCriteria for form fields only (strings).";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content:
            "You assist mortgage brokers inside their CRM. Return JSON only: {\"suggestions\":[{...}]}.\n" +
            "Each suggestion: id (short string), kind: insight | explanation | autofill | lender_tip, title, body.\n" +
            "Optional patch — only for kind autofill, and only with keys the UI allows (never invent PII).\n" +
            "For dti patches use flat keys on patch: downPaymentPct, termMonths, interestRate, propertyTaxRate, propertyTaxesMonthly, fundingAmount, debts:{cars,revolving,installment,other}.\n" +
            "For scenario use patch: notes, loanPurpose, fundingType, proposedLoanAmount, creditScore, loanTermYears, cashOutAmount.\n" +
            "For funding use patch: notes, borrowerGoals, prepayStructure, purpose, recourse on cover.\n" +
            "For lender_match use patch: fundingTypeLabel, propertyTypeLabel, state, transactionType, ficoText, ltvText, industry, ownerOccupied (Owner|Investor|Either).\n" +
            "Do not tell the user data was saved. Max 5 suggestions. If unsure, return fewer.",
        },
        {
          role: "user",
          content: `Block: ${args.blockKind}. ${kindHint}\n\nContext JSON:\n${args.contextSnippet}`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 280)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

export const suggestDealBlockAssist = action({
  args: {
    fileId: v.id("pipeline"),
    accountId: v.optional(v.string()),
    blockKind: blockKindValidator,
    contextJson: v.string(),
  },
  handler: async (ctx, args) => {
    const acc = args.accountId?.trim() ?? "";
    if (acc) {
      const prefsRow = await ctx.runQuery(api.userPreferences.getByAccountId, {
        accountId: acc,
      });
      if (
        prefsRow &&
        !readAiAssistEnabled(behaviorSettingsRecord(prefsRow.behaviorSettings))
      ) {
        return { suggestions: [], skipped: "user_disabled" as const };
      }
    }

    void args.fileId;
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return { suggestions: [], skipped: "no_key" as const };
    }
    let snippet = args.contextJson;
    if (snippet.length > 14_000) {
      snippet = snippet.slice(0, 14_000);
    }
    try {
      const text = await callOpenAiDealAssist({
        apiKey: key,
        blockKind: args.blockKind,
        contextSnippet: snippet,
      });
      const suggestions = parseAiSuggestionsResponse(text, args.blockKind);
      return { suggestions, skipped: undefined };
    } catch {
      return { suggestions: [], skipped: "error" as const };
    }
  },
});
