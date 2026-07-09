"use client";

/**
 * Custom template block editor — maps over the entire Global Block Registry
 * (grouped by parent tab) so every modular block is visible and toggleable,
 * plus drawer ordering and per-block default settings.
 */

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  PIPELINE_BLOCKS,
  type PipelineBlockId,
} from "@/lib/pipelineBlockRegistry";
import { insertBlockAtRegistryPosition } from "@/lib/newFileDrawerTemplateEditorState";
import { TemplateBlockRegistryPicker } from "@/components/pipeline/TemplateBlockRegistryPicker";
import {
  OperationalDisclosureChevron,
  OperationalDisclosurePanel,
} from "@/components/ui/OperationalDisclosure";
import type { UserPreferencesV1 } from "@/lib/userPreferencesModel";

type Props = {
  includedOrder: PipelineBlockId[];
  setIncludedOrder: React.Dispatch<
    React.SetStateAction<PipelineBlockId[]>
  >;
  blockSettings: UserPreferencesV1["newFileDrawerSettings"];
  setBlockSettings: React.Dispatch<
    React.SetStateAction<UserPreferencesV1["newFileDrawerSettings"]>
  >;
  nonHideable: ReadonlySet<PipelineBlockId>;
  registryMandatory: ReadonlySet<PipelineBlockId>;
};

export function NewFileDrawerTemplateBlocksEditor({
  includedOrder,
  setIncludedOrder,
  blockSettings,
  setBlockSettings,
  nonHideable,
  registryMandatory,
}: Props) {
  const [orderOpen, setOrderOpen] = useState(false);

  const includedSet = useMemo(
    () => new Set<PipelineBlockId>(includedOrder),
    [includedOrder],
  );

  const move = useCallback((index: number, dir: -1 | 1) => {
    setIncludedOrder((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }, [setIncludedOrder]);

  const handleToggle = useCallback(
    (id: PipelineBlockId, enabled: boolean) => {
      if (nonHideable.has(id)) return;
      if (enabled) {
        setIncludedOrder((prev) => insertBlockAtRegistryPosition(prev, id));
      } else {
        setIncludedOrder((prev) => prev.filter((x) => x !== id));
        setBlockSettings((prev) => {
          const { [id]: _, ...rest } = prev;
          return rest;
        });
      }
    },
    [nonHideable, setIncludedOrder, setBlockSettings],
  );

  return (
    <>
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Blocks by workspace tab
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Every modular block grouped by file tab. Toggle blocks on or off for
          this template.
        </p>
        <TemplateBlockRegistryPicker
          includedIds={includedSet}
          onToggle={handleToggle}
          lockedIds={nonHideable}
          registryMandatory={registryMandatory}
        />
      </div>

      <div className="overflow-hidden rounded-dlc-md border border-gray-100 bg-muted/15 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setOrderOpen((v) => !v)}
          aria-expanded={orderOpen}
          className="flex min-h-9 w-full items-center gap-2 px-2.5 py-1.5 text-left"
        >
          <OperationalDisclosureChevron expanded={orderOpen} axis="right" />
          <span className="flex-1 text-xs font-medium text-foreground">
            Drawer order ({includedOrder.length} blocks, top to bottom)
          </span>
        </button>
        <OperationalDisclosurePanel open={orderOpen}>
          <ul className="space-y-1.5 px-3 pb-3">
            {includedOrder.map((id, index) => {
              const def = PIPELINE_BLOCKS.find((b) => b.blockId === id);
              const label = def?.label ?? id;
              const isRequired = nonHideable.has(id);
              const requiredTitle = registryMandatory.has(id)
                ? "Required by this product — cannot be removed from new files."
                : "Required by your workspace — cannot be removed from new files.";
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-background px-2 py-1.5 text-sm"
                >
                  <span className="min-w-0 flex-1 font-medium text-foreground">
                    {label}
                  </span>
                  {isRequired ? (
                    <span
                      className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
                      title={requiredTitle}
                    >
                      <Lock className="h-3 w-3 shrink-0" aria-hidden />
                      Required
                    </span>
                  ) : null}
                  <span className="ml-auto flex shrink-0 gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 p-0"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`Move ${label} up`}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 p-0"
                      disabled={index === includedOrder.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Move ${label} down`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </OperationalDisclosurePanel>
      </div>

      {includedOrder.some((id) => {
        const b = PIPELINE_BLOCKS.find((x) => x.blockId === id);
        return Boolean(b?.settingsSchema);
      }) ? (
        <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-medium text-foreground">
            Default block settings
          </p>
          {includedOrder.map((id) => {
            const block = PIPELINE_BLOCKS.find((b) => b.blockId === id);
            const schema = block?.settingsSchema;
            if (!schema || schema.type !== "object") return null;
            const props = schema.properties as
              | Record<string, Record<string, unknown>>
              | undefined;
            if (!props || typeof props !== "object") return null;

            const stored = blockSettings[id] ?? {};
            return (
              <div
                key={id}
                className="space-y-2 border-t border-border/40 pt-2 first:border-t-0 first:pt-0"
              >
                <p className="text-xs font-medium text-foreground">{block.label}</p>
                {Object.entries(props).map(([propKey, propSchema]) => {
                  const t = propSchema.type;
                  const defVal = propSchema.default;
                  const raw = stored[propKey];
                  if (t === "integer") {
                    const min =
                      typeof propSchema.minimum === "number"
                        ? propSchema.minimum
                        : undefined;
                    const max =
                      typeof propSchema.maximum === "number"
                        ? propSchema.maximum
                        : undefined;
                    const val =
                      typeof raw === "number"
                        ? raw
                        : typeof defVal === "number"
                          ? defVal
                          : min ?? 0;
                    return (
                      <label
                        key={propKey}
                        className="flex flex-col gap-1 text-xs text-muted-foreground"
                      >
                        <span className="capitalize text-foreground">
                          {propKey.replace(/([A-Z])/g, " $1").trim()}
                        </span>
                        <Input
                          type="number"
                          className="max-w-[8rem] text-sm"
                          min={min}
                          max={max}
                          value={Number.isFinite(val) ? val : ""}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setBlockSettings((prev) => ({
                              ...prev,
                              [id]: {
                                ...(prev[id] ?? {}),
                                [propKey]: Number.isFinite(n) ? n : defVal,
                              },
                            }));
                          }}
                        />
                      </label>
                    );
                  }
                  return null;
                })}
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
