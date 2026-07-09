/**
 * Declarative automation between pipeline blocks / shared bus / deal workspace.
 *
 * Execution model (server): **single pass**, **no re-entry** — applying rules never
 * schedules another automation pass in the same mutation. **Cap** on how many
 * rules may mutate state per event (`MAX_PIPELINE_BLOCK_AUTOMATION_RULES_PER_EVENT`).
 */
import type { DealTabId } from "./file/dealTabGroups";

export const MAX_PIPELINE_BLOCK_AUTOMATION_RULES_PER_EVENT = 10;

export type SharedBusFieldKey =
  | "fundingAmount"
  | "interestRate"
  | "term"
  | "notes"
  | "commission"
  | "netRevenue";

export type PipelineAutomationTrigger =
  | {
      type: "shared_fields_changed";
      /** Fire when any of these shared-layer fields change (normalized bus). */
      fields: SharedBusFieldKey[];
    }
  | { type: "contact_linked" }
  | { type: "lender_attached" }
  | { type: "lender_selected" };

export type PipelineAutomationCondition =
  | { type: "all"; conditions: PipelineAutomationCondition[] }
  | { type: "always" }
  /** Deal file has embedded `dealData` object (workspace exists). */
  | { type: "has_deal_data" }
  /** `pipeline.scenario` is empty or whitespace. */
  | { type: "scenario_empty" }
  /** Link is newly inserted (not role update on existing link). */
  | { type: "contact_link_is_new" }
  /** Normalized role string includes substring (e.g. "borrow"). */
  | { type: "contact_role_contains"; needle: string };

export type PipelineAutomationAction =
  | {
      type: "recompute_pct_fee_totals_from_loan";
      /** Only when `fundingAmount` is among changed shared fields. */
      whenField: "fundingAmount";
    }
  | {
      type: "unhide_deal_workspace_tab_for_contact_role";
      /** Prefer borrower / guarantor tabs when role matches. */
      fallbackTab: DealTabId;
    }
  | {
      type: "prefill_scenario_from_lender";
      /** Max characters to copy from programs / niche text. */
      maxLen: number;
    };

export type PipelineBlockAutomationRule = {
  id: string;
  description?: string;
  trigger: PipelineAutomationTrigger;
  condition: PipelineAutomationCondition;
  action: PipelineAutomationAction;
};

export const PIPELINE_BLOCK_AUTOMATION_RULES: readonly PipelineBlockAutomationRule[] =
  [
    {
      id: "shared.funding.recalc_pct_fee_totals",
      description:
        "When shared funding changes via the data bus, refresh pct-based fee dollar lines.",
      trigger: { type: "shared_fields_changed", fields: ["fundingAmount"] },
      condition: { type: "always" },
      action: {
        type: "recompute_pct_fee_totals_from_loan",
        whenField: "fundingAmount",
      },
    },
    {
      id: "contact.linked.unhide_workspace_tab",
      description:
        "When a contact is linked to a file, reveal a relevant deal workspace tab.",
      trigger: { type: "contact_linked" },
      condition: {
        type: "all",
        conditions: [
          { type: "has_deal_data" },
          { type: "contact_link_is_new" },
        ],
      },
      action: {
        type: "unhide_deal_workspace_tab_for_contact_role",
        fallbackTab: "overview",
      },
    },
    {
      id: "lender.selected.prefill_scenario",
      description:
        "When a lender is chosen on the file, seed scenario text from lender programs if empty.",
      trigger: { type: "lender_selected" },
      condition: { type: "scenario_empty" },
      action: { type: "prefill_scenario_from_lender", maxLen: 480 },
    },
    {
      id: "lender.attached.prefill_scenario",
      description:
        "When a lender is attached, seed scenario text if still empty (lightweight nudge).",
      trigger: { type: "lender_attached" },
      condition: { type: "scenario_empty" },
      action: { type: "prefill_scenario_from_lender", maxLen: 480 },
    },
  ];

export function triggerMatchesEvent(
  rule: PipelineBlockAutomationRule,
  event: PipelineAutomationDispatchEvent,
): boolean {
  const t = rule.trigger;
  if (t.type === "shared_fields_changed") {
    return (
      event.type === "shared_fields_changed" &&
      event.changedKeys.some((k) => t.fields.includes(k))
    );
  }
  return t.type === event.type;
}

export type PipelineAutomationDispatchEvent =
  | {
      type: "shared_fields_changed";
      changedKeys: SharedBusFieldKey[];
      /** Only run loan-fee rule for shared-bus patch path (pipeline.patch has its own fee derivations). */
      feeContext: "patch_shared" | "skip_fee_derivation";
    }
  | {
      type: "contact_linked";
      role: string;
      isNewLink: boolean;
    }
  | { type: "lender_attached"; lenderId: string }
  | { type: "lender_selected"; lenderId: string };

export function evaluateAutomationCondition(
  cond: PipelineAutomationCondition,
  ctx: {
    hasDealData: boolean;
    scenarioEmpty: boolean;
    contactIsNewLink?: boolean;
    contactRoleNorm?: string;
  },
): boolean {
  switch (cond.type) {
    case "all":
      return cond.conditions.every((c) => evaluateAutomationCondition(c, ctx));
    case "always":
      return true;
    case "has_deal_data":
      return ctx.hasDealData;
    case "scenario_empty":
      return ctx.scenarioEmpty;
    case "contact_link_is_new":
      return ctx.contactIsNewLink === true;
    case "contact_role_contains": {
      const r = ctx.contactRoleNorm ?? "";
      return r.includes(cond.needle.toLowerCase());
    }
  }
  return false;
}
