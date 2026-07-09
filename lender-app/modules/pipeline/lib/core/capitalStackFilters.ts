import {
  CAPITAL_SOURCE_TYPES,
  type CapitalSourceType,
  type ProjectCapitalRollup,
} from "@/lib/projectCapitalStack";

export const PIPELINE_CAPITAL_FILTER_STORAGE_KEY =
  "dlc.pipeline.hub.capitalStackFilters.v1";

export type PipelineCapitalStackFilters = {
  fundingHealth: "any" | "underfunded" | "fully_funded";
  sourceType: CapitalSourceType | "any";
  /** Minimum remaining gap (dollars); 0 = off */
  gapThreshold: number;
};

export const DEFAULT_PIPELINE_CAPITAL_STACK_FILTERS: PipelineCapitalStackFilters =
  {
    fundingHealth: "any",
    sourceType: "any",
    gapThreshold: 0,
  };

export function loadPipelineCapitalStackFilters(): PipelineCapitalStackFilters {
  if (typeof window === "undefined") {
    return DEFAULT_PIPELINE_CAPITAL_STACK_FILTERS;
  }
  try {
    const raw = window.localStorage.getItem(PIPELINE_CAPITAL_FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_PIPELINE_CAPITAL_STACK_FILTERS;
    const parsed = JSON.parse(raw) as Partial<PipelineCapitalStackFilters>;
    return {
      fundingHealth:
        parsed.fundingHealth === "underfunded" ||
        parsed.fundingHealth === "fully_funded"
          ? parsed.fundingHealth
          : "any",
      sourceType:
        parsed.sourceType === "any"
          ? "any"
          : parsed.sourceType &&
              CAPITAL_SOURCE_TYPES.includes(parsed.sourceType as CapitalSourceType)
            ? (parsed.sourceType as CapitalSourceType)
            : "any",
      gapThreshold:
        typeof parsed.gapThreshold === "number" && parsed.gapThreshold >= 0
          ? parsed.gapThreshold
          : 0,
    };
  } catch {
    return DEFAULT_PIPELINE_CAPITAL_STACK_FILTERS;
  }
}

export function savePipelineCapitalStackFilters(
  filters: PipelineCapitalStackFilters,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PIPELINE_CAPITAL_FILTER_STORAGE_KEY,
      JSON.stringify(filters),
    );
  } catch {
    /* private mode */
  }
}

export function rowMatchesCapitalStackFilter(
  row: {
    projectCapitalRollup?: ProjectCapitalRollup | null;
    projectId?: string | null;
  },
  filters: PipelineCapitalStackFilters,
): boolean {
  const rollup = row.projectCapitalRollup;
  if (filters.fundingHealth === "fully_funded") {
    if (!rollup || rollup.gapHealth !== "complete") return false;
  }
  if (filters.fundingHealth === "underfunded") {
    if (!rollup) return true;
    if (rollup.gapHealth === "complete") return false;
  }
  if (filters.gapThreshold > 0) {
    const gap = rollup?.remainingGap ?? 0;
    if (gap < filters.gapThreshold) return false;
  }
  if (filters.sourceType !== "any") {
    if (!rollup?.sourceTypes?.includes(filters.sourceType)) return false;
  }
  return true;
}

export function capitalStackSearchHaystack(
  row: {
    searchText: string;
    projectCapitalRollup?: ProjectCapitalRollup | null;
    clientDisplayName?: string;
    projectDisplayTitle?: string;
  },
): string {
  const blob = row.projectCapitalRollup?.searchBlob ?? "";
  return `${row.searchText} ${blob} ${row.clientDisplayName ?? ""} ${row.projectDisplayTitle ?? ""}`.toLowerCase();
}
