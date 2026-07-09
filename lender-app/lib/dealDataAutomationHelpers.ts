/**
 * Pure helpers for deal-data mutations driven by pipeline automations.
 */
import type { DealTabId } from "./file/dealTabGroups";
import {
  parseDealWorkspaceLayoutFromUnknown,
  type DealWorkspaceLayoutV1,
} from "./file/dealWorkspaceLayout";

function pickTabForContactRole(roleNorm: string): DealTabId {
  if (roleNorm.includes("borrow")) return "borrowers";
  if (roleNorm.includes("guarant")) return "guarantors";
  if (roleNorm.includes("realtor") || roleNorm.includes("agent"))
    return "overview";
  if (roleNorm.includes("title")) return "workflow";
  return "overview";
}

export function unhideDealWorkspaceTabInDealData(
  dealData: unknown,
  roleNorm: string,
  fallbackTab: DealTabId,
): unknown {
  if (!dealData || typeof dealData !== "object" || Array.isArray(dealData)) {
    return dealData;
  }
  const d = dealData as Record<string, unknown>;
  const tab = roleNorm.trim()
    ? pickTabForContactRole(roleNorm)
    : fallbackTab;
  const layout = parseDealWorkspaceLayoutFromUnknown(d.dealWorkspaceLayout);
  if (!layout.hidden.includes(tab)) {
    return dealData;
  }
  const nextLayout: DealWorkspaceLayoutV1 = {
    ...layout,
    hidden: layout.hidden.filter((x) => x !== tab),
  };
  return { ...d, dealWorkspaceLayout: nextLayout };
}

export function buildLenderScenarioSeed(lender: {
  programs?: string;
  primaryNiche?: string;
}, maxLen: number): string | null {
  const programs = typeof lender.programs === "string" ? lender.programs.trim() : "";
  const niche =
    typeof lender.primaryNiche === "string" ? lender.primaryNiche.trim() : "";
  const raw = programs || niche;
  if (!raw) return null;
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen - 1)}…`;
}
