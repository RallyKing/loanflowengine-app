"use client";

import { Building2, Star } from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type LenderLinkMeta = {
  relationshipType: string;
  rejectionReason?: string;
  /** Phase Modular-B — loan program chosen for this file. */
  selectedProgramName?: string;
  /** Lender representative assigned on this file. */
  contactRepId?: Id<"contacts">;
  contactRepName?: string;
};

export type LenderSummaryBlockProps = {
  lenders: Doc<"lenders">[];
  selectedLenderId?: Id<"lenders"> | null;
  linkByLenderId: Map<string, LenderLinkMeta>;
  readOnly?: boolean;
  selecting?: Id<"lenders"> | null;
  onSelectLender?: (lenderId: Id<"lenders"> | null) => void;
  /** Opens full lender workflow (legacy drawer or Lenders & Terms tab). */
  onManageLenders?: () => void;
};

export function LenderSummaryBlock({
  lenders,
  selectedLenderId,
  linkByLenderId,
  readOnly = false,
  selecting = null,
  onSelectLender,
  onManageLenders,
}: LenderSummaryBlockProps) {
  const sorted = selectedLenderId
    ? [...lenders].sort((a, b) => {
        const aChosen = a._id === selectedLenderId ? 0 : 1;
        const bChosen = b._id === selectedLenderId ? 0 : 1;
        return aChosen - bChosen;
      })
    : lenders;

  const chosen = selectedLenderId
    ? sorted.find((l) => l._id === selectedLenderId)
    : undefined;

  return (
    <div
      className="dlc-surface-card space-y-3 rounded-dlc-md border border-border/70 p-4"
      data-testid="pipeline-lender-summary-block"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Lenders on file
          </h3>
          <p className="mt-1 text-sm text-foreground">
            {lenders.length === 0
              ? "No lenders linked yet."
              : chosen
                ? `${chosen.company || "Lender"} is chosen`
                : `${lenders.length} linked — none chosen`}
          </p>
        </div>
        {onManageLenders ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-9 shrink-0"
            onClick={onManageLenders}
            data-testid="pipeline-lender-summary-manage"
          >
            Manage lenders
          </Button>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-dlc-sm border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
          Search and attach lenders from the full lender workspace.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Lender summary">
          {sorted.slice(0, 6).map((l) => {
            const isChosen = selectedLenderId === l._id;
            const isPicking = selecting === l._id;
            const link = linkByLenderId.get(String(l._id));
            const isDeclined = link?.relationshipType === "declined";
            return (
              <li
                key={l._id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-dlc-sm border px-3 py-2 text-sm",
                  isDeclined
                    ? "border-destructive/30 bg-destructive/5"
                    : isChosen
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/70 bg-dlc-surface-high/50",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-medium text-foreground">
                      {l.company || "—"}
                    </span>
                    {isDeclined ? (
                      <span className="rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-destructive">
                        Rejected
                      </span>
                    ) : null}
                    {isChosen && !isDeclined ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        <Star className="h-2.5 w-2.5 fill-current" aria-hidden />
                        Chosen
                      </span>
                    ) : null}
                  </div>
                  {l.contactName ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {l.contactName}
                    </p>
                  ) : null}
                </div>
                {!isDeclined && !readOnly && onSelectLender ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={isChosen ? "outline" : "ghost"}
                    className="min-h-9 shrink-0"
                    disabled={isPicking}
                    onClick={() => onSelectLender(isChosen ? null : l._id)}
                    aria-label={
                      isChosen
                        ? `Clear chosen lender ${l.company || ""}`
                        : `Choose ${l.company || "lender"}`
                    }
                  >
                    <Star
                      className={cn(
                        "h-3.5 w-3.5",
                        isChosen && "fill-current text-primary",
                      )}
                      aria-hidden
                    />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {sorted.length > 6 ? (
        <p className="text-xs text-muted-foreground">
          +{sorted.length - 6} more — use Manage lenders for the full list.
        </p>
      ) : null}
    </div>
  );
}
