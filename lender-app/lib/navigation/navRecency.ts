const LS_KEY = "dlc-nav-recency-v1";
const MAX_ENTRIES = 40;

export type NavRecencyMap = Record<string, number>;

function readRaw(): NavRecencyMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return {};
    const out: NavRecencyMap = {};
    for (const [k, v] of Object.entries(p as NavRecencyMap)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeRaw(m: NavRecencyMap) {
  try {
    const keys = Object.keys(m).sort((a, b) => m[b]! - m[a]!);
    const trimmed: NavRecencyMap = {};
    for (const k of keys.slice(0, MAX_ENTRIES)) trimmed[k] = m[k]!;
    window.localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
  } catch {
    /* private mode */
  }
}

/** Increment visit weight for a catalog id or pathname-derived key (device-local). */
export function recordNavRecencyTouch(catalogIdOrKey: string) {
  if (typeof window === "undefined") return;
  const id = catalogIdOrKey.trim();
  if (!id) return;
  const m = readRaw();
  m[id] = (m[id] ?? 0) + 1;
  writeRaw(m);
}

export function readNavRecencyMap(): Map<string, number> {
  return new Map(Object.entries(readRaw()));
}

/** Map pathname to best-effort catalog id for recency (primary routes only). */
export function catalogIdForPath(pathname: string | null): string | null {
  if (!pathname) return null;
  if (pathname === "/tasks" || pathname.startsWith("/tasks/")) return "tasks";
  if (pathname === "/registry" || pathname.startsWith("/registry/"))
    return "contacts";
  if (pathname === "/contacts" || pathname.startsWith("/contacts/"))
    return "contacts";
  if (pathname === "/documents" || pathname.startsWith("/documents/"))
    return "documents";
  if (pathname === "/activity" || pathname.startsWith("/activity/"))
    return "activity";
  if (
    pathname.startsWith("/pipeline") ||
    pathname.startsWith("/analytics") ||
    pathname.startsWith("/ledger")
  )
    return "pipeline";
  if (pathname === "/lenders" || pathname.startsWith("/lenders/"))
    return "lenders";
  return null;
}
