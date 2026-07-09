"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { Sparkles, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  computeRuleBasedDrawerBlockSuggestions,
  computeWorkflowDrawerHints,
  listHiddenBlocksEligibleToShow,
  mergeSuggestionListsOrdered,
  type PipelineBlockSuggestion,
} from "@/lib/pipelineBlockRecommendations";
import type { UserSimpleWorkflowRule } from "@/lib/userWorkflowsModel";
import { getTopExpandedPipelineDrawerBlocks } from "@/lib/pipelineDrawerBehaviorSignals";
import {
  dismissDrawerBlockSuggestion,
  loadDismissedDrawerBlockSuggestions,
} from "@/lib/pipelineDrawerSuggestionDismiss";
import type { DrawerVisibilitySignals } from "@/lib/pipelineBlockVisibility";
import type { PipelineDrawerLayoutV1 } from "@/lib/pipelineDrawerLayoutStorage";
import { PIPELINE_DRAWER_SECTION_LABELS } from "@/lib/pipelineDrawerLayoutStorage";
import type { PipelineBlockId } from "@/lib/pipelineBlockRegistry";

type Props = {
  fileId: Id<"pipeline">;
  dealData: unknown;
  pipelineScenarioLine?: string;
  lenderCount: number;
  legacyContactCount: number;
  drawerLayout: PipelineDrawerLayoutV1;
  visibilitySignals?: DrawerVisibilitySignals | null;
  focusedFieldPaths: readonly string[];
  setDrawerLayout: React.Dispatch<React.SetStateAction<PipelineDrawerLayoutV1>>;
  /** Convex account; gates server-side AI when assist is disabled in Settings. */
  accountId: string;
  workflowRules: readonly UserSimpleWorkflowRule[];
  hasSelectedLender: boolean;
  enableAi: boolean;
};

export function PipelineDrawerBlockSuggestions({
  fileId,
  dealData,
  pipelineScenarioLine,
  lenderCount,
  legacyContactCount,
  drawerLayout,
  visibilitySignals,
  focusedFieldPaths,
  setDrawerLayout,
  accountId,
  workflowRules,
  hasSelectedLender,
  enableAi,
}: Props) {
  const suggestAi = useAction(api.pipelineBlockSuggestions.suggestDrawerBlocks);
  const [aiList, setAiList] = useState<PipelineBlockSuggestion[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() =>
    loadDismissedDrawerBlockSuggestions(String(fileId)),
  );

  useEffect(() => {
    setDismissed(loadDismissedDrawerBlockSuggestions(String(fileId)));
    setAiList([]);
  }, [fileId]);

  const candidates = useMemo(
    () =>
      listHiddenBlocksEligibleToShow({
        layout: drawerLayout,
        visibilitySignals,
      }),
    [drawerLayout, visibilitySignals],
  );

  const workflowHints = useMemo(
    () =>
      computeWorkflowDrawerHints({
        rules: workflowRules,
        candidates,
        lenderCount,
        hasSelectedLender,
      }),
    [workflowRules, candidates, lenderCount, hasSelectedLender],
  );

  const ruleSuggestions = useMemo(
    () =>
      computeRuleBasedDrawerBlockSuggestions({
        dealData,
        lenderCount,
        legacyContactCount,
        pipelineScenarioLine,
        candidates,
        focusedFieldPaths,
        topExpandedBlocks: getTopExpandedPipelineDrawerBlocks(),
      }),
    [
      dealData,
      lenderCount,
      legacyContactCount,
      pipelineScenarioLine,
      candidates,
      focusedFieldPaths,
    ],
  );

  const hiddenKey = drawerLayout.hidden.join("|");
  const focusKey = focusedFieldPaths.join("\0");

  useEffect(() => {
    if (!enableAi || candidates.length === 0) {
      setAiList([]);
      setAiBusy(false);
      return;
    }
    let cancelled = false;
    setAiBusy(true);
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await suggestAi({
            fileId,
            accountId: accountId.trim() || undefined,
            hiddenBlockIds: [...drawerLayout.hidden],
            focusedFieldPaths: [...focusedFieldPaths],
            topExpandedBlocks: getTopExpandedPipelineDrawerBlocks(),
          });
          const mapped: PipelineBlockSuggestion[] = (res.suggestions ?? []).map(
            (s) => ({
              blockId: s.blockId,
              reason: s.reason,
              source: "ai" as const,
            }),
          );
          if (!cancelled) setAiList(mapped);
        } catch {
          if (!cancelled) setAiList([]);
        } finally {
          if (!cancelled) setAiBusy(false);
        }
      })();
    }, 1600);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      setAiBusy(false);
    };
  }, [
    enableAi,
    suggestAi,
    fileId,
    accountId,
    hiddenKey,
    focusKey,
    candidates.length,
    drawerLayout.expanded,
    drawerLayout.hidden,
    focusedFieldPaths,
  ]);

  const merged = useMemo(
    () =>
      mergeSuggestionListsOrdered([workflowHints, ruleSuggestions, aiList], 5),
    [workflowHints, ruleSuggestions, aiList],
  );

  const visible = useMemo(() => {
    return merged.filter((s) => {
      if (!candidates.includes(s.blockId)) return false;
      if (dismissed.has(s.blockId)) return false;
      return true;
    });
  }, [merged, candidates, dismissed]);

  const dismissOne = useCallback(
    (blockId: PipelineBlockId) => {
      dismissDrawerBlockSuggestion(String(fileId), blockId);
      setDismissed((prev) => new Set(prev).add(blockId));
    },
    [fileId],
  );

  const addBlock = useCallback(
    (blockId: PipelineBlockId) => {
      setDrawerLayout((prev) => ({
        ...prev,
        hidden: prev.hidden.filter((x) => x !== blockId),
        expanded: { ...prev.expanded, [blockId]: true },
      }));
      dismissDrawerBlockSuggestion(String(fileId), blockId);
      setDismissed((prev) => new Set(prev).add(blockId));
    },
    [fileId, setDrawerLayout],
  );

  if (candidates.length === 0 || visible.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border/60 bg-muted/15 px-3 py-2 text-xs",
        aiBusy && "opacity-90",
      )}
      role="region"
      aria-label="Suggested drawer sections"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span className="font-medium text-muted-foreground">
          Suggested sections
        </span>
        {aiBusy ? (
          <span className="text-[10px] text-muted-foreground/80">Updating…</span>
        ) : null}
      </div>
      <ul className="mt-2 space-y-1.5">
        {visible.map((s) => (
          <li
            key={s.blockId}
            className="flex flex-wrap items-start gap-2 rounded-md border border-border/50 bg-background/80 px-2 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground">
                {PIPELINE_DRAWER_SECTION_LABELS[s.blockId]}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {s.reason}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                onClick={() => addBlock(s.blockId)}
              >
                Add
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground"
                title="Dismiss"
                aria-label={`Dismiss suggestion: ${PIPELINE_DRAWER_SECTION_LABELS[s.blockId]}`}
                onClick={() => dismissOne(s.blockId)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
