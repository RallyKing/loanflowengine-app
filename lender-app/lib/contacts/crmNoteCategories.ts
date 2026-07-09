export const CRM_NOTE_CATEGORIES = [
  { id: "general", label: "General" },
  { id: "commission", label: "Commission Notes" },
  { id: "referral", label: "Referral Agreements" },
] as const;

export type CrmNoteCategoryId = (typeof CRM_NOTE_CATEGORIES)[number]["id"];

export function crmNoteCategoryLabel(id: string | undefined): string {
  const hit = CRM_NOTE_CATEGORIES.find((c) => c.id === id);
  return hit?.label ?? "General";
}
