"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ADVANCED_PIPELINE_BLOCK_IDS } from "@/lib/orgPlanFeatures";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import {
  PIPELINE_BLOCK_IDS,
  getPipelineBlock,
} from "@/lib/pipelineBlockRegistry";
import type { PipelineBlockId } from "@/lib/pipelineBlockRegistry";
import {
  MAX_USER_SIMPLE_WORKFLOW_RULES,
  sanitizeUserSimpleWorkflowRules,
  type UserSimpleWorkflowRule,
  type UserWorkflowAction,
  type UserWorkflowTrigger,
  workflowActionLabel,
  workflowTriggerLabel,
} from "@/lib/userWorkflowsModel";
import {
  CONNECTOR_CATALOG,
  type IntegrationCategory,
} from "@/lib/integrations/catalog";
import { Plus, Trash2, Workflow } from "lucide-react";
import {
  TrustErrorBlock,
  TrustListSkeleton,
} from "@/components/trust/TrustSurfaces";
import { formatTrustSafeError } from "@/lib/portalTrustErrors";

type UserSimpleWorkflowsSectionProps = {
  accountId: string;
  canPersist: boolean;
  /** When set with `memberUserKey`, server enforces plan for automation + integrations. */
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
};

function buildBlockChoices(advancedOk: boolean): PipelineBlockId[] {
  const base = PIPELINE_BLOCK_IDS.filter(
    (id) => id !== "dangerZone" && id !== "archive",
  );
  if (advancedOk) return [...base];
  return base.filter((id) => !ADVANCED_PIPELINE_BLOCK_IDS.has(id));
}

const TRIGGER_OPTIONS: { value: UserWorkflowTrigger["type"]; label: string }[] =
  [
    { value: "file_created", label: "Pipeline file created" },
    { value: "lender_selected", label: "Lender chosen on file" },
    { value: "lender_attached", label: "Lender attached to file" },
  ];

const ACTION_OPTIONS: {
  value: UserWorkflowAction["type"];
  label: string;
}[] = [
  { value: "show_drawer_block", label: "Show drawer section" },
  { value: "create_task_reminder", label: "Create task (reminder)" },
  { value: "enqueue_integration_job", label: "Enqueue integration job" },
  { value: "emit_automation_webhook", label: "Send workflow webhook (outbound)" },
];

function defaultEnqueueIntegrationAction(
  category: IntegrationCategory = "crm",
): Extract<UserWorkflowAction, { type: "enqueue_integration_job" }> {
  const first = CONNECTOR_CATALOG[category][0];
  return {
    type: "enqueue_integration_job",
    category,
    providerKey: first.key,
    kind: "action",
  };
}

function newRuleId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `wf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultRule(): UserSimpleWorkflowRule {
  return {
    id: newRuleId(),
    enabled: true,
    name: "",
    trigger: { type: "file_created" },
    action: { type: "show_drawer_block", blockId: "tasks" },
  };
}

export function UserSimpleWorkflowsSection({
  accountId,
  canPersist,
  organizationId,
  memberUserKey,
}: UserSimpleWorkflowsSectionProps) {
  const entitlements = useQuery(
    api.organizationPlan.featureEntitlements,
    organizationId && memberUserKey?.trim()
      ? {
          organizationId,
          memberUserKey: memberUserKey.trim(),
        }
      : "skip",
  );

  const integrationsOk =
    !organizationId || (entitlements?.integrations ?? false);
  const advancedOk =
    !organizationId || (entitlements?.advanced_blocks ?? false);

  const blockChoices = useMemo(
    () => buildBlockChoices(advancedOk),
    [advancedOk],
  );

  const actionOptions = useMemo(() => {
    if (integrationsOk) return ACTION_OPTIONS;
    return ACTION_OPTIONS.filter((o) => o.value !== "enqueue_integration_job");
  }, [integrationsOk]);

  const serverRow = useQuery(
    api.userSimpleWorkflows.getByAccountId,
    accountId.trim() ? { accountId } : "skip",
  );
  const replaceRules = useMutation(api.userSimpleWorkflows.replaceRules);

  const [draft, setDraft] = useState<UserSimpleWorkflowRule[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAck, setSavedAck] = useState(false);

  useEffect(() => {
    if (serverRow === undefined) return;
    if (!hydrated) {
      const rules = serverRow?.rules;
      if (Array.isArray(rules) && rules.length > 0) {
        setDraft(rules as UserSimpleWorkflowRule[]);
      } else {
        setDraft([]);
      }
      setHydrated(true);
    }
  }, [serverRow, hydrated]);

  const dirty = useMemo(() => {
    if (!hydrated || serverRow === undefined) return false;
    const a = JSON.stringify(draft);
    const b = JSON.stringify(serverRow?.rules ?? []);
    return a !== b;
  }, [draft, serverRow, hydrated]);

  useEffect(() => {
    if (dirty) setSavedAck(false);
  }, [dirty]);

  const planGateMessage = organizationId
    ? entitlements === undefined
      ? "Checking team plan for workflow features…"
      : !entitlements.automation
        ? "Automation is not included in your team plan. Upgrade to Pro (or higher) to use simple workflows."
        : null
    : null;

  const controlsDisabled =
    Boolean(organizationId) &&
    (entitlements === undefined || !entitlements.automation);

  const addRule = useCallback(() => {
    setDraft((d) => {
      if (d.length >= MAX_USER_SIMPLE_WORKFLOW_RULES) return d;
      return [...d, defaultRule()];
    });
  }, []);

  const removeRule = useCallback((id: string) => {
    setDraft((d) => d.filter((r) => r.id !== id));
  }, []);

  const updateRule = useCallback(
    (id: string, patch: Partial<UserSimpleWorkflowRule>) => {
      setDraft((d) =>
        d.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

  const save = useCallback(async () => {
    if (!canPersist || !accountId || controlsDisabled) return;
    setSaving(true);
    setSaveError(null);
    try {
      await replaceRules({
        accountId,
        rules: draft,
        ...(organizationId && memberUserKey?.trim()
          ? {
              organizationId,
              memberUserKey: memberUserKey.trim(),
            }
          : {}),
      });
      setDraft(sanitizeUserSimpleWorkflowRules(draft));
      setSavedAck(true);
      window.setTimeout(() => setSavedAck(false), 8000);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Could not save workflows.";
      setSaveError(formatTrustSafeError(raw).detail ?? raw);
    } finally {
      setSaving(false);
    }
  }, [
    accountId,
    canPersist,
    controlsDisabled,
    draft,
    replaceRules,
    organizationId,
    memberUserKey,
  ]);

  if (!canPersist || !accountId) {
    return (
      <p className="text-xs text-muted-foreground" role="status">
        Sign in or enable storage for your account to configure workflows.
      </p>
    );
  }

  if (serverRow === undefined || !hydrated) {
    return (
      <div className="border-t border-border/60 pt-4">
        <TrustListSkeleton rows={4} label="Loading workflow rules" />
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t border-border/60 pt-4">
      <div className="flex items-start gap-2">
        <Workflow className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">Simple workflows</p>
          <p className="text-xs text-muted-foreground">
            When something happens on a pipeline file, run one allowed action. Rules run on the
            server <span className="font-medium">after</span> built-in automation, use a fixed
            trigger list, and are capped at six actions per event. Successful runs appear in each
            file&apos;s history for traceability. Integration and webhook actions require an{" "}
            <span className="font-medium">organization</span> file and appropriate membership.
          </p>
        </div>
      </div>

      {planGateMessage ? (
        <p className="text-xs text-amber-800 dark:text-amber-200" role="status">
          {planGateMessage}
        </p>
      ) : null}

      <ul className="space-y-3">
        {draft.map((rule, idx) => (
          <li
            key={rule.id}
            className="rounded-lg border border-border/70 bg-muted/20 p-3 sm:p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Rule {idx + 1}
              </span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-[rgb(var(--primary))]"
                    checked={rule.enabled}
                    disabled={controlsDisabled}
                    onChange={(e) =>
                      updateRule(rule.id, { enabled: e.target.checked })
                    }
                  />
                  On
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-destructive hover:text-destructive"
                  disabled={controlsDisabled}
                  onClick={() => removeRule(rule.id)}
                  aria-label={`Remove rule ${idx + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor={`wf-name-${rule.id}`}>
                  Label (optional)
                </label>
                <Input
                  id={`wf-name-${rule.id}`}
                  value={rule.name ?? ""}
                  placeholder="e.g. Open Tasks on new file"
                  disabled={controlsDisabled}
                  onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                  className="w-full"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor={`wf-tr-${rule.id}`}>
                  When
                </label>
                <Select
                  id={`wf-tr-${rule.id}`}
                  value={rule.trigger.type}
                  disabled={controlsDisabled}
                  onChange={(e) => {
                    const t = e.target.value as UserWorkflowTrigger["type"];
                    const trigger: UserWorkflowTrigger =
                      t === "file_created"
                        ? { type: "file_created" }
                        : t === "lender_selected"
                          ? { type: "lender_selected" }
                          : { type: "lender_attached" };
                    updateRule(rule.id, { trigger });
                  }}
                  className="w-full"
                >
                  {TRIGGER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {workflowTriggerLabel(rule.trigger)}
                </p>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor={`wf-act-${rule.id}`}>
                  Then
                </label>
                <Select
                  id={`wf-act-${rule.id}`}
                  value={rule.action.type}
                  disabled={controlsDisabled}
                  onChange={(e) => {
                    const t = e.target.value as UserWorkflowAction["type"];
                    if (t === "show_drawer_block") {
                      updateRule(rule.id, {
                        action: {
                          type: "show_drawer_block",
                          blockId: "tasks",
                        },
                      });
                    } else if (t === "create_task_reminder") {
                      updateRule(rule.id, {
                        action: {
                          type: "create_task_reminder",
                          title: "Follow up on file",
                        },
                      });
                    } else if (t === "enqueue_integration_job") {
                      updateRule(rule.id, {
                        action: defaultEnqueueIntegrationAction(),
                      });
                    } else {
                      updateRule(rule.id, {
                        action: {
                          type: "emit_automation_webhook",
                          includeFileSnapshot: true,
                        },
                      });
                    }
                  }}
                  className="w-full"
                >
                  {actionOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>

              {rule.action.type === "show_drawer_block" ? (
                <div className="space-y-1">
                  <label
                    className="text-xs text-muted-foreground"
                    htmlFor={`wf-block-${rule.id}`}
                  >
                    Section
                  </label>
                  <Select
                    id={`wf-block-${rule.id}`}
                    value={rule.action.blockId}
                    disabled={controlsDisabled}
                    onChange={(e) => {
                      const blockId = e.target.value as PipelineBlockId;
                      updateRule(rule.id, {
                        action: { type: "show_drawer_block", blockId },
                      });
                    }}
                    className="w-full"
                  >
                    {blockChoices.map((bid) => (
                      <option key={bid} value={bid}>
                        {getPipelineBlock(bid).label}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : rule.action.type === "create_task_reminder" ? (
                <div className="space-y-1 sm:col-span-1">
                  <label
                    className="text-xs text-muted-foreground"
                    htmlFor={`wf-title-${rule.id}`}
                  >
                    Task title
                  </label>
                  <Input
                    id={`wf-title-${rule.id}`}
                    value={rule.action.title}
                    disabled={controlsDisabled}
                    onChange={(e) => {
                      if (rule.action.type !== "create_task_reminder") return;
                      updateRule(rule.id, {
                        action: {
                          type: "create_task_reminder",
                          title: e.target.value,
                          body: rule.action.body,
                        },
                      });
                    }}
                    className="w-full"
                  />
                </div>
              ) : rule.action.type === "enqueue_integration_job" ? (
                <div className="space-y-2 sm:col-span-2">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="space-y-1">
                      <label
                        className="text-xs text-muted-foreground"
                        htmlFor={`wf-int-cat-${rule.id}`}
                      >
                        Category
                      </label>
                      <Select
                        id={`wf-int-cat-${rule.id}`}
                        value={rule.action.category}
                        disabled={controlsDisabled}
                        onChange={(e) => {
                          if (rule.action.type !== "enqueue_integration_job") return;
                          const category = e.target.value as IntegrationCategory;
                          const first = CONNECTOR_CATALOG[category][0];
                          updateRule(rule.id, {
                            action: {
                              type: "enqueue_integration_job",
                              category,
                              providerKey: first.key,
                              kind: rule.action.kind,
                              connectorPublicId: rule.action.connectorPublicId,
                            },
                          });
                        }}
                        className="w-full"
                      >
                        <option value="crm">CRM</option>
                        <option value="email">Email</option>
                        <option value="messaging">Messaging</option>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label
                        className="text-xs text-muted-foreground"
                        htmlFor={`wf-int-prov-${rule.id}`}
                      >
                        Provider
                      </label>
                      <Select
                        id={`wf-int-prov-${rule.id}`}
                        value={rule.action.providerKey}
                        disabled={controlsDisabled}
                        onChange={(e) => {
                          if (rule.action.type !== "enqueue_integration_job") return;
                          updateRule(rule.id, {
                            action: {
                              ...rule.action,
                              providerKey: e.target.value,
                            },
                          });
                        }}
                        className="w-full"
                      >
                        {CONNECTOR_CATALOG[rule.action.category].map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label
                        className="text-xs text-muted-foreground"
                        htmlFor={`wf-int-kind-${rule.id}`}
                      >
                        Job kind
                      </label>
                      <Select
                        id={`wf-int-kind-${rule.id}`}
                        value={rule.action.kind}
                        disabled={controlsDisabled}
                        onChange={(e) => {
                          if (rule.action.type !== "enqueue_integration_job") return;
                          const kind = e.target.value as "action" | "sync_push";
                          updateRule(rule.id, {
                            action: {
                              ...rule.action,
                              kind,
                            },
                          });
                        }}
                        className="w-full"
                      >
                        <option value="action">Action</option>
                        <option value="sync_push">Sync push</option>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label
                      className="text-xs text-muted-foreground"
                      htmlFor={`wf-int-conn-${rule.id}`}
                    >
                      Connector public ID (optional)
                    </label>
                    <Input
                      id={`wf-int-conn-${rule.id}`}
                      value={rule.action.connectorPublicId ?? ""}
                      disabled={controlsDisabled}
                      onChange={(e) => {
                        if (rule.action.type !== "enqueue_integration_job") return;
                        const v = e.target.value.trim();
                        updateRule(rule.id, {
                          action: {
                            ...rule.action,
                            connectorPublicId: v ? v.toLowerCase() : undefined,
                          },
                        });
                      }}
                      className="w-full font-mono text-xs"
                      placeholder="e.g. ab12cd34"
                    />
                  </div>
                </div>
              ) : rule.action.type === "emit_automation_webhook" ? (
                <div className="space-y-1 sm:col-span-2">
                  <label className="flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border accent-[rgb(var(--primary))]"
                      checked={rule.action.includeFileSnapshot}
                      disabled={controlsDisabled}
                      onChange={(e) => {
                        if (rule.action.type !== "emit_automation_webhook") return;
                        updateRule(rule.id, {
                          action: {
                            type: "emit_automation_webhook",
                            includeFileSnapshot: e.target.checked,
                          },
                        });
                      }}
                    />
                    Include full pipeline file in webhook payload
                  </label>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    HTTPS POST with JSON body <code className="text-xs">workflow.automation</code>.
                    Verify using your signing secret: HMAC-SHA256 over{" "}
                    <code className="text-xs">X-Webhook-Timestamp + &quot;.&quot; + rawBody</code>,
                    compared to <code className="text-xs">X-Webhook-Signature</code> (after the{" "}
                    <code className="text-xs">sha256=</code> prefix). Reject replays when the
                    timestamp skew is large. Payload includes organization id and a stable{" "}
                    <code className="text-xs">eventId</code> for idempotent handling; optional full
                    file snapshot is labeled in the envelope when enabled above.
                  </p>
                </div>
              ) : null}
            </div>

            {rule.action.type === "create_task_reminder" ? (
              <div className="mt-3 space-y-1">
                <label
                  className="text-xs text-muted-foreground"
                  htmlFor={`wf-body-${rule.id}`}
                >
                  Notes (optional)
                </label>
                <Input
                  id={`wf-body-${rule.id}`}
                  value={rule.action.body ?? ""}
                  disabled={controlsDisabled}
                  onChange={(e) => {
                    if (rule.action.type !== "create_task_reminder") return;
                    updateRule(rule.id, {
                      action: {
                        type: "create_task_reminder",
                        title: rule.action.title,
                        body: e.target.value || undefined,
                      },
                    });
                  }}
                  className="w-full"
                  placeholder="Optional description"
                />
              </div>
            ) : null}

            <p className="mt-2 text-[11px] text-muted-foreground">
              {workflowActionLabel(rule.action)}
            </p>
          </li>
        ))}
      </ul>

      {draft.length >= MAX_USER_SIMPLE_WORKFLOW_RULES ? (
        <p className="text-xs text-muted-foreground">
          Maximum {MAX_USER_SIMPLE_WORKFLOW_RULES} rules for this account.
        </p>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={controlsDisabled}
          onClick={addRule}
        >
          <Plus className="h-4 w-4" />
          Add rule
        </Button>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving || controlsDisabled}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save workflows"}
        </Button>
        {savedAck ? (
          <p className="text-xs text-muted-foreground" role="status">
            Workflow rules saved.
          </p>
        ) : null}
        {saveError ? (
          <TrustErrorBlock
            title="Workflows not saved"
            description={saveError}
            className="max-w-xl border-destructive/30 bg-destructive/[0.03] py-2.5"
          />
        ) : null}
      </div>
    </div>
  );
}
