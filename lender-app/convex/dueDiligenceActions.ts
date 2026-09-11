/**
 * External AI HTTP for org providers + due diligence.
 * Actions only — never queries. API keys stay on the server.
 */
import { action, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  ORG_AI_DEFAULT_BASE_URLS,
  type OrgAiProviderKind,
} from "../lib/ai/orgAiProviders";
import {
  DUE_DILIGENCE_MOCK_ANALYSIS,
  buildDueDiligenceUserMessage,
  validateDueDiligenceJobArgs,
} from "../lib/ai/dueDiligenceJob";

const extractedFileV = v.object({
  documentId: v.string(),
  title: v.string(),
  fileName: v.optional(v.string()),
  contentType: v.optional(v.string()),
  kind: v.string(),
  usedAs: v.union(
    v.literal("text"),
    v.literal("vision"),
    v.literal("skipped"),
  ),
  text: v.optional(v.string()),
  imageDataUrl: v.optional(v.string()),
  skipReason: v.optional(v.string()),
});

type ProviderSecret = {
  _id: Id<"orgAiProviders">;
  name: string;
  kind: OrgAiProviderKind;
  model: string;
  baseUrl?: string;
  apiKey: string;
};

function mockModeEnabled(): boolean {
  return process.env.DLC_AI_DUE_DILIGENCE_MOCK?.trim() === "1";
}

async function loadProvider(
  ctx: Pick<ActionCtx, "runQuery">,
  organizationId: Id<"organizations">,
  providerId: Id<"orgAiProviders"> | undefined,
): Promise<ProviderSecret | null> {
  return await ctx.runQuery(
    internal.orgAiProviders.internalGetDecryptedProvider,
    {
      organizationId,
      providerId,
      preferDefault: !providerId,
    },
  );
}

function chatCompletionsUrl(kind: OrgAiProviderKind, baseUrl?: string): string {
  if (kind === "google") {
    const root = (baseUrl || ORG_AI_DEFAULT_BASE_URLS.google).replace(/\/+$/, "");
    return root;
  }
  const root = (
    baseUrl ||
    (kind === "custom" ? "" : ORG_AI_DEFAULT_BASE_URLS[kind])
  ).replace(/\/+$/, "");
  if (kind === "anthropic") {
    return `${root}/messages`;
  }
  return `${root}/chat/completions`;
}

type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function buildOpenAiCompatibleContent(args: {
  promptBody: string;
  files: Array<{
    title: string;
    fileName?: string;
    kind: string;
    usedAs: "text" | "vision" | "skipped";
    text?: string;
    imageDataUrl?: string;
    skipReason?: string;
  }>;
}): ChatPart[] {
  const text = buildDueDiligenceUserMessage({
    promptBody: args.promptBody,
    files: args.files.map((f) => ({
      title: f.title,
      fileName: f.fileName,
      kind: f.kind as never,
      usedAs: f.usedAs,
      text: f.text,
      skipReason: f.skipReason,
    })),
  });
  const parts: ChatPart[] = [{ type: "text", text }];
  for (const file of args.files) {
    if (file.usedAs === "vision" && file.imageDataUrl) {
      parts.push({ type: "image_url", image_url: { url: file.imageDataUrl } });
    }
  }
  return parts;
}

async function callOpenAiCompatible(args: {
  kind: OrgAiProviderKind;
  apiKey: string;
  model: string;
  baseUrl?: string;
  content: ChatPart[];
}): Promise<string> {
  const url = chatCompletionsUrl(args.kind, args.baseUrl);
  if (!url) throw new Error("Custom provider is missing a base URL.");

  if (args.kind === "anthropic") {
    const textBlocks = args.content.filter((p) => p.type === "text");
    const imageBlocks = args.content.filter((p) => p.type === "image_url");
    const content: unknown[] = textBlocks.map((p) => ({
      type: "text",
      text: p.text,
    }));
    for (const img of imageBlocks) {
      const dataUrl = img.image_url.url;
      const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl);
      if (!match) continue;
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: match[1],
          data: match[2],
        },
      });
    }
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        max_tokens: 4096,
        messages: [{ role: "user", content }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic HTTP ${res.status}: ${body.slice(0, 280)}`);
    }
    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    return (
      data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n") ??
      ""
    ).trim();
  }

  if (args.kind === "google") {
    const text = args.content
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n\n");
    const parts: unknown[] = [{ text }];
    for (const img of args.content.filter((p) => p.type === "image_url")) {
      const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(
        img.image_url.url,
      );
      if (!match) continue;
      parts.push({
        inline_data: { mime_type: match[1], data: match[2] },
      });
    }
    const endpoint = `${url}/models/${encodeURIComponent(args.model)}:generateContent?key=${encodeURIComponent(args.apiKey)}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 280)}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    return (
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("\n") ??
      ""
    ).trim();
  }

  const userContent =
    args.content.length === 1 && args.content[0]?.type === "text"
      ? args.content[0].text
      : args.content;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a commercial lending due-diligence analyst inside Direct Lending Connection. Cite file names. Do not invent facts. Reply in Markdown.",
        },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI HTTP ${res.status}: ${body.slice(0, 280)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | unknown } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "object" && p && "text" in p ? String((p as { text?: string }).text ?? "") : ""))
      .join("\n")
      .trim();
  }
  return "";
}

async function pingProvider(provider: ProviderSecret): Promise<void> {
  if (provider.kind === "google") {
    const root = (provider.baseUrl || ORG_AI_DEFAULT_BASE_URLS.google).replace(
      /\/+$/,
      "",
    );
    const url = `${root}/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with the single word pong." }] }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini ping failed (${res.status}): ${body.slice(0, 200)}`);
    }
    return;
  }
  if (provider.kind === "anthropic") {
    const url = chatCompletionsUrl("anthropic", provider.baseUrl);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": provider.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply with the single word pong." }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic ping failed (${res.status}): ${body.slice(0, 200)}`);
    }
    return;
  }
  const url = chatCompletionsUrl(provider.kind, provider.baseUrl);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with the single word pong." }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Provider ping failed (${res.status}): ${body.slice(0, 200)}`);
  }
}

export const testProviderConnection = action({
  args: {
    organizationId: v.id("organizations"),
    providerId: v.id("orgAiProviders"),
    memberUserKey: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const listed = await ctx.runQuery(api.orgAiProviders.listProviders, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
    });
    if (!listed.some((p) => p._id === args.providerId)) {
      return {
        ok: false,
        error: "Provider not found or you do not have settings access.",
      };
    }
    const provider = await loadProvider(ctx, args.organizationId, args.providerId);
    if (!provider) {
      const message = "Provider not found, disabled, or the secret could not be decrypted.";
      await ctx.runMutation(internal.orgAiProviders.recordTestResult, {
        providerId: args.providerId,
        ok: false,
        error: message,
      });
      return { ok: false, error: message };
    }
    try {
      await pingProvider(provider);
      await ctx.runMutation(internal.orgAiProviders.recordTestResult, {
        providerId: args.providerId,
        ok: true,
      });
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.orgAiProviders.recordTestResult, {
        providerId: args.providerId,
        ok: false,
        error,
      });
      return { ok: false, error };
    }
  },
});

export const executeDueDiligence = action({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.string(),
    runId: v.id("dueDiligenceRuns"),
    providerId: v.optional(v.id("orgAiProviders")),
    promptBody: v.string(),
    extractedFiles: v.array(extractedFileV),
    useMock: v.optional(v.boolean()),
  },
  returns: v.object({
    ok: v.boolean(),
    runId: v.id("dueDiligenceRuns"),
    mocked: v.optional(v.boolean()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const validation = validateDueDiligenceJobArgs({
      organizationId: String(args.organizationId),
      memberUserKey: args.memberUserKey,
      promptTitle: "Due diligence",
      promptBody: args.promptBody,
      documentIds: args.extractedFiles.map((f) => f.documentId),
      extractedFiles: args.extractedFiles.map((f) => ({
        documentId: f.documentId,
        title: f.title,
        fileName: f.fileName,
        contentType: f.contentType,
        kind: (f.kind === "image" ||
        f.kind === "pdf" ||
        f.kind === "html" ||
        f.kind === "text" ||
        f.kind === "spreadsheet" ||
        f.kind === "word"
          ? f.kind
          : "other") as import("../lib/uploadToConvexStorage").AttachmentKind,
        usedAs: f.usedAs,
        text: f.text,
        imageDataUrl: f.imageDataUrl,
        skipReason: f.skipReason,
      })),
    });
    try {
      await ctx.runQuery(internal.dueDiligence.internalAssertRunAccess, {
        organizationId: args.organizationId,
        runId: args.runId,
        memberUserKey: args.memberUserKey,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { ok: false, runId: args.runId, error };
    }

    if (validation.length > 0) {
      await ctx.runMutation(internal.dueDiligence.internalPatchRun, {
        runId: args.runId,
        status: "failed",
        errorMessage: validation[0]!.message,
      });
      return { ok: false, runId: args.runId, error: validation[0]!.message };
    }

    await ctx.runMutation(internal.dueDiligence.internalPatchRun, {
      runId: args.runId,
      status: "running",
    });

    const allowMock = args.useMock && mockModeEnabled();
    if (allowMock) {
      await ctx.runMutation(internal.dueDiligence.internalPatchRun, {
        runId: args.runId,
        status: "completed",
        resultMarkdown: DUE_DILIGENCE_MOCK_ANALYSIS,
        providerKind: "custom",
        providerName: "Mock (local)",
        model: "mock",
      });
      return { ok: true, runId: args.runId, mocked: true };
    }

    const provider = await loadProvider(
      ctx,
      args.organizationId,
      args.providerId,
    );
    if (!provider) {
      const error =
        "No enabled AI provider. Add a key in Settings → AI API keys.";
      await ctx.runMutation(internal.dueDiligence.internalPatchRun, {
        runId: args.runId,
        status: "failed",
        errorMessage: error,
      });
      return { ok: false, runId: args.runId, error };
    }

    try {
      const content = buildOpenAiCompatibleContent({
        promptBody: args.promptBody,
        files: args.extractedFiles,
      });
      const markdown = await callOpenAiCompatible({
        kind: provider.kind,
        apiKey: provider.apiKey,
        model: provider.model,
        baseUrl: provider.baseUrl,
        content,
      });
      if (!markdown) {
        throw new Error("The provider returned an empty analysis.");
      }
      await ctx.runMutation(internal.dueDiligence.internalPatchRun, {
        runId: args.runId,
        status: "completed",
        resultMarkdown: markdown,
        providerKind: provider.kind,
        providerName: provider.name,
        model: provider.model,
      });
      return { ok: true, runId: args.runId };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.dueDiligence.internalPatchRun, {
        runId: args.runId,
        status: "failed",
        errorMessage: error,
      });
      return { ok: false, runId: args.runId, error };
    }
  },
});
