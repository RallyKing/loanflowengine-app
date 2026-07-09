"use client";

import { Trash2 } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "./ui/Button";
import { cn } from "@/lib/cn";
type Props = {
  onApplyPreset: (p: Doc<"savedFilterPresets">) => void;
  onRequestDelete: (id: Id<"savedFilterPresets">, presetName?: string) => void;
  canUseHub: boolean;
  actionTitle: (whenConnected: string) => string;
};

/**
 * Isolated so `useQuery(listPresets)` failures do not take down the rest of the filters UI.
 * Hub state comes from the parent so we don’t double-subscribe to `useLiveConnection` in the
 * same panel (SignalR-style connection state is one logical consumer per surface).
 */
export function SavedFilterPresetsList({
  onApplyPreset,
  onRequestDelete,
  canUseHub,
  actionTitle,
}: Props) {
  const orgScope = useOrgConvexQueryArgs();
  const presets = useQuery(
    api.savedFilterLists.listPresets,
    orgScope ?? "skip",
  );

  if (presets === undefined) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">Loading saved lists…</p>
    );
  }
  if (presets.length === 0) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        None yet — set the bar and smart filters, name the view, and click
        Save.
      </p>
    );
  }
  return (
    <ul className="mt-1 space-y-1">
      {presets.map((p) => (
        <li
          key={p._id}
          className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/25 px-2 py-1.5 text-sm transition-colors hover:bg-muted/40"
        >
          <button
            type="button"
            className={cn(
              "min-w-0 flex-1 truncate text-left font-medium",
              "hover:underline"
            )}
            onClick={() => onApplyPreset(p)}
          >
            {p.name}
          </button>
          <button
            type="button"
            className="shrink-0 p-0.5 text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => onRequestDelete(p._id, p.name)}
            title={actionTitle("Remove this saved list")}
            disabled={!canUseHub}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PresetsQueryErrorFallback({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <div className="mt-1 space-y-2 text-xs text-muted-foreground">
      <p>
        Could not load saved list names. Smart filters and the table still work
        &mdash; check that Convex is deployed and{" "}
        <code className="rounded bg-muted px-0.5">savedFilterPresets</code>{" "}
        exists in your schema. If the top status bar shows a connection
        warning, fix your network or wait until the live link is back.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={onRetry}
      >
        Try again
      </Button>
    </div>
  );
}
