/**
 * **Runtime** drawer visibility from deal context (`dealData` on the pipeline row).
 * Does not mutate `fileDrawerLayout` — blocks stay in layout and keep persisted data;
 * they are simply omitted from the render list until conditions match again.
 */

export type DrawerVisibilitySignals = {
  dealTypeNorm: string;
  fundingTypeNorm: string;
};

export type PipelineBlockVisibilityPath = "dealType" | "fundingType";

export type PipelineBlockVisibilityOp =
  | "equalsIgnoreCase"
  | "containsIgnoreCase"
  | "startsWithIgnoreCase";

export type PipelineBlockVisibilityCondition = {
  path: PipelineBlockVisibilityPath;
  op: PipelineBlockVisibilityOp;
  value: string;
};

/** Per-block rule: `all` = every condition must pass; `any` = at least one. */
export type PipelineBlockVisibilitySpec = {
  match: "all" | "any";
  conditions: readonly PipelineBlockVisibilityCondition[];
};

export function extractDrawerVisibilitySignals(
  dealData: unknown,
): DrawerVisibilitySignals {
  if (!dealData || typeof dealData !== "object" || Array.isArray(dealData)) {
    return { dealTypeNorm: "", fundingTypeNorm: "" };
  }
  const d = dealData as Record<string, unknown>;
  const dealType = typeof d.dealType === "string" ? d.dealType : "";
  const scenario =
    d.scenario && typeof d.scenario === "object" && !Array.isArray(d.scenario)
      ? (d.scenario as Record<string, unknown>)
      : null;
  const cover =
    d.cover && typeof d.cover === "object" && !Array.isArray(d.cover)
      ? (d.cover as Record<string, unknown>)
      : null;
  const ftRaw =
    (typeof d.fundingType === "string" && d.fundingType) ||
    (scenario &&
    typeof scenario.fundingType === "string" &&
    scenario.fundingType
      ? scenario.fundingType
      : "") ||
    (cover && typeof cover.fundingType === "string" && cover.fundingType
      ? cover.fundingType
      : "") ||
    "";
  return {
    dealTypeNorm: dealType.trim().toLowerCase(),
    fundingTypeNorm: String(ftRaw).trim().toLowerCase(),
  };
}

function evaluateCondition(
  cond: PipelineBlockVisibilityCondition,
  signals: DrawerVisibilitySignals,
): boolean {
  const hay =
    cond.path === "dealType" ? signals.dealTypeNorm : signals.fundingTypeNorm;
  const needle = cond.value.trim().toLowerCase();
  if (!needle) return false;
  switch (cond.op) {
    case "equalsIgnoreCase":
      return hay === needle;
    case "containsIgnoreCase":
      return hay.includes(needle);
    case "startsWithIgnoreCase":
      return hay.startsWith(needle);
    default:
      return false;
  }
}

export function blockMeetsVisibilitySpec(
  spec: PipelineBlockVisibilitySpec | undefined,
  signals: DrawerVisibilitySignals,
): boolean {
  if (!spec || spec.conditions.length === 0) return true;
  const results = spec.conditions.map((c) => evaluateCondition(c, signals));
  return spec.match === "all" ? results.every(Boolean) : results.some(Boolean);
}
