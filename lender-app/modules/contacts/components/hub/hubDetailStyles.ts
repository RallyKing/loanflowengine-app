import { cn } from "@/lib/cn";

/** Shared executive hub typography and surfaces (DLC tokens). */
export const hubDetailStyles = {
  shell: "flex min-h-0 flex-1 flex-col gap-4 p-3 md:p-4",
  commandCenterPage: "flex min-h-0 flex-1 flex-col",
  commandCenterShell: "mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col gap-4 p-3 md:p-5",
  grid: "flex w-full flex-col gap-4",
  identityZone: "w-full min-w-0 space-y-4",
  operationsZone: "w-full min-w-0",
  identityHero:
    "flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:gap-6 sm:text-left",
  contactChipRow: "grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3",
  identityCard:
    "dlc-surface-card rounded-dlc-lg p-4 shadow-dlc-1 ring-1 ring-border/80 transition-shadow duration-dlc-short ease-dlc-standard hover:shadow-dlc-2",
  contactChip:
    "flex items-center gap-2.5 rounded-dlc-md border border-gray-100 bg-dlc-surface-container-lowest px-3 py-2 shadow-dlc-1 ring-1 ring-border/60 transition-all duration-dlc-short ease-dlc-standard hover:bg-muted/40 hover:shadow-dlc-2 dark:border-gray-800",
  label: "text-dlc-label-md font-medium text-muted-foreground",
  value: "text-dlc-body-md font-semibold text-foreground",
  sectionTitle: "text-dlc-title-md font-semibold tracking-tight text-foreground",
  sectionHint: "text-dlc-body-sm text-muted-foreground",
  tabList:
    "inline-flex w-full flex-wrap gap-1 rounded-dlc-lg border border-border/80 bg-muted/30 p-1",
  tabButton: (active: boolean) =>
    cn(
      "min-h-10 flex-1 rounded-dlc-md px-3 py-2 text-dlc-label-md font-medium transition-all duration-dlc-short ease-dlc-standard",
      active
        ? "bg-background text-foreground shadow-dlc-1 ring-1 ring-border/60"
        : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
    ),
  tabPanel: "mt-4 min-h-0 transition-opacity duration-dlc-short ease-dlc-standard",
  tabPanelScrollable:
    "mt-4 max-h-[min(85dvh,720px)] min-h-0 touch-scroll-y overflow-y-auto overscroll-contain transition-opacity duration-dlc-short ease-dlc-standard",
  opsCard:
    "dlc-surface-card rounded-dlc-lg border border-gray-100 p-4 shadow-dlc-1 dark:border-gray-800",
  avatar:
    "flex h-16 w-16 shrink-0 items-center justify-center rounded-dlc-xl bg-primary/10 text-xl font-semibold text-primary ring-1 ring-primary/20",
} as const;

export function hubInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}
