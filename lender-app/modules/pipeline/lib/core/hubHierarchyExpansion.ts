/** Local persistence for pipeline hub client/project expansion (Phase 13.3 Step 4). */

const STORAGE_KEY = "dlc.pipeline.hub.hierarchy.expansion.v1";

export type HubHierarchyExpansionState = {
  /** Expanded client ids (`true` = expanded). Omitted = collapsed. */
  clients: Record<string, boolean>;
  projects: Record<string, boolean>;
};

const EMPTY: HubHierarchyExpansionState = { clients: {}, projects: {} };

export function loadHubHierarchyExpansion(): HubHierarchyExpansionState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as HubHierarchyExpansionState;
    return {
      clients:
        parsed?.clients && typeof parsed.clients === "object"
          ? parsed.clients
          : {},
      projects:
        parsed?.projects && typeof parsed.projects === "object"
          ? parsed.projects
          : {},
    };
  } catch {
    return EMPTY;
  }
}

export function saveHubHierarchyExpansion(state: HubHierarchyExpansionState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode */
  }
}

export function isClientExpanded(
  state: HubHierarchyExpansionState,
  clientId: string,
): boolean {
  return state.clients?.[clientId] === true;
}

export function isProjectExpanded(
  state: HubHierarchyExpansionState,
  projectId: string,
): boolean {
  return state.projects?.[projectId] === true;
}

/** Expand client + project after inline hub create (Phase 15 Step 11). */
export function expandClientAndProject(
  state: HubHierarchyExpansionState,
  clientId: string,
  projectId: string,
): HubHierarchyExpansionState {
  return {
    clients: { ...state.clients, [clientId]: true },
    projects: { ...state.projects, [projectId]: true },
  };
}
