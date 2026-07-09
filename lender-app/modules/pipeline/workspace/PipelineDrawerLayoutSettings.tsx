"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  type PipelineDrawerLayoutV1,
  type PipelineDrawerSectionId,
  PIPELINE_DRAWER_SECTION_LABELS,
  defaultPipelineDrawerLayout,
  moveSectionInOrder,
} from "@/lib/pipelineDrawerLayoutStorage";

type Props = {
  layout: PipelineDrawerLayoutV1;
  onChange: React.Dispatch<React.SetStateAction<PipelineDrawerLayoutV1>>;
  /** Block ids turned off globally — omitted from the list. */
  disabledBlockIds?: readonly string[];
  /** Block ids that cannot be hidden (registry mandatory ∪ admin required). */
  nonHideableBlockIds?: readonly string[];
  /** When set, these sections cannot be revealed (subscription-gated). */
  planGatedBlockIds?: readonly string[];
};

export function PipelineDrawerLayoutSettings({
  layout,
  onChange,
  disabledBlockIds,
  nonHideableBlockIds,
  planGatedBlockIds,
}: Props) {
  const [open, setOpen] = useState(false);

  const disabled = disabledBlockIds ?? [];
  const nonHideable = useMemo(
    () => new Set(nonHideableBlockIds ?? []),
    [nonHideableBlockIds],
  );
  const planGated = useMemo(
    () => new Set(planGatedBlockIds ?? []),
    [planGatedBlockIds],
  );

  const toggleHidden = useCallback(
    (id: PipelineDrawerSectionId) => {
      if (nonHideable.has(id)) return;
      onChange((prev) => {
        const isHidden = prev.hidden.includes(id);
        if (isHidden && planGated.has(id)) return prev;
        return {
          ...prev,
          hidden: isHidden
            ? prev.hidden.filter((x) => x !== id)
            : [...prev.hidden, id],
        };
      });
    },
    [onChange, nonHideable, planGated]
  );

  const move = useCallback(
    (id: PipelineDrawerSectionId, dir: -1 | 1) => {
      onChange((prev) => ({
        ...prev,
        order: moveSectionInOrder(prev.order, id, dir),
      }));
    },
    [onChange]
  );

  const reset = useCallback(() => {
    onChange(defaultPipelineDrawerLayout());
  }, [onChange]);

  return (
    <div className="rounded-xl border border-border/80 bg-muted/25 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground transition hover:bg-muted/50 sm:px-4"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          Layout & sections
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition motion-reduce:transition-none",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-t border-border/70 px-3 pb-3 pt-1 sm:px-4">
          <p className="mb-3 text-xs text-muted-foreground">
            Show or hide sections and change their order. Preferences are saved on
            this device.
          </p>
          <ul className="max-h-[min(50dvh,22rem)] space-y-1 overflow-y-auto pr-1">
            {layout.order
              .filter((id) => !disabled.includes(id))
              .map((id) => {
              const hidden = layout.hidden.includes(id);
              const hideLocked = nonHideable.has(id);
              const revealLocked = hidden && planGated.has(id);
              return (
                <li
                  key={id}
                  className={cn(
                    "flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background px-2 py-1.5 sm:flex-nowrap",
                    hidden && "opacity-60"
                  )}
                >
                  <span className="min-w-0 flex-1 text-xs font-medium text-foreground">
                    {PIPELINE_DRAWER_SECTION_LABELS[id]}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      title="Move up"
                      aria-label={`Move ${PIPELINE_DRAWER_SECTION_LABELS[id]} up`}
                      onClick={() => move(id, -1)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      title="Move down"
                      aria-label={`Move ${PIPELINE_DRAWER_SECTION_LABELS[id]} down`}
                      onClick={() => move(id, 1)}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      title={hidden ? "Show section" : "Hide section"}
                      disabled={hideLocked || revealLocked}
                      aria-label={
                        hidden
                          ? `Show ${PIPELINE_DRAWER_SECTION_LABELS[id]}`
                          : `Hide ${PIPELINE_DRAWER_SECTION_LABELS[id]}`
                      }
                      onClick={() => toggleHidden(id)}
                    >
                      {hidden ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
            <Button type="button" size="sm" variant="outline" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset layout
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
