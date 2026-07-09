"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useColorScheme } from "@/lib/colorScheme";
import { quickTipForPathname } from "@/lib/helpCenterContent";
import { useHelpSupport } from "@/lib/helpSupportContext";
import { shellZIndexStyle } from "@/lib/ui/layerTokens";

const STORAGE_PREFIX = "dlc-quick-tip-dismissed:";

function dismissed(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${id}`) === "1";
  } catch {
    return false;
  }
}

function setDismissed(id: string) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, "1");
  } catch {
    /* private mode */
  }
}

/**
 * Non-intrusive contextual tip for the current route (dismissible, bottom-left).
 */
export function ContextualQuickTip() {
  const pathname = usePathname();
  const { scheme } = useColorScheme();
  const { openHelp } = useHelpSupport();
  const [hidden, setHidden] = useState(true);

  const tip = pathname ? quickTipForPathname(pathname) : null;

  useEffect(() => {
    if (!tip || dismissed(tip.id)) {
      setHidden(true);
      return;
    }
    setHidden(false);
  }, [tip, pathname]);

  const onDismiss = useCallback(() => {
    if (tip) setDismissed(tip.id);
    setHidden(true);
  }, [tip]);

  if (!tip || hidden) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto fixed max-w-[min(22rem,calc(100dvw-2rem))]",
        "left-4",
        scheme === "saas"
          ? "bottom-6 [padding-bottom:env(safe-area-inset-bottom)]"
          : "bottom-[max(5.25rem,calc(4.5rem+env(safe-area-inset-bottom)))] md:bottom-6",
      )}
      style={shellZIndexStyle("contextualTip")}
      role="status"
    >
      <div className="flex gap-2 rounded-lg border border-border/90 bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur-sm supports-[backdrop-filter]:bg-background/90">
        <div className="mt-0.5 shrink-0 rounded-md bg-amber-500/15 p-1 text-amber-700 dark:text-amber-300">
          <Lightbulb className="h-3.5 w-3.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-snug text-foreground">{tip.message}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {tip.articleId ? (
              <button
                type="button"
                className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => {
                  openHelp({ articleId: tip.articleId });
                  onDismiss();
                }}
              >
                Open in Help
              </button>
            ) : null}
            <button
              type="button"
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              onClick={onDismiss}
            >
              Dismiss
            </button>
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss tip"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
