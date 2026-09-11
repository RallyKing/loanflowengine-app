/**
 * Unit + scripted workflow for org AI providers, prompt library, and
 * due diligence job validation (no Convex / no live API key).
 *
 * Run: npx tsx scripts/ai-due-diligence-tests.ts
 *
 * Live key (optional, after local Convex has the schema):
 *   1. Settings → Integrations → AI API keys → add OpenAI/Anthropic/Gemini/Custom
 *   2. Leave DLC_AI_DUE_DILIGENCE_MOCK unset on Convex
 *   3. Document Vault → select ≥2 files → Due Diligence → Run analysis
 *
 * Mocked analysis (tests / no live key):
 *   Convex env: DLC_AI_DUE_DILIGENCE_MOCK=1
 *   Client:     NEXT_PUBLIC_DLC_AI_DUE_DILIGENCE_MOCK=1
 */
import assert from "node:assert/strict";
import {
  maskAiApiKeyLast4,
  publicDtoLeaksApiKey,
  toOrgAiProviderPublicDto,
  validateOrgAiProviderUpsert,
} from "../lib/ai/orgAiProviders";
import {
  DUE_DILIGENCE_PROMPT_SEEDS,
  slugifyDueDiligencePromptTitle,
  validateDueDiligencePromptUpsert,
} from "../lib/ai/dueDiligencePrompts";
import {
  DUE_DILIGENCE_MOCK_ANALYSIS,
  buildDueDiligenceUserMessage,
  validateDueDiligenceCreateArgs,
  validateDueDiligenceJobArgs,
} from "../lib/ai/dueDiligenceJob";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("ai-due-diligence-tests");

check("mask last-4 never includes full key", () => {
  const key = "sk-live-super-secret-key-9f3a";
  const mask = maskAiApiKeyLast4(key);
  assert.equal(mask, "••••9f3a");
  assert.equal(mask.includes(key), false);
  assert.equal(mask.includes("sk-live"), false);
});

check("public DTO does not round-trip plaintext key", () => {
  const key = "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV";
  const dto = toOrgAiProviderPublicDto({
    _id: "provider_1",
    name: "Anthropic prod",
    kind: "anthropic",
    model: "claude-sonnet-4-20250514",
    apiKeyLast4: maskAiApiKeyLast4(key),
    apiKeyEnc: "$$enc:v1$not-the-real-key",
    enabled: true,
    isDefault: true,
    createdAt: 1,
    updatedAt: 2,
  });
  assert.equal(dto.apiKeyLast4, "••••STUV");
  assert.equal(dto.hasApiKey, true);
  assert.equal("apiKey" in dto, false);
  assert.equal(publicDtoLeaksApiKey(dto, key), false);
  assert.ok(!JSON.stringify(dto).includes(key));
});

check("provider upsert requires https custom base URL + key", () => {
  const missing = validateOrgAiProviderUpsert({
    name: "Custom",
    kind: "custom",
    model: "llama-3",
    baseUrl: "http://localhost:11434/v1",
    apiKey: "local-key-ok",
  });
  assert.ok(missing.some((e) => e.field === "baseUrl"));

  const ok = validateOrgAiProviderUpsert({
    name: "OpenAI",
    kind: "openai",
    apiKey: "sk-test-12345678",
  });
  assert.equal(ok.length, 0);

  const editKeepKey = validateOrgAiProviderUpsert(
    { name: "OpenAI", kind: "openai" },
    { requireApiKey: false },
  );
  assert.equal(editKeepKey.length, 0);
});

check("prompt CRUD validation + slug + starter seeds", () => {
  assert.equal(DUE_DILIGENCE_PROMPT_SEEDS.length, 3);
  const bad = validateDueDiligencePromptUpsert({ title: " ", body: "" });
  assert.ok(bad.some((e) => e.field === "title"));
  assert.ok(bad.some((e) => e.field === "body"));

  const good = validateDueDiligencePromptUpsert({
    title: "LOI review",
    body: DUE_DILIGENCE_PROMPT_SEEDS[1]!.body,
    templateKey: "loi_review",
    deployed: true,
  });
  assert.equal(good.length, 0);
  assert.equal(slugifyDueDiligencePromptTitle("Review an LOI!"), "review-an-loi");
});

check("due diligence create + job args (≥2 vault files)", () => {
  const createBad = validateDueDiligenceCreateArgs({
    organizationId: "",
    memberUserKey: "user_1",
    promptTitle: "Check",
    promptBody: "Look for fraud.",
    documentIds: [],
  });
  assert.ok(createBad.some((e) => e.field === "documentIds"));
  assert.ok(createBad.some((e) => e.field === "organizationId"));

  const createOk = validateDueDiligenceCreateArgs({
    organizationId: "org_1",
    memberUserKey: "user_1",
    promptTitle: "Fraud scan",
    promptBody: "Check documents for irregularities.",
    documentIds: ["doc_a", "doc_b"],
  });
  assert.equal(createOk.length, 0);

  const jobBad = validateDueDiligenceJobArgs({
    organizationId: "org_1",
    memberUserKey: "user_1",
    promptTitle: "Fraud scan",
    promptBody: "Check documents.",
    documentIds: ["doc_a", "doc_b"],
    extractedFiles: [
      {
        documentId: "doc_a",
        title: "Bank statement",
        kind: "pdf",
        usedAs: "text",
        text: "Acme LLC deposits",
      },
    ],
  });
  assert.ok(jobBad.some((e) => e.field === "extractedFiles"));

  const jobOk = validateDueDiligenceJobArgs({
    organizationId: "org_1",
    memberUserKey: "user_1",
    promptTitle: "Fraud scan",
    promptBody: "Check documents for irregularities.",
    documentIds: ["doc_a", "doc_b"],
    extractedFiles: [
      {
        documentId: "doc_a",
        title: "Bank statement.pdf",
        kind: "pdf",
        usedAs: "text",
        text: "Page 1: deposits totaling $12,400.",
      },
      {
        documentId: "doc_b",
        title: "Driver license.png",
        kind: "image",
        usedAs: "vision",
        imageDataUrl: "data:image/png;base64,aGVsbG8=",
      },
    ],
  });
  assert.equal(jobOk.length, 0);
});

check("scripted workflow: 2 fixtures → mock analysis payload", () => {
  const prompt = DUE_DILIGENCE_PROMPT_SEEDS[0]!;
  const userMessage = buildDueDiligenceUserMessage({
    promptBody: prompt.body,
    files: [
      {
        title: "P&L.pdf",
        fileName: "pl.pdf",
        kind: "pdf",
        usedAs: "text",
        text: "Revenue 1.2M. EBITDA 180k.",
      },
      {
        title: "LOI.pdf",
        fileName: "loi.pdf",
        kind: "pdf",
        usedAs: "text",
        text: "Exclusivity 90 days. Good-faith deposit $25,000.",
      },
    ],
  });
  assert.ok(userMessage.includes("P&L.pdf"));
  assert.ok(userMessage.includes("LOI.pdf"));
  assert.ok(userMessage.includes(prompt.body.slice(0, 40)));
  assert.ok(DUE_DILIGENCE_MOCK_ANALYSIS.includes("Mock due diligence"));
  assert.ok(DUE_DILIGENCE_MOCK_ANALYSIS.includes("Executive summary"));
});

console.log(`\nai-due-diligence-tests: ${passed} cases passed.`);
