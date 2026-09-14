/**
 * Campus-group expand/collapse for DC award radar grouped view.
 * UI-only — no Convex reads/writes. Default matches current radar: all expanded.
 */

import { parseJsonUnknown } from "./safeJson";

export const DC_AWARD_GROUP_EXPANSION_STORAGE_KEY =
  "dlc.dcAwardRadar.campusGroupExpansion.v1";

/** Matches `dcAwardSignals.list` page cap — do not persist unbounded keys. */
export const DC_AWARD_GROUP_EXPANSION_MAX_EXCEPTIONS = 200;

export type DcAwardRadarGroupExpansion = {
  /**
   * When true, groups start collapsed (Collapse all). When false, groups start
   * expanded (default / Expand all). `exceptions` flips individual keys.
   */
  collapsedByDefault: boolean;
  exceptions: ReadonlySet<string>;
};

export const DEFAULT_DC_AWARD_GROUP_EXPANSION: DcAwardRadarGroupExpansion = {
  collapsedByDefault: false,
  exceptions: new Set(),
};

type PersistV1 = {
  version: 1;
  collapsedByDefault: boolean;
  exceptions: string[];
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isDcAwardCampusGroupExpanded(
  groupKey: string,
  expansion: DcAwardRadarGroupExpansion,
): boolean {
  const isException = expansion.exceptions.has(groupKey);
  return expansion.collapsedByDefault ? isException : !isException;
}

export function toggleDcAwardCampusGroup(
  groupKey: string,
  expansion: DcAwardRadarGroupExpansion,
): DcAwardRadarGroupExpansion {
  const next = new Set(expansion.exceptions);
  if (next.has(groupKey)) next.delete(groupKey);
  else next.add(groupKey);
  return {
    collapsedByDefault: expansion.collapsedByDefault,
    exceptions: next,
  };
}

export function collapseAllDcAwardCampusGroups(): DcAwardRadarGroupExpansion {
  return { collapsedByDefault: true, exceptions: new Set() };
}

export function expandAllDcAwardCampusGroups(): DcAwardRadarGroupExpansion {
  return { collapsedByDefault: false, exceptions: new Set() };
}

export function areAllDcAwardCampusGroupsCollapsed(
  groupKeys: readonly string[],
  expansion: DcAwardRadarGroupExpansion,
): boolean {
  return (
    groupKeys.length > 0 &&
    groupKeys.every((key) => !isDcAwardCampusGroupExpanded(key, expansion))
  );
}

export function areAllDcAwardCampusGroupsExpanded(
  groupKeys: readonly string[],
  expansion: DcAwardRadarGroupExpansion,
): boolean {
  return (
    groupKeys.length > 0 &&
    groupKeys.every((key) => isDcAwardCampusGroupExpanded(key, expansion))
  );
}

export function parseDcAwardRadarGroupExpansion(
  raw: unknown,
): DcAwardRadarGroupExpansion {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_DC_AWARD_GROUP_EXPANSION;
  }
  const record = raw as Record<string, unknown>;
  if (record.version !== 1) {
    return DEFAULT_DC_AWARD_GROUP_EXPANSION;
  }
  if (typeof record.collapsedByDefault !== "boolean") {
    return DEFAULT_DC_AWARD_GROUP_EXPANSION;
  }
  const exceptionsRaw = record.exceptions;
  if (!Array.isArray(exceptionsRaw)) {
    return DEFAULT_DC_AWARD_GROUP_EXPANSION;
  }
  const exceptions = new Set<string>();
  for (const item of exceptionsRaw) {
    if (!isNonEmptyString(item)) continue;
    exceptions.add(item);
    if (exceptions.size >= DC_AWARD_GROUP_EXPANSION_MAX_EXCEPTIONS) break;
  }
  return {
    collapsedByDefault: record.collapsedByDefault,
    exceptions,
  };
}

export function serializeDcAwardRadarGroupExpansion(
  expansion: DcAwardRadarGroupExpansion,
): PersistV1 {
  return {
    version: 1,
    collapsedByDefault: expansion.collapsedByDefault,
    exceptions: [...expansion.exceptions].slice(
      0,
      DC_AWARD_GROUP_EXPANSION_MAX_EXCEPTIONS,
    ),
  };
}

export function readDcAwardRadarGroupExpansion(): DcAwardRadarGroupExpansion {
  if (typeof window === "undefined") {
    return DEFAULT_DC_AWARD_GROUP_EXPANSION;
  }
  try {
    const raw = window.localStorage.getItem(
      DC_AWARD_GROUP_EXPANSION_STORAGE_KEY,
    );
    if (!raw) return DEFAULT_DC_AWARD_GROUP_EXPANSION;
    return parseDcAwardRadarGroupExpansion(parseJsonUnknown(raw));
  } catch {
    return DEFAULT_DC_AWARD_GROUP_EXPANSION;
  }
}

export function persistDcAwardRadarGroupExpansion(
  expansion: DcAwardRadarGroupExpansion,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DC_AWARD_GROUP_EXPANSION_STORAGE_KEY,
      JSON.stringify(serializeDcAwardRadarGroupExpansion(expansion)),
    );
  } catch {
    /* quota / private mode */
  }
}
