"use client";

/**
 * Org AI API keys + due diligence prompt library.
 * Settings → Integrations → AI API keys (`/settings/ai-providers`).
 */

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { KeyRound, Loader2, Plus, Sparkles, Star } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import { cn } from "@/lib/cn";
import {
  ORG_AI_DEFAULT_MODELS,
  ORG_AI_PROVIDER_KIND_LABELS,
  ORG_AI_PROVIDER_KINDS,
  type OrgAiProviderKind,
} from "@/lib/ai/orgAiProviders";
import {
  DUE_DILIGENCE_PROMPT_SEEDS,
  type DueDiligenceTemplateKey,
} from "@/lib/ai/dueDiligencePrompts";

type TabId = "providers" | "prompts";

type ProviderDraft = {
  providerId?: Id<"orgAiProviders">;
  name: string;
  kind: OrgAiProviderKind;
  model: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  isDefault: boolean;
};

const EMPTY_PROVIDER = (): ProviderDraft => ({
  name: "",
  kind: "openai",
  model: ORG_AI_DEFAULT_MODELS.openai,
  baseUrl: "",
  apiKey: "",
  enabled: true,
  isDefault: false,
});

type PromptDraft = {
  promptId?: Id<"dueDiligencePrompts">;
  title: string;
  description: string;
  templateKey: DueDiligenceTemplateKey;
  body: string;
  deployed: boolean;
};

const EMPTY_PROMPT = (): PromptDraft => ({
  title: "",
  description: "",
  templateKey: "custom",
  body: "",
  deployed: true,
});

export function AiProvidersSettingsManager() {
  const orgScope = useOrgConvexQueryArgs();
  const { can, effective } = useOrgPermissions();
  const canManage = can("settings.access");
  /** `can()` is false while Convex permissions are still pending — do not flash "no access". */
  const rbacPending = effective === undefined && !canManage;
  const [tab, setTab] = useState<TabId>("providers");

  const providers = useQuery(
    api.orgAiProviders.listProviders,
    orgScope
      ? {
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
        }
      : "skip",
  );
  const prompts = useQuery(
    api.dueDiligencePrompts.listPrompts,
    orgScope
      ? {
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
        }
      : "skip",
  );

  const upsertProvider = useMutation(api.orgAiProviders.upsertProvider);
  const setEnabled = useMutation(api.orgAiProviders.setProviderEnabled);
  const setDefault = useMutation(api.orgAiProviders.setDefaultProvider);
  const deleteProvider = useMutation(api.orgAiProviders.deleteProvider);
  const testConnection = useAction(api.dueDiligenceActions.testProviderConnection);

  const upsertPrompt = useMutation(api.dueDiligencePrompts.upsertPrompt);
  const setPromptDeployed = useMutation(api.dueDiligencePrompts.setPromptDeployed);
  const archivePrompt = useMutation(api.dueDiligencePrompts.archivePrompt);
  const seedPrompts = useMutation(api.dueDiligencePrompts.seedBuiltinPrompts);

  const [providerDraft, setProviderDraft] = useState<ProviderDraft | null>(null);
  const [promptDraft, setPromptDraft] = useState<PromptDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [pingingId, setPingingId] = useState<Id<"orgAiProviders"> | null>(null);

  const encryptionHint = useMemo(() => {
    const first = providers?.[0];
    if (!first) return null;
    return first.encryptionConfigured
      ? "Keys are encrypted at rest."
      : "Set CLIENT_PORTAL_FIELD_ENCRYPTION_KEY on Convex to encrypt keys at rest.";
  }, [providers]);

  if (!orgScope || rbacPending) {
    return (
      <div
        className="space-y-4"
        data-testid="ai-providers-settings"
        data-ai-providers-state="loading"
      >
        <p className="text-sm text-muted-foreground" role="status">
          Loading AI provider settings…
        </p>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div
        className="space-y-4"
        data-testid="ai-providers-settings"
        data-ai-providers-state="forbidden"
      >
        <p className="text-sm text-muted-foreground" role="status">
          You need settings access to manage AI API keys.
        </p>
      </div>
    );
  }

  async function saveProvider() {
    if (!orgScope || !providerDraft) return;
    setBusy(true);
    try {
      const result = await upsertProvider({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        providerId: providerDraft.providerId,
        name: providerDraft.name,
        kind: providerDraft.kind,
        model: providerDraft.model,
        baseUrl: providerDraft.baseUrl || undefined,
        apiKey: providerDraft.apiKey.trim() || undefined,
        enabled: providerDraft.enabled,
        isDefault: providerDraft.isDefault,
      });
      showOperationalToast({
        title: providerDraft.providerId ? "Provider updated" : "Provider saved",
        description: `Key ends in ${result.apiKeyLast4.replace(/^•+/, "") || "••••"}`,
        variant: "success",
      });
      setProviderDraft(null);
    } catch (e) {
      showOperationalToast({
        title: "Could not save provider",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function savePrompt() {
    if (!orgScope || !promptDraft) return;
    setBusy(true);
    try {
      await upsertPrompt({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        promptId: promptDraft.promptId,
        title: promptDraft.title,
        description: promptDraft.description || undefined,
        templateKey: promptDraft.templateKey,
        body: promptDraft.body,
        deployed: promptDraft.deployed,
      });
      showOperationalToast({
        title: promptDraft.promptId ? "Prompt updated" : "Prompt saved",
        description: promptDraft.deployed
          ? "Deployed to Due Diligence picker."
          : "Saved as draft (not deployed).",
        variant: "success",
      });
      setPromptDraft(null);
    } catch (e) {
      showOperationalToast({
        title: "Could not save prompt",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="ai-providers-settings">
      <div className="flex flex-wrap gap-1 rounded-dlc-md border border-border/60 bg-dlc-surface-low/40 p-1">
        {(
          [
            ["providers", "API keys"],
            ["prompts", "Due diligence prompts"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "rounded-dlc-sm px-3 py-2 text-sm duration-dlc-short ease-dlc-standard",
              tab === id
                ? "bg-dlc-surface font-medium text-foreground shadow-dlc-1"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab(id)}
            data-testid={`ai-settings-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "providers" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Bring your own OpenAI, Anthropic, Google Gemini, or any OpenAI-compatible
            base URL. After save, only the last four characters of the key are shown.
            {encryptionHint ? ` ${encryptionHint}` : ""}
          </p>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => setProviderDraft(EMPTY_PROVIDER())}
            data-testid="ai-provider-add"
          >
            <Plus className="h-3.5 w-3.5" />
            Add provider
          </Button>

          {providerDraft ? (
            <div
              className="space-y-3 rounded-dlc-lg border border-border/60 bg-dlc-surface p-4 shadow-dlc-1"
              data-testid="ai-provider-editor"
            >
              <Label>
                Display name
                <Input
                  value={providerDraft.name}
                  onChange={(e) =>
                    setProviderDraft((d) =>
                      d ? { ...d, name: e.target.value } : d,
                    )
                  }
                  placeholder="Production OpenAI"
                  data-testid="ai-provider-name"
                />
              </Label>
              <Label>
                Provider
                <Select
                  value={providerDraft.kind}
                  onChange={(e) => {
                    const kind = e.target.value as OrgAiProviderKind;
                    setProviderDraft((d) =>
                      d
                        ? {
                            ...d,
                            kind,
                            model: ORG_AI_DEFAULT_MODELS[kind],
                          }
                        : d,
                    );
                  }}
                  data-testid="ai-provider-kind"
                >
                  {ORG_AI_PROVIDER_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {ORG_AI_PROVIDER_KIND_LABELS[kind]}
                    </option>
                  ))}
                </Select>
              </Label>
              <Label>
                Model
                <Input
                  value={providerDraft.model}
                  onChange={(e) =>
                    setProviderDraft((d) =>
                      d ? { ...d, model: e.target.value } : d,
                    )
                  }
                  data-testid="ai-provider-model"
                />
              </Label>
              {providerDraft.kind === "custom" ? (
                <Label>
                  Base URL (https)
                  <Input
                    value={providerDraft.baseUrl}
                    onChange={(e) =>
                      setProviderDraft((d) =>
                        d ? { ...d, baseUrl: e.target.value } : d,
                      )
                    }
                    placeholder="https://api.example.com/v1"
                    data-testid="ai-provider-base-url"
                  />
                </Label>
              ) : null}
              <Label>
                API key
                {providerDraft.providerId
                  ? " (leave blank to keep existing)"
                  : ""}
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={providerDraft.apiKey}
                  onChange={(e) =>
                    setProviderDraft((d) =>
                      d ? { ...d, apiKey: e.target.value } : d,
                    )
                  }
                  placeholder={
                    providerDraft.providerId ? "•••• keep existing" : "sk-…"
                  }
                  data-testid="ai-provider-api-key"
                />
              </Label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={providerDraft.enabled}
                  onChange={(e) =>
                    setProviderDraft((d) =>
                      d ? { ...d, enabled: e.target.checked } : d,
                    )
                  }
                />
                Enabled
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={providerDraft.isDefault}
                  onChange={(e) =>
                    setProviderDraft((d) =>
                      d ? { ...d, isDefault: e.target.checked } : d,
                    )
                  }
                />
                Default for Due Diligence
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void saveProvider()}
                  data-testid="ai-provider-save"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setProviderDraft(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {providers === undefined ? (
            <p className="text-sm text-muted-foreground">Loading providers…</p>
          ) : providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No AI providers yet. Add one to run Due Diligence from the Document Vault.
            </p>
          ) : (
            <ul className="space-y-2" data-testid="ai-provider-list">
              {providers.map((p) => (
                <li
                  key={p._id}
                  className="flex flex-col gap-2 rounded-dlc-md border border-border/60 bg-dlc-surface px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`ai-provider-row-${p._id}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {ORG_AI_PROVIDER_KIND_LABELS[p.kind]} · {p.model}
                      </span>
                      {p.isDefault ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          <Star className="h-3 w-3" />
                          Default
                        </span>
                      ) : null}
                      {!p.enabled ? (
                        <span className="text-[11px] text-muted-foreground">
                          Disabled
                        </span>
                      ) : null}
                    </div>
                    <p
                      className="mt-1 font-mono text-xs text-muted-foreground"
                      data-testid={`ai-provider-mask-${p._id}`}
                    >
                      Key {p.apiKeyLast4 || "••••"}
                    </p>
                    {p.lastTestedAt ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Last test: {p.lastTestOk ? "ok" : p.lastTestError || "failed"}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pingingId === p._id}
                      onClick={() => {
                        setPingingId(p._id);
                        void testConnection({
                          organizationId: orgScope.organizationId,
                          providerId: p._id,
                          memberUserKey: orgScope.memberUserKey,
                        })
                          .then((r) => {
                            showOperationalToast({
                              title: r.ok ? "Connection ok" : "Connection failed",
                              description: r.error,
                              variant: r.ok ? "success" : "destructive",
                            });
                          })
                          .finally(() => setPingingId(null));
                      }}
                    >
                      {pingingId === p._id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Test
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setProviderDraft({
                          providerId: p._id,
                          name: p.name,
                          kind: p.kind,
                          model: p.model,
                          baseUrl: p.baseUrl ?? "",
                          apiKey: "",
                          enabled: p.enabled,
                          isDefault: p.isDefault,
                        })
                      }
                    >
                      Edit
                    </Button>
                    {!p.isDefault && p.enabled ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          void setDefault({
                            organizationId: orgScope.organizationId,
                            providerId: p._id,
                            memberUserKey: orgScope.memberUserKey,
                          })
                        }
                      >
                        Make default
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void setEnabled({
                          organizationId: orgScope.organizationId,
                          providerId: p._id,
                          enabled: !p.enabled,
                          memberUserKey: orgScope.memberUserKey,
                        })
                      }
                    >
                      {p.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() =>
                        void deleteProvider({
                          organizationId: orgScope.organizationId,
                          providerId: p._id,
                          memberUserKey: orgScope.memberUserKey,
                        })
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create, save, and deploy prompts used from Document Vault → Due Diligence.
            Deployed prompts appear in the picker; drafts stay here until you deploy them.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => setPromptDraft(EMPTY_PROMPT())}
              data-testid="ai-prompt-add"
            >
              <Plus className="h-3.5 w-3.5" />
              New prompt
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void seedPrompts({
                  organizationId: orgScope.organizationId,
                  memberUserKey: orgScope.memberUserKey,
                }).then((r) =>
                  showOperationalToast({
                    title:
                      r.seeded > 0
                        ? `Added ${r.seeded} starter prompts`
                        : "Starters already present",
                    variant: "success",
                  }),
                )
              }
              data-testid="ai-prompt-seed"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Add starter templates
            </Button>
          </div>

          {promptDraft ? (
            <div
              className="space-y-3 rounded-dlc-lg border border-border/60 bg-dlc-surface p-4 shadow-dlc-1"
              data-testid="ai-prompt-editor"
            >
              <Label>
                Title
                <Input
                  value={promptDraft.title}
                  onChange={(e) =>
                    setPromptDraft((d) =>
                      d ? { ...d, title: e.target.value } : d,
                    )
                  }
                  data-testid="ai-prompt-title"
                />
              </Label>
              <Label>
                Template type
                <Select
                  value={promptDraft.templateKey}
                  onChange={(e) => {
                    const templateKey = e.target.value as DueDiligenceTemplateKey;
                    const seed = DUE_DILIGENCE_PROMPT_SEEDS.find(
                      (s) => s.templateKey === templateKey,
                    );
                    setPromptDraft((d) =>
                      d
                        ? {
                            ...d,
                            templateKey,
                            title: d.title || seed?.title || d.title,
                            description: d.description || seed?.description || "",
                            body: d.body || seed?.body || d.body,
                          }
                        : d,
                    );
                  }}
                  data-testid="ai-prompt-template"
                >
                  <option value="custom">Custom</option>
                  <option value="fraud_irregularities">Fraud / irregularities</option>
                  <option value="loi_review">LOI review</option>
                  <option value="deal_analysis">Deal analysis</option>
                </Select>
              </Label>
              <Label>
                Description (optional)
                <Input
                  value={promptDraft.description}
                  onChange={(e) =>
                    setPromptDraft((d) =>
                      d ? { ...d, description: e.target.value } : d,
                    )
                  }
                />
              </Label>
              <Label>
                Prompt body
                <Textarea
                  rows={10}
                  value={promptDraft.body}
                  onChange={(e) =>
                    setPromptDraft((d) =>
                      d ? { ...d, body: e.target.value } : d,
                    )
                  }
                  data-testid="ai-prompt-body"
                />
              </Label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={promptDraft.deployed}
                  onChange={(e) =>
                    setPromptDraft((d) =>
                      d ? { ...d, deployed: e.target.checked } : d,
                    )
                  }
                  data-testid="ai-prompt-deployed"
                />
                Deploy to Due Diligence picker
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void savePrompt()}
                  data-testid="ai-prompt-save"
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPromptDraft(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {prompts === undefined ? (
            <p className="text-sm text-muted-foreground">Loading prompts…</p>
          ) : prompts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No prompts yet. Add starters or write a one-off prompt.
            </p>
          ) : (
            <ul className="space-y-2" data-testid="ai-prompt-list">
              {prompts.map((p) => (
                <li
                  key={p._id}
                  className="rounded-dlc-md border border-border/60 bg-dlc-surface px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{p.title}</div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {p.deployed ? "Deployed" : "Draft"}
                        {p.description ? ` · ${p.description}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPromptDraft({
                            promptId: p._id,
                            title: p.title,
                            description: p.description ?? "",
                            templateKey: p.templateKey,
                            body: p.body,
                            deployed: p.deployed,
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          void setPromptDeployed({
                            organizationId: orgScope.organizationId,
                            promptId: p._id,
                            deployed: !p.deployed,
                            memberUserKey: orgScope.memberUserKey,
                          })
                        }
                      >
                        {p.deployed ? "Undeploy" : "Deploy"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() =>
                          void archivePrompt({
                            organizationId: orgScope.organizationId,
                            promptId: p._id,
                            memberUserKey: orgScope.memberUserKey,
                          })
                        }
                      >
                        Archive
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
