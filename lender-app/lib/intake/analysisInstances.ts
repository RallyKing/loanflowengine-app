import type { Doc } from "@/convex/_generated/dataModel";

export type Sheet = Doc<"intakeSheets">;

export type AnalysisInstanceV1<T = unknown> = {
  id: string;
  name: string;
  data: T;
};

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `a-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isInstanceList(
  raw: unknown
): raw is AnalysisInstanceV1<Record<string, unknown>>[] {
  if (!Array.isArray(raw) || raw.length === 0) return false;
  return raw.every(
    (x) =>
      x &&
      typeof x === "object" &&
      typeof (x as AnalysisInstanceV1).id === "string" &&
      typeof (x as AnalysisInstanceV1).name === "string" &&
      "data" in (x as AnalysisInstanceV1)
  );
}

/** @internal */
export function ensureInstanceList<T extends Record<string, unknown>>(
  draft: Sheet,
  key: string,
  legacyKey: string,
  emptyData: () => T,
  defaultName: string
): AnalysisInstanceV1<T>[] {
  const raw = (draft as unknown as Record<string, unknown>)[key];
  if (isInstanceList(raw)) {
    return raw as AnalysisInstanceV1<T>[];
  }
  const legacy = (draft as unknown as Record<string, unknown>)[legacyKey];
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
    const keys = Object.keys(legacy as object);
    if (keys.length > 0) {
      return [
        {
          id: "legacy",
          name: "Default",
          data: { ...(legacy as object) } as T,
        },
      ];
    }
  }
  return [{ id: newId(), name: defaultName, data: emptyData() }];
}

export function normalizeDtiInstances(
  draft: Sheet
): AnalysisInstanceV1<NonNullable<Sheet["dti"]>>[] {
  return ensureInstanceList(
    draft,
    "dtiInstances",
    "dti",
    () => ({}),
    "DTI 1"
  ) as AnalysisInstanceV1<NonNullable<Sheet["dti"]>>[];
}

export type ComparisonData = NonNullable<Sheet["comparison"]>;

export function normalizeComparisonInstances(
  draft: Sheet
): AnalysisInstanceV1<ComparisonData>[] {
  return ensureInstanceList(
    draft,
    "comparisonInstances",
    "comparison",
    () => ({}),
    "Comparison 1"
  ) as AnalysisInstanceV1<ComparisonData>[];
}

export type WeightedData = { rows: NonNullable<Sheet["weightedInterest"]> };

export function normalizeWeightedInstances(draft: Sheet): AnalysisInstanceV1<WeightedData>[] {
  const raw = (draft as unknown as Record<string, unknown>).weightedInterestInstances;
  if (isInstanceList(raw)) {
    return raw as AnalysisInstanceV1<WeightedData>[];
  }
  const rows = draft.weightedInterest;
  if (Array.isArray(rows) && rows.length > 0) {
    return [{ id: "legacy", name: "Default", data: { rows } }];
  }
  return [{ id: newId(), name: "Weighted 1", data: { rows: [{}] } }];
}

export type PayoffData = NonNullable<Sheet["payoff"]>;

export function normalizePayoffInstances(
  draft: Sheet
): AnalysisInstanceV1<PayoffData>[] {
  return ensureInstanceList(
    draft,
    "payoffInstances",
    "payoff",
    () => ({ periodYears: "30" }),
    "Payoff 1"
  ) as AnalysisInstanceV1<PayoffData>[];
}

export type DayCounterData = NonNullable<Sheet["dayCounter"]>;

export function normalizeDayCounterInstances(
  draft: Sheet
): AnalysisInstanceV1<DayCounterData>[] {
  return ensureInstanceList(
    draft,
    "dayCounterInstances",
    "dayCounter",
    () => ({}),
    "Day counter 1"
  ) as AnalysisInstanceV1<DayCounterData>[];
}

export function duplicateInstanceData<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}
