const SESSION_KEY = "dlc.pipeline-drawer-suggest-dismiss.v1";

type Store = Record<string, string[]>;

function readAll(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    const out: Store = {};
    for (const [k, v] of Object.entries(p as Store)) {
      if (Array.isArray(v)) {
        out[k] = v.filter((x) => typeof x === "string");
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(s: Store): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

export function loadDismissedDrawerBlockSuggestions(
  fileId: string | null,
): Set<string> {
  if (!fileId) return new Set();
  const all = readAll();
  return new Set(all[fileId] ?? []);
}

export function dismissDrawerBlockSuggestion(
  fileId: string | null,
  blockId: string,
): void {
  if (!fileId || !blockId) return;
  const all = readAll();
  const cur = new Set(all[fileId] ?? []);
  cur.add(blockId);
  all[fileId] = [...cur];
  writeAll(all);
}

export function clearDismissedDrawerBlockSuggestions(fileId: string | null): void {
  if (!fileId) return;
  const all = readAll();
  delete all[fileId];
  writeAll(all);
}
