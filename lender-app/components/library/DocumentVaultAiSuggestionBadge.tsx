"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  LIBRARY_DOCUMENT_CATEGORY_LABELS,
  type LibraryDocumentCategory,
} from "@/lib/library/documentVaultTaxonomy";

export type DocumentVaultAiSuggestionBadgeProps = {
  suggestedCategory: LibraryDocumentCategory;
  confidence?: number;
  compact?: boolean;
  busy?: boolean;
  onAccept: () => void;
  className?: string;
};

export function DocumentVaultAiSuggestionBadge({
  suggestedCategory,
  confidence,
  compact = false,
  busy = false,
  onAccept,
  className,
}: DocumentVaultAiSuggestionBadgeProps) {
  const label = LIBRARY_DOCUMENT_CATEGORY_LABELS[suggestedCategory];
  const confPct =
    confidence != null ? Math.round(confidence * 100) : undefined;

  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-1.5",
        className,
      )}
      data-testid="document-vault-ai-suggestion"
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-violet-500/35 bg-violet-500/10 font-medium text-violet-800 dark:text-violet-200",
          compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[10px] uppercase tracking-wide",
        )}
        title={
          confPct != null
            ? `AI suggestion (${confPct}% confidence)`
            : "AI category suggestion"
        }
      >
        <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
        Suggested: {label}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "h-7 border-violet-500/40 text-violet-800 hover:bg-violet-500/10 dark:text-violet-200",
          compact && "h-6 px-2 text-[10px]",
        )}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onAccept();
        }}
        data-testid="document-vault-accept-ai-suggestion"
      >
        Accept
      </Button>
    </span>
  );
}
