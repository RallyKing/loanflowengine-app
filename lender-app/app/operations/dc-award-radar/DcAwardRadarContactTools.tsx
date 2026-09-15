"use client";

import { Download, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  DC_AWARD_CONTACT_FILTER_IDS,
  DC_AWARD_CONTACT_FILTER_LABEL,
  type DcAwardRadarContactFilterId,
  type DcAwardRadarContactFilterSet,
} from "@/lib/dcAwardRadarContacts";
import { cn } from "@/lib/cn";

export function DcAwardRadarContactFilterChips({
  filters,
  onToggle,
}: {
  filters: DcAwardRadarContactFilterSet;
  onToggle: (id: DcAwardRadarContactFilterId) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="group"
      aria-label="Contact filters"
    >
      {DC_AWARD_CONTACT_FILTER_IDS.map((id) => {
        const pressed = filters.has(id);
        return (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={pressed ? "primary" : "outline"}
            aria-pressed={pressed}
            data-testid={`dc-award-contact-filter-${id}`}
            onClick={() => onToggle(id)}
          >
            {DC_AWARD_CONTACT_FILTER_LABEL[id]}
          </Button>
        );
      })}
    </div>
  );
}

export function DcAwardRadarContactActions({
  uniqueCount,
  ghlEligibleCount,
  downloadBusy,
  ghlBusy,
  onDownload,
  onGhlPush,
}: {
  uniqueCount: number;
  ghlEligibleCount: number;
  downloadBusy: boolean;
  ghlBusy: boolean;
  onDownload: () => void;
  onGhlPush: () => void;
}) {
  const disabled = uniqueCount === 0 || downloadBusy || ghlBusy;
  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Contact export and HighLevel push"
    >
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={onDownload}
        data-testid="dc-award-download-contacts"
        aria-label={`Download ${uniqueCount} filtered unique contacts as CSV`}
      >
        <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        Download contacts CSV
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={onGhlPush}
        data-testid="dc-award-ghl-push"
        aria-label={`Send ${uniqueCount} filtered unique contacts to HighLevel, tag only`}
        aria-busy={ghlBusy}
      >
        {ghlBusy ? (
          <Loader2
            className={cn(
              "mr-1.5 h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none",
            )}
            aria-hidden
          />
        ) : (
          <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        )}
        Send filtered contacts to GHL
      </Button>
      <p className="w-full text-[11px] text-muted-foreground">
        {uniqueCount} unique contact{uniqueCount === 1 ? "" : "s"} in the
        current filters
        {uniqueCount > 0
          ? ` · ${ghlEligibleCount} have email or phone for HighLevel`
          : ""}
        . GHL is tag/create only — no SMS, email, sequences, or campaigns.
      </p>
    </div>
  );
}
