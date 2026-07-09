/**
 * User-defined “simple workflows”: whitelisted triggers and actions only.
 * Server execution caps side effects; runs after built-in pipeline automations.
 */

import {
  isKnownProvider,
  type IntegrationCategory,
} from "./integrations/catalog";
import { ALL_PIPELINE_BLOCK_IDS, type PipelineBlockId } from "./pipelineBlockRegistry";

export const MAX_USER_SIMPLE_WORKFLOW_RULES = 20;

export type UserWorkflowTrigger =
  | { type: "file_created" }
  | { type: "lender_selected" }
  | { type: "lender_attached" };

export type UserWorkflowAction =
  | { type: "show_drawer_block"; blockId: PipelineBlockId }
  | { type: "create_task_reminder"; title: string; body?: string }
  | {
      type: "enqueue_integration_job";
      category: IntegrationCategory;
      providerKey: string;
      kind: "action" | "sync_push";
      connectorPublicId?: string;
    }
  | {
      type: "emit_automation_webhook";
      includeFileSnapshot: boolean;
    };

export type UserSimpleWorkflowRule = {
  id: string;
  enabled: boolean;
  name?: string;
  trigger: UserWorkflowTrigger;
  action: UserWorkflowAction;
};

export type UserWorkflowDispatchEvent =
  | { type: "file_created" }
  | { type: "lender_selected"; lenderId: string }
  | { type: "lender_attached"; lenderId: string };

const TRIGGER_TYPES = new Set<UserWorkflowTrigger["type"]>([
  "file_created",
  "lender_selected",
  "lender_attached",
]);

const ACTION_TYPES = new Set<UserWorkflowAction["type"]>([
  "show_drawer_block",
  "create_task_reminder",
  "enqueue_integration_job",
  "emit_automation_webhook",
]);

export function userWorkflowTriggerMatches(
  trigger: UserWorkflowTrigger,
  event: UserWorkflowDispatchEvent,
): boolean {
  return trigger.type === event.type;
}

export function workflowTriggerLabel(trigger: UserWorkflowTrigger): string {
  switch (trigger.type) {
    case "file_created":
      return "Pipeline file created";
    case "lender_selected":
      return "Lender chosen on file";
    case "lender_attached":
      return "Lender attached to file";
    default:
      return String((trigger as UserWorkflowTrigger).type);
  }
}

export function workflowActionLabel(action: UserWorkflowAction): string {
  switch (action.type) {
    case "show_drawer_block":
      return "Show drawer section";
    case "create_task_reminder":
      return "Create task (reminder)";
    case "enqueue_integration_job":
      return "Enqueue integration job (external)";
    case "emit_automation_webhook":
      return "Send workflow webhook (outbound)";
    default:
      return String((action as UserWorkflowAction).type);
  }
}

function parseTrigger(o: Record<string, unknown>): UserWorkflowTrigger | null {
  const type = o.type;
  if (type === "file_created") return { type: "file_created" };
  if (type === "lender_selected") return { type: "lender_selected" };
  if (type === "lender_attached") return { type: "lender_attached" };
  return null;
}

function parseAction(o: Record<string, unknown>): UserWorkflowAction | null {
  const type = o.type;
  if (type === "show_drawer_block") {
    const blockId = o.blockId;
    if (typeof blockId !== "string" || !ALL_PIPELINE_BLOCK_IDS.has(blockId as PipelineBlockId)) {
      return null;
    }
    /** Never allow automating destructive sections via user workflows. */
    if (blockId === "dangerZone") return null;
    return { type: "show_drawer_block", blockId: blockId as PipelineBlockId };
  }
  if (type === "create_task_reminder") {
    const title =
      typeof o.title === "string" ? o.title.trim().slice(0, 200) : "";
    if (!title) return null;
    const body =
      typeof o.body === "string" && o.body.trim()
        ? o.body.trim().slice(0, 2000)
        : undefined;
    return { type: "create_task_reminder", title, body };
  }
  if (type === "enqueue_integration_job") {
    const category = o.category;
    if (
      category !== "crm" &&
      category !== "email" &&
      category !== "messaging"
    ) {
      return null;
    }
    const providerKey =
      typeof o.providerKey === "string"
        ? o.providerKey.trim().slice(0, 120)
        : "";
    if (!providerKey || !isKnownProvider(category, providerKey)) return null;
    const kind = o.kind;
    if (kind !== "action" && kind !== "sync_push") return null;
    const connectorPublicId =
      typeof o.connectorPublicId === "string" && o.connectorPublicId.trim()
        ? o.connectorPublicId.trim().toLowerCase().slice(0, 32)
        : undefined;
    return {
      type: "enqueue_integration_job",
      category,
      providerKey,
      kind,
      connectorPublicId,
    };
  }
  if (type === "emit_automation_webhook") {
    const includeFileSnapshot = Boolean(o.includeFileSnapshot);
    return { type: "emit_automation_webhook", includeFileSnapshot };
  }
  return null;
}

/** Stable idempotency key for workflow-triggered integration jobs (per file + trigger). */
export function workflowIntegrationIdempotencyKey(
  ruleId: string,
  event: UserWorkflowDispatchEvent,
  fileId: string,
): string {
  switch (event.type) {
    case "file_created":
      return `wf-int:${ruleId}:file_created:${fileId}`;
    case "lender_selected":
    case "lender_attached":
      return `wf-int:${ruleId}:${event.type}:${fileId}:${event.lenderId}`;
    default:
      return `wf-int:${ruleId}:unknown:${fileId}`;
  }
}

export function sanitizeUserSimpleWorkflowRules(raw: unknown): UserSimpleWorkflowRule[] {
  if (!Array.isArray(raw)) return [];
  const out: UserSimpleWorkflowRule[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_USER_SIMPLE_WORKFLOW_RULES) break;
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id =
      typeof o.id === "string" && o.id.trim()
        ? o.id.trim().slice(0, 64)
        : "";
    if (!id || seen.has(id)) continue;
    const enabled = Boolean(o.enabled);
    const nameRaw = o.name;
    const name =
      typeof nameRaw === "string" && nameRaw.trim()
        ? nameRaw.trim().slice(0, 120)
        : undefined;
    const triggerRaw = o.trigger;
    if (!triggerRaw || typeof triggerRaw !== "object") continue;
    const trigger = parseTrigger(triggerRaw as Record<string, unknown>);
    if (!trigger || !TRIGGER_TYPES.has(trigger.type)) continue;
    const actionRaw = o.action;
    if (!actionRaw || typeof actionRaw !== "object") continue;
    const action = parseAction(actionRaw as Record<string, unknown>);
    if (!action || !ACTION_TYPES.has(action.type)) continue;
    seen.add(id);
    out.push({ id, enabled, name, trigger, action });
  }
  return out;
}
