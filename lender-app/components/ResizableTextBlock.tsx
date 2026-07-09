"use client";

import { cn } from "@/lib/cn";

interface ResizableTextBlockProps {
  text: string;
  className?: string;
}

/**
 * A read-only text surface the user can resize (native CSS `resize: both`) and
 * scroll. Clicks do not bubble — use on table rows where row-click opens a drawer.
 */
export function ResizableTextBlock({ text, className }: ResizableTextBlockProps) {
  if (!text?.trim()) {
    return <span className="text-muted-foreground/80">—</span>;
  }
  return (
    <div
      className={cn(
        "box-border w-full min-h-[2.75rem] min-w-[10rem] max-w-full resize overflow-auto rounded-md border border-border/55 bg-muted/20 p-2.5 text-left text-xs leading-relaxed shadow-sm",
        "h-32 resize",
        "hover:border-border/90 focus-within:ring-1 focus-within:ring-ring/30",
        className
      )}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      title="Drag the lower-right corner to resize. Scroll inside the box to read long text."
    >
      <p className="m-0 whitespace-pre-wrap break-words text-foreground/95">
        {text}
      </p>
    </div>
  );
}
