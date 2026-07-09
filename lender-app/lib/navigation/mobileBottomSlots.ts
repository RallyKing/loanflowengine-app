import type { NavCatalogEntry } from "./navigationCatalog";

/** Fixed bottom bar slot order (matches legacy mobile primary actions). */
export const MOBILE_BOTTOM_SLOT_IDS = [
  "pipeline",
  "tasks",
  "activity",
  "settings",
] as const;

export function pickMobileBottomItems(
  resolved: NavCatalogEntry[],
): NavCatalogEntry[] {
  const m = new Map(resolved.map((e) => [e.id, e]));
  return MOBILE_BOTTOM_SLOT_IDS.map((id) => m.get(id)).filter(
    (e): e is NavCatalogEntry => e != null,
  );
}
