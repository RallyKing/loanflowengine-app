/** Pipeline hub — per-project subsection expand state (Phase 24.9). */

const STORAGE_KEY = "dlc.pipeline.hub.project-subsection.v1";

export type HubProjectSubsectionId = "clients" | "capitalStack";

type SubsectionExpansionState = Record<string, boolean>;

const EMPTY: SubsectionExpansionState = {};

function subsectionStorageKey(
  projectId: string,
  sectionId: HubProjectSubsectionId,
): string {
  return `${projectId}:${sectionId}`;
}

export function loadHubProjectSubsectionExpanded(
  projectId: string,
  sectionId: HubProjectSubsectionId,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as SubsectionExpansionState;
    return parsed[subsectionStorageKey(projectId, sectionId)] === true;
  } catch {
    return false;
  }
}

export function saveHubProjectSubsectionExpanded(
  projectId: string,
  sectionId: HubProjectSubsectionId,
  expanded: boolean,
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const prev: SubsectionExpansionState = raw
      ? (JSON.parse(raw) as SubsectionExpansionState)
      : { ...EMPTY };
    const key = subsectionStorageKey(projectId, sectionId);
    if (expanded) {
      prev[key] = true;
    } else {
      delete prev[key];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prev));
  } catch {
    /* private mode */
  }
}
