"use client";

import { useId } from "react";
import { Palette } from "lucide-react";
import { useColorScheme, type ColorScheme } from "@/lib/colorScheme";
import { cn } from "@/lib/cn";

const OPTIONS: { value: ColorScheme; label: string; short: string }[] = [
  { value: "default", label: "Classic (forest & gold)", short: "Classic" },
  { value: "saas", label: "SaaS workspace (nav + blue actions)", short: "SaaS" },
];

export function ColorSchemeToggle({ className }: { className?: string }) {
  const selectId = useId();
  const { scheme, setScheme } = useColorScheme();
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-background/95 px-2 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm",
        className
      )}
    >
      <Palette
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <label className="sr-only" htmlFor={selectId}>
        Color scheme
      </label>
      <select
        id={selectId}
        value={scheme}
        onChange={(e) => setScheme(e.target.value as ColorScheme)}
        className="max-w-[12rem] cursor-pointer bg-transparent pr-1 text-xs font-medium text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background rounded"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
