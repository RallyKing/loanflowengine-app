/**
 * Org-scoped AI provider catalog (Settings → AI API keys).
 * Keys are never returned to the client after save — only a last-4 mask.
 */

export const ORG_AI_PROVIDER_KINDS = [
  "openai",
  "anthropic",
  "google",
  "custom",
] as const;

export type OrgAiProviderKind = (typeof ORG_AI_PROVIDER_KINDS)[number];

export const ORG_AI_PROVIDER_KIND_LABELS: Record<OrgAiProviderKind, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  custom: "Custom (OpenAI-compatible)",
};

export const ORG_AI_DEFAULT_MODELS: Record<OrgAiProviderKind, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
  google: "gemini-2.0-flash",
  custom: "gpt-4o",
};

export const ORG_AI_DEFAULT_BASE_URLS: Record<
  Exclude<OrgAiProviderKind, "custom">,
  string
> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
};

export const ORG_AI_PROVIDER_NAME_MAX = 80;
export const ORG_AI_MODEL_MAX = 120;
export const ORG_AI_BASE_URL_MAX = 300;
export const ORG_AI_API_KEY_MAX = 512;
export const ORG_AI_API_KEY_MIN = 8;

export function isOrgAiProviderKind(value: unknown): value is OrgAiProviderKind {
  return (
    typeof value === "string" &&
    (ORG_AI_PROVIDER_KINDS as readonly string[]).includes(value)
  );
}

export function maskAiApiKeyLast4(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}

/** Public DTO after save — never includes the full secret. */
export type OrgAiProviderPublicDto = {
  id: string;
  name: string;
  kind: OrgAiProviderKind;
  model: string;
  baseUrl?: string;
  apiKeyLast4: string;
  hasApiKey: boolean;
  enabled: boolean;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
  lastTestedAt?: number;
  lastTestOk?: boolean;
  lastTestError?: string;
};

export type OrgAiProviderUpsertInput = {
  name: string;
  kind: OrgAiProviderKind;
  model?: string;
  baseUrl?: string;
  /** Omit to keep the existing secret on edit. */
  apiKey?: string;
  enabled?: boolean;
  isDefault?: boolean;
};

export type OrgAiProviderValidationError = {
  field: "name" | "kind" | "model" | "baseUrl" | "apiKey";
  message: string;
};

function trimOrEmpty(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function normalizeOrgAiBaseUrl(
  kind: OrgAiProviderKind,
  baseUrl: string | undefined,
): string | undefined {
  const raw = trimOrEmpty(baseUrl);
  if (kind !== "custom") {
    return raw || undefined;
  }
  return raw.replace(/\/+$/, "");
}

export function validateOrgAiProviderUpsert(
  input: OrgAiProviderUpsertInput,
  options?: { requireApiKey?: boolean },
): OrgAiProviderValidationError[] {
  const errors: OrgAiProviderValidationError[] = [];
  const name = trimOrEmpty(input.name);
  if (!name) {
    errors.push({ field: "name", message: "Name is required." });
  } else if (name.length > ORG_AI_PROVIDER_NAME_MAX) {
    errors.push({
      field: "name",
      message: `Name must be ${ORG_AI_PROVIDER_NAME_MAX} characters or fewer.`,
    });
  }

  if (!isOrgAiProviderKind(input.kind)) {
    errors.push({ field: "kind", message: "Choose a supported provider." });
  }

  const model = trimOrEmpty(input.model) || ORG_AI_DEFAULT_MODELS[input.kind];
  if (!model) {
    errors.push({ field: "model", message: "Model is required." });
  } else if (model.length > ORG_AI_MODEL_MAX) {
    errors.push({
      field: "model",
      message: `Model must be ${ORG_AI_MODEL_MAX} characters or fewer.`,
    });
  }

  const baseUrl = normalizeOrgAiBaseUrl(input.kind, input.baseUrl);
  if (input.kind === "custom") {
    if (!baseUrl) {
      errors.push({
        field: "baseUrl",
        message: "Custom providers need an HTTPS base URL.",
      });
    } else if (!/^https:\/\//i.test(baseUrl)) {
      errors.push({
        field: "baseUrl",
        message: "Base URL must start with https://.",
      });
    } else if (baseUrl.length > ORG_AI_BASE_URL_MAX) {
      errors.push({
        field: "baseUrl",
        message: `Base URL must be ${ORG_AI_BASE_URL_MAX} characters or fewer.`,
      });
    }
  } else if (baseUrl && !/^https:\/\//i.test(baseUrl)) {
    errors.push({
      field: "baseUrl",
      message: "Override URL must start with https://.",
    });
  }

  const apiKey = trimOrEmpty(input.apiKey);
  const requireKey = options?.requireApiKey !== false;
  if (requireKey && !apiKey) {
    errors.push({ field: "apiKey", message: "API key is required." });
  } else if (apiKey && apiKey.length < ORG_AI_API_KEY_MIN) {
    errors.push({
      field: "apiKey",
      message: `API key looks too short (min ${ORG_AI_API_KEY_MIN}).`,
    });
  } else if (apiKey.length > ORG_AI_API_KEY_MAX) {
    errors.push({
      field: "apiKey",
      message: `API key must be ${ORG_AI_API_KEY_MAX} characters or fewer.`,
    });
  }

  return errors;
}

export function toOrgAiProviderPublicDto(row: {
  _id: { toString(): string } | string;
  name: string;
  kind: OrgAiProviderKind;
  model: string;
  baseUrl?: string;
  apiKeyLast4: string;
  apiKeyEnc?: string;
  enabled: boolean;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
  lastTestedAt?: number;
  lastTestOk?: boolean;
  lastTestError?: string;
}): OrgAiProviderPublicDto {
  return {
    id: String(row._id),
    name: row.name,
    kind: row.kind,
    model: row.model,
    baseUrl: row.baseUrl,
    apiKeyLast4: row.apiKeyLast4,
    hasApiKey: Boolean(row.apiKeyLast4 || row.apiKeyEnc),
    enabled: row.enabled,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastTestedAt: row.lastTestedAt,
    lastTestOk: row.lastTestOk,
    lastTestError: row.lastTestError,
  };
}

/** True when the public DTO accidentally contains a full secret. */
export function publicDtoLeaksApiKey(
  dto: OrgAiProviderPublicDto,
  originalKey: string,
): boolean {
  const original = originalKey.trim();
  if (!original) return false;
  const blob = JSON.stringify(dto);
  if (blob.includes(original)) return true;
  if (original.length > 8 && blob.includes(original.slice(0, 8))) return true;
  return false;
}

export function providerSupportsVision(kind: OrgAiProviderKind): boolean {
  return kind === "openai" || kind === "anthropic" || kind === "google";
}
