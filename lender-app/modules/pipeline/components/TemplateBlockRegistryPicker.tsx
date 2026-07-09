"use client";

/**
 * Global Block Registry picker — renders every modular block grouped by its
 * parent tab in the pipeline view (Deal Info, Financials, Portals & Progress,
 * Documents, Settings & Admin) with high-contrast toggle switches and
 * micro-descriptions. Shared by the custom template builder and the built-in
 * strategy viewer so 100% of registry blocks are always visible.
 */

import { useState } from "react";
import { Lock } from "lucide-react";
import {
  getPipelineBlocksGroupedByTab,
  type PipelineBlockId,
  type PipelineParentTabId,
} from "@/lib/pipelineBlockRegistry";
import {
  OperationalDisclosureChevron,
  OperationalDisclosurePanel,
} from "@/components/ui/OperationalDisclosure";
import { cn } from "@/lib/cn";

type Props = {
  /** Block ids currently enabled. */
  includedIds: ReadonlySet<PipelineBlockId>;
  /** Toggle a block on/off. Never called for locked ids. */
  onToggle: (blockId: PipelineBlockId, enabled: boolean) => void;
  /** Blocks forced ON (registry-mandatory or workspace-required). */
  lockedIds: ReadonlySet<PipelineBlockId>;
  /** Registry-mandatory subset of `lockedIds` (drives the lock tooltip). */
  registryMandatory: ReadonlySet<PipelineBlockId>;
  /** Disable all switches (read-only preview). */
  disabled?: boolean;
};

function BlockToggleSwitch({
  checked,
  locked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  locked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  const inert = locked || disabled;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label} — ${checked ? "included" : "not included"}`}
      disabled={inert}
      onClick={() => {
        if (!inert) onChange(!checked);
      }}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-dlc-standard ease-dlc-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        checked
          ? "border-primary bg-primary"
          : "border-border bg-muted",
        inert ? "cursor-not-allowed opacity-70" : "cursor-pointer",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-dlc-1 transition-transform duration-dlc-standard ease-dlc-standard",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function TemplateBlockRegistryPicker({
  includedIds,
  onToggle,
  lockedIds,
  registryMandatory,
  disabled = false,
}: Props) {
  const groups = getPipelineBlocksGroupedByTab();
  const [expanded, setExpanded] = useState<Set<PipelineParentTabId>>(
    () => new Set<PipelineParentTabId>(["dealInfo"]),
  );

  const toggleGroup = (tabId: PipelineParentTabId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });
  };

  return (
    <div className="space-y-1">
      {groups.map((group) => {
        const isOpen = expanded.has(group.tabId);
        const enabledCount = group.blocks.filter((b) =>
          includedIds.has(b.blockId),
        ).length;
        const total = group.blocks.length;
        return (
          <section
            key={group.tabId}
            className="overflow-hidden rounded-dlc-md border border-gray-100 bg-dlc-surface dark:border-gray-800"
          >
            <button
              type="button"
              onClick={() => toggleGroup(group.tabId)}
              aria-expanded={isOpen}
              className="flex min-h-10 w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors duration-dlc-standard hover:bg-muted/30"
            >
              <OperationalDisclosureChevron expanded={isOpen} axis="right" />
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {group.label}
                </span>
                <span className="mt-0.5 block truncate text-[11px] leading-snug text-muted-foreground/90">
                  {group.description}
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-gray-100 bg-muted/30 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground dark:border-gray-800">
                {total > 0
                  ? `${enabledCount}/${total}`
                  : "built-in"}
              </span>
            </button>

            <OperationalDisclosurePanel open={isOpen}>
              <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                {group.blocks.map((block) => {
                  const locked = lockedIds.has(block.blockId);
                  const checked = locked || includedIds.has(block.blockId);
                  const lockTitle = registryMandatory.has(block.blockId)
                    ? "Required by this product — cannot be removed."
                    : "Required by your workspace — cannot be removed.";
                  return (
                    <li
                      key={block.blockId}
                      className="flex items-center gap-2.5 px-2.5 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          {block.label}
                          {locked ? (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] font-normal text-muted-foreground"
                              title={lockTitle}
                            >
                              <Lock className="h-3 w-3" aria-hidden />
                              Required
                            </span>
                          ) : null}
                        </span>
                        {block.description ? (
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                            {block.description}
                          </span>
                        ) : null}
                      </span>
                      <BlockToggleSwitch
                        checked={checked}
                        locked={locked}
                        disabled={disabled}
                        label={block.label}
                        onChange={(next) => onToggle(block.blockId, next)}
                      />
                    </li>
                  );
                })}
                {group.coreSurfaces.map((surface) => (
                  <li
                    key={surface.name}
                    className="flex items-center gap-2.5 bg-muted/15 px-2.5 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        {surface.name}
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-normal text-muted-foreground">
                          <Lock className="h-3 w-3" aria-hidden />
                          Always on
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                        {surface.description}
                      </span>
                    </span>
                    <BlockToggleSwitch
                      checked
                      locked
                      label={surface.name}
                      onChange={() => undefined}
                    />
                  </li>
                ))}
                {group.blocks.length === 0 &&
                group.coreSurfaces.length === 0 ? (
                  <li className="px-3 py-2.5 text-[11px] text-muted-foreground">
                    No toggleable blocks on this tab yet.
                  </li>
                ) : null}
              </ul>
            </OperationalDisclosurePanel>
          </section>
        );
      })}
    </div>
  );
}
