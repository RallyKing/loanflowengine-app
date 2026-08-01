"use client";

import { useCallback, useState, type MouseEvent } from "react";
import { Check, Copy } from "lucide-react";
import { copyToClipboard } from "@/lib/ui/copyToClipboard";
import { cn } from "@/lib/cn";

type CopyableFieldProps = {
  value: string;
  className?: string;
  label?: string;
};

export function CopyableField({ value, className, label = "Copy" }: CopyableFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      const ok = await copyToClipboard(value);
      if (ok) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }
    },
    [value],
  );

  if (!value.trim()) return null;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-dlc-sm p-0.5 text-muted-foreground/70 transition-colors duration-dlc-short ease-dlc-standard",
        "hover:bg-muted/60 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied!" : label}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      {copied ? (
        <span className="sr-only" aria-live="polite">
          Copied!
        </span>
      ) : null}
    </button>
  );
}
