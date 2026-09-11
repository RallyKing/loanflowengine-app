"use client";

import { Loader2 } from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type LenderSearchResultRowProps = {
  hit: Doc<"lenders">;
  isOnFile: boolean;
  readOnly: boolean;
  adding: boolean;
  onAddToFile: (lenderId: Id<"lenders">) => void;
};

/** Search hit row — single "Add to File" action (defaults to Considering pool). */
export function LenderSearchResultRow({
  hit,
  isOnFile,
  readOnly,
  adding,
  onAddToFile,
}: LenderSearchResultRowProps) {
  const canAdd = !readOnly && !isOnFile;

  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-dlc-sm border border-transparent px-1.5 py-1",
        isOnFile
          ? "border-border/80 bg-muted/25"
          : "hover:border-border/80 hover:bg-background",
      )}
      data-testid={`lender-search-row-${hit._id}`}
    >
      <div className="min-w-0 flex-1 text-sm leading-snug">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground">
            {hit.company || "—"}
          </span>
          {isOnFile ? (
            <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              On file
            </span>
          ) : null}
        </div>
        <div className="min-w-0 break-words text-xs text-muted-foreground">
          {[hit.primaryNiche, hit.entityType].filter(Boolean).join(" · ")}
        </div>
      </div>
      {canAdd ? (
        <Button
          type="button"
          size="sm"
          variant="primary"
          className="h-9 min-h-[40px] shrink-0 px-2 text-xs sm:h-8 sm:min-h-0"
          disabled={adding}
          onClick={() => onAddToFile(hit._id)}
          data-testid={`lender-add-to-file-${hit._id}`}
        >
          {adding ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Adding…
            </span>
          ) : (
            "+ Add to File"
          )}
        </Button>
      ) : null}
    </li>
  );
}
