"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type PreviewEditorSkeletonProps = {
  className?: string;
  onCancelEditMode?: () => void;
};

export function PreviewEditorSkeleton({
  className,
  onCancelEditMode,
}: PreviewEditorSkeletonProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-muted/10 p-6 text-center",
        className,
      )}
      data-testid="document-vault-editor-skeleton"
    >
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      <div>
        <p className="text-sm font-medium text-foreground">
          Preparing document for editing…
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Loading the signed file URL before mounting the crop canvas.
        </p>
      </div>
      {onCancelEditMode ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={onCancelEditMode}
        >
          Cancel Editing
        </Button>
      ) : null}
    </div>
  );
}
