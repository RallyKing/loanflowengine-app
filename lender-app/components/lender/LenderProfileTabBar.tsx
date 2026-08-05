"use client";

import { cn } from "@/lib/cn";
import { BookOpen, FileText, LayoutGrid, Layers } from "lucide-react";

export type LenderProfileTabId =
  | "overview"
  | "programs"
  | "templates"
  | "docs";

const TABS: Array<{
  id: LenderProfileTabId;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "programs", label: "Programs", icon: Layers },
  { id: "templates", label: "Templates", icon: BookOpen },
  { id: "docs", label: "Docs", icon: FileText },
];

export function LenderProfileTabBar({
  active,
  onChange,
}: {
  active: LenderProfileTabId;
  onChange: (id: LenderProfileTabId) => void;
}) {
  return (
    <div
      className="mb-4 flex gap-1 overflow-x-auto rounded-dlc-md border border-border/70 bg-dlc-surface p-0.5"
      role="tablist"
      aria-label="Lender profile sections"
    >
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          data-testid={`lender-profile-tab-${id}`}
          className={cn(
            "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-dlc-sm px-2 py-1.5 text-xs font-medium duration-dlc-short ease-dlc-standard sm:text-sm",
            active === id
              ? "bg-dlc-surface-high text-foreground shadow-dlc-1"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(id)}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
