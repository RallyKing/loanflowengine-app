/**
 * Organization-level integration inbound automations (webhook → side effects).
 * Validated server-side; small rule cap.
 */

import { isKnownProvider } from "./integrations/catalog";

export const MAX_ORG_INTEGRATION_AUTOMATION_RULES = 12;

export type OrgInboundAutomationAction =
  | { type: "create_org_task"; title: string; body?: string }
  | {
      type: "create_file_task";
      relatedFileId: string;
      title: string;
      body?: string;
      triageLabelId?: string;
      triageLabelName?: string;
      category?: "call";
      status?: "todo";
    }
  | {
      type: "enqueue_integration_job";
      category: "crm" | "email" | "messaging";
      providerKey: string;
      kind: "action" | "sync_push";
      connectorPublicId?: string;
    }
  | {
      /** Create/update a pipeline file + contact from inbound CRM webhook payload. */
      type: "upsert_pipeline_lead";
      /** Fallback status/slug when payload has no mappable stage. */
      defaultStatus?: string;
    };

export type OrganizationIntegrationRule = {
  id: string;
  enabled: boolean;
  name?: string;
  connectorPublicId?: string;
  action: OrgInboundAutomationAction;
};

function parseAction(
  o: Record<string, unknown>,
): OrgInboundAutomationAction | null {
  const type = o.type;
  if (type === "create_org_task") {
    const title =
      typeof o.title === "string" ? o.title.trim().slice(0, 200) : "";
    if (!title) return null;
    const body =
      typeof o.body === "string" && o.body.trim()
        ? o.body.trim().slice(0, 2000)
        : undefined;
    return { type: "create_org_task", title, body };
  }
  if (type === "create_file_task") {
    const relatedFileId =
      typeof o.relatedFileId === "string"
        ? o.relatedFileId.trim().slice(0, 64)
        : typeof o.pipelineFileId === "string"
          ? o.pipelineFileId.trim().slice(0, 64)
          : "";
    const title =
      typeof o.title === "string" ? o.title.trim().slice(0, 200) : "";
    if (!relatedFileId || !title) return null;
    const body =
      typeof o.body === "string" && o.body.trim()
        ? o.body.trim().slice(0, 2000)
        : typeof o.description === "string" && o.description.trim()
          ? o.description.trim().slice(0, 2000)
          : undefined;
    const triageLabelId =
      typeof o.triageLabelId === "string" && o.triageLabelId.trim()
        ? o.triageLabelId.trim().slice(0, 64)
        : undefined;
    const triageLabelName =
      typeof o.triageLabelName === "string" && o.triageLabelName.trim()
        ? o.triageLabelName.trim().slice(0, 120)
        : undefined;
    const categoryRaw =
      typeof o.category === "string" ? o.category.trim().toLowerCase() : "";
    if (categoryRaw && categoryRaw !== "call") return null;
    const statusRaw =
      typeof o.status === "string" ? o.status.trim().toLowerCase() : "";
    if (statusRaw && statusRaw !== "todo") return null;
    return {
      type: "create_file_task",
      relatedFileId,
      title,
      body,
      triageLabelId,
      triageLabelName,
      category: "call" as const,
      status: "todo" as const,
    };
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
    const pkTrim =
      typeof o.providerKey === "string" ? o.providerKey.trim().slice(0, 120) : "";
    if (!pkTrim) return null;
    if (!isKnownProvider(category, pkTrim)) return null;
    const kind = o.kind;
    if (kind !== "action" && kind !== "sync_push") return null;
    const connectorPublicId =
      typeof o.connectorPublicId === "string" && o.connectorPublicId.trim()
        ? o.connectorPublicId.trim().toLowerCase().slice(0, 32)
        : undefined;
    return {
      type: "enqueue_integration_job",
      category,
      providerKey: pkTrim,
      kind,
      connectorPublicId,
    };
  }
  if (type === "upsert_pipeline_lead") {
    const defaultStatus =
      typeof o.defaultStatus === "string" && o.defaultStatus.trim()
        ? o.defaultStatus.trim().slice(0, 64)
        : undefined;
    return {
      type: "upsert_pipeline_lead",
      defaultStatus,
    };
  }
  return null;
}

export function sanitizeOrganizationIntegrationRules(
  raw: unknown,
): OrganizationIntegrationRule[] {
  if (!Array.isArray(raw)) return [];
  const out: OrganizationIntegrationRule[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_ORG_INTEGRATION_AUTOMATION_RULES) break;
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id =
      typeof o.id === "string" && o.id.trim()
        ? o.id.trim().slice(0, 64)
        : "";
    if (!id || seen.has(id)) continue;
    const enabled = Boolean(o.enabled);
    const name =
      typeof o.name === "string" && o.name.trim()
        ? o.name.trim().slice(0, 120)
        : undefined;
    const cpRaw = o.connectorPublicId;
    const connectorPublicId =
      typeof cpRaw === "string" && cpRaw.trim()
        ? cpRaw.trim().toLowerCase().slice(0, 32)
        : undefined;
    const actionRaw = o.action;
    if (!actionRaw || typeof actionRaw !== "object") continue;
    const action = parseAction(actionRaw as Record<string, unknown>);
    if (!action) continue;
    seen.add(id);
    out.push({ id, enabled, name, connectorPublicId, action });
  }
  return out;
}
