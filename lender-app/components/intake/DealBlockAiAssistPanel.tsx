"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { ChevronDown, Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  type DealBlockAiKind,
  type DealBlockAiSuggestion,
  buildLocalDealBlockSuggestions,
} from "@/lib/dealBlockAiAssistModel";
import { useDealWorkspaceFileId } from "./DealWorkspaceAiContext";
import { useUserPreferencesOptional } from "@/lib/userPreferencesContext";
import { readAiAssistEnabled } from "@/lib/userPreferencesModel";

const DISMISS_KEY = "dlc.deal-block-ai-dismiss.v1";

function dismissStoreKey(fileId: string, blockKind: DealBlockAiKind): string {
  return `${fileId}::${blockKind}`;
}

function loadDismissed(fileId: string, blockKind: DealBlockAiKind): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const p = JSON.parse(raw) as Record<string, string[]>;
    const list = p[dismissStoreKey(fileId, blockKind)] ?? [];
    return new Set(list.filter((x) => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveDismissed(
  fileId: string,
  blockKind: DealBlockAiKind,
  ids: Set<string>,
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(DISMISS_KEY);
    let p: Record<string, string[]> = {};
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        p = parsed as Record<string, string[]>;
      }
    }
    p[dismissStoreKey(fileId, blockKind)] = [...ids];
    window.sessionStorage.setItem(DISMISS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export type DealBlockAiAssistPanelProps = {
  blockKind: DealBlockAiKind;
  /** Recompute local hints when this string changes */
  fingerprint: string;
  buildContext: () => Record<string, unknown>;
  /** Convex file id — falls back to `DealWorkspaceAiProvider` when omitted */
  fileId?: Id<"pipeline"> | null;
  /** Called only when the user accepts a suggestion that carries a patch */
  onApply: (suggestion: DealBlockAiSuggestion) => void;
  className?: string;
};

export function DealBlockAiAssistPanel({
  blockKind,
  fingerprint,
  buildContext,
  fileId: fileIdProp,
  onApply,
  className,
}: DealBlockAiAssistPanelProps) {
  const ctxId = useDealWorkspaceFileId();
  const fileId = fileIdProp ?? ctxId;
  const { accountId, preferences } = useUserPreferencesOptional();
  const aiAssistAllowed = useMemo(
    () =>
      Boolean(process.env.NEXT_PUBLIC_CONVEX_URL) &&
      readAiAssistEnabled(preferences.behaviorSettings),
    [preferences.behaviorSettings],
  );
  const suggestAi = useAction(api.dealBlockAiAssist.suggestDealBlockAssist);
  const [open, setOpen] = useState(false);
  const [aiItems, setAiItems] = useState<DealBlockAiSuggestion[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!fileId) {
      setDismissed(new Set());
      return;
    }
    setDismissed(loadDismissed(String(fileId), blockKind));
    setAiItems([]);
  }, [fileId, blockKind, fingerprint]);

  const localItems = useMemo(() => {
    try {
      return buildLocalDealBlockSuggestions(blockKind, buildContext());
    } catch {
      return [];
    }
  }, [blockKind, buildContext]);

  const visible = useMemo(() => {
    const all = [...localItems, ...aiItems];
    return all.filter((s) => !dismissed.has(s.id));
  }, [localItems, aiItems, dismissed]);

  const persistDismiss = useCallback(
    (next: Set<string>) => {
      setDismissed(next);
      if (fileId) saveDismissed(String(fileId), blockKind, next);
    },
    [fileId, blockKind],
  );

  const onDismiss = useCallback(
    (id: string) => {
      const next = new Set(dismissed);
      next.add(id);
      persistDismiss(next);
    },
    [dismissed, persistDismiss],
  );

  const onAccept = useCallback(
    (s: DealBlockAiSuggestion) => {
      if (!s.patch || Object.keys(s.patch).length === 0) return;
      onApply(s);
      onDismiss(s.id);
    },
    [onApply, onDismiss],
  );

  const runAi = useCallback(async () => {
    if (!fileId || !process.env.NEXT_PUBLIC_CONVEX_URL || !aiAssistAllowed) return;
    setAiBusy(true);
    try {
      const ctx = buildContext();
      const res = await suggestAi({
        fileId,
        accountId: accountId.trim() || undefined,
        blockKind,
        contextJson: JSON.stringify(ctx),
      });
      setAiItems(res.suggestions ?? []);
    } catch {
      setAiItems([]);
    } finally {
      setAiBusy(false);
    }
  }, [
    fileId,
    blockKind,
    buildContext,
    suggestAi,
    accountId,
    aiAssistAllowed,
  ]);

  if (!fileId) {
    return null;
  }

  const hasAskAi = aiAssistAllowed;

  return (
    <div
      className={cn(
        "rounded-lg border border-border/70 bg-muted/15 text-xs",
        className,
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-medium text-foreground transition hover:bg-muted/40"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          AI assist
          {visible.length > 0 ? (
            <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
              {visible.length}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border/60 px-3 pb-3 pt-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Suggestions are advisory. Accepting only fills fields you approve —
            nothing is saved automatically.
          </p>
          {hasAskAi ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                disabled={aiBusy}
                onClick={() => void runAi()}
              >
                {aiBusy ? "Asking…" : "Ask AI"}
              </Button>
            </div>
          ) : process.env.NEXT_PUBLIC_CONVEX_URL ? (
            <p className="text-[11px] text-muted-foreground">
              AI assist is turned off in Settings → Intelligence &amp; workflows.
              On-device hints still appear when available.
            </p>
          ) : null}
          {visible.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No active suggestions. Try &quot;Ask AI&quot; when your OpenAI key
              is configured on Convex.
            </p>
          ) : (
            <ul className="space-y-2">
              {visible.map((s) => {
                const canApply =
                  Boolean(s.patch) && Object.keys(s.patch ?? {}).length > 0;
                return (
                  <li
                    key={s.id}
                    className="rounded-md border border-border/50 bg-background/90 p-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="text-[11px] font-semibold text-foreground">
                          {s.title}
                        </div>
                        <div className="text-[11px] leading-snug text-muted-foreground">
                          {s.body}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                          {s.suggestionKind.replace(/_/g, " ")} ·{" "}
                          {s.source === "local" ? "on-device" : "AI"}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                        {canApply ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => onAccept(s)}
                          >
                            Accept
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px] text-muted-foreground"
                          onClick={() => onDismiss(s.id)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
