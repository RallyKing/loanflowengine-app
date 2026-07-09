/** Pipeline hub — per-client notes subsection expand state (Phase 28.2). */

const STORAGE_KEY = "hubClientNotesExpansion";

type ClientNotesExpansionState = Record<string, boolean>;

function clientStorageKey(clientId: string): string {
  return clientId;
}

export function loadHubClientNotesExpanded(clientId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as ClientNotesExpansionState;
    return parsed[clientStorageKey(clientId)] === true;
  } catch {
    return false;
  }
}

export function saveHubClientNotesExpanded(
  clientId: string,
  expanded: boolean,
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const prev: ClientNotesExpansionState = raw
      ? (JSON.parse(raw) as ClientNotesExpansionState)
      : {};
    const key = clientStorageKey(clientId);
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
