import type { Id } from "@/convex/_generated/dataModel";
import { parseOrganizationId } from "@/lib/orgIdValidation";

const STORAGE_KEY = "lender.activeOrganizationId";

let activeOrgChangedDispatchScheduled = false;

function scheduleActiveOrgChangedDispatch(): void {
  if (typeof window === "undefined" || activeOrgChangedDispatchScheduled) return;
  activeOrgChangedDispatchScheduled = true;
  queueMicrotask(() => {
    activeOrgChangedDispatchScheduled = false;
    window.dispatchEvent(new CustomEvent("lender-active-org-changed"));
  });
}

export function getStoredActiveOrganizationId(): Id<"organizations"> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)?.trim();
    const parsed = parseOrganizationId(raw || null);
    if (raw && !parsed) {
      window.localStorage.removeItem(STORAGE_KEY);
      scheduleActiveOrgChangedDispatch();
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredActiveOrganizationId(
  id: Id<"organizations"> | null,
): void {
  if (typeof window === "undefined") return;
  try {
    const currentRaw = window.localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
    if (id) {
      const parsed = parseOrganizationId(id);
      if (!parsed) return;
      if (currentRaw === parsed) return;
      window.localStorage.setItem(STORAGE_KEY, parsed);
    } else {
      if (!currentRaw) return;
      window.localStorage.removeItem(STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent("lender-active-org-changed"));
  } catch {
    /* private mode */
  }
}

export function subscribeStoredActiveOrganizationId(
  onChange: () => void,
): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) onChange();
  };
  const onCustom = () => onChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener("lender-active-org-changed", onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("lender-active-org-changed", onCustom);
  };
}
