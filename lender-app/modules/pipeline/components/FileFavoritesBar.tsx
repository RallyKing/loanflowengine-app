"use client";

import { Star } from "lucide-react";
import { PREMIUM_WORKSPACE_CONTAINER_CLASS } from "@/components/WorkspaceContentContainer";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { cn } from "@/lib/cn";
import {
  getPipelineBlock,
  type PipelineBlockId,
} from "@/lib/pipelineBlockRegistry";

/**
 * Favorites quick-access bar.
 *
 * Compact pinned chrome (non-scrolling region of `PipelineFileWorkspaceShell`,
 * below `FileWorkspaceTabNav`). Chips open the pinned block in window-in-window
 * (`FloatingBlockWindow` via favorites launcher); optional “Go to section”
 * remains on floating chrome. Fallback deep-links to the block’s tab section.
 * Pin management lives in the star popover; persistence is
 * `userPreferences.favoriteFileBlocks`.
 */
export function FileFavoritesBar({
  favorites,
  pinnableBlockIds,
  onOpenBlock,
  onToggleFavorite,
  disabled = false,
}: {
  favorites: readonly PipelineBlockId[];
  /** Blocks offered in the manage popover (registry order, already filtered). */
  pinnableBlockIds: readonly PipelineBlockId[];
  onOpenBlock: (blockId: PipelineBlockId) => void;
  onToggleFavorite: (blockId: PipelineBlockId) => void;
  disabled?: boolean;
}) {
  const favoriteSet = new Set(favorites);

  return (
    <div
      className={cn(
        "w-full border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-dlc-surface-high",
      )}
      data-testid="pipeline-file-favorites-bar"
    >
      <div className={PREMIUM_WORKSPACE_CONTAINER_CLASS}>
        <div className="flex min-h-7 items-center gap-1 py-0.5 md:min-h-9 md:gap-1.5 md:py-1">
          <DropdownMenu
            aria-label="Manage favorite blocks"
            align="start"
            trigger={
              <span
                className={cn(
                  "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-dlc-sm text-muted-foreground",
                  "transition-colors duration-dlc-fast ease-dlc-standard hover:bg-muted/60 hover:text-foreground",
                  disabled && "pointer-events-none opacity-50",
                )}
                data-testid="pipeline-file-favorites-manage-trigger"
              >
                <Star
                  className={cn(
                    "h-4 w-4",
                    favorites.length > 0 && "fill-amber-400 text-amber-500",
                  )}
                  aria-hidden
                />
              </span>
            }
          >
            <div className="px-3 pb-1 pt-2">
              <p className="text-xs font-semibold uppercase tracking-dlc-wide text-muted-foreground">
                Pin blocks to favorites
              </p>
            </div>
            <div
              className="max-h-72 overflow-y-auto pb-1"
              data-testid="pipeline-file-favorites-manage-list"
            >
              {pinnableBlockIds.map((blockId) => {
                const def = getPipelineBlock(blockId);
                const pinned = favoriteSet.has(blockId);
                return (
                  <button
                    key={blockId}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={pinned}
                    disabled={disabled}
                    onClick={() => onToggleFavorite(blockId)}
                    className={cn(
                      "flex w-full min-h-9 items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground",
                      "transition-colors duration-dlc-fast ease-dlc-standard hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                      disabled && "pointer-events-none opacity-40",
                    )}
                    data-testid={`pipeline-file-favorites-toggle-${blockId}`}
                  >
                    <Star
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        pinned
                          ? "fill-amber-400 text-amber-500"
                          : "text-muted-foreground/60",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{def.label}</span>
                  </button>
                );
              })}
            </div>
          </DropdownMenu>

          {favorites.length === 0 ? (
            <p className="truncate text-xs text-muted-foreground">
              Pin blocks for one-click access.
            </p>
          ) : (
            <div
              className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"
              data-testid="pipeline-file-favorites-chips"
            >
              {favorites.map((blockId) => {
                const def = getPipelineBlock(blockId);
                return (
                  <button
                    key={blockId}
                    type="button"
                    onClick={() => onOpenBlock(blockId)}
                    className={cn(
                      "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border/70 bg-dlc-surface px-2 md:h-7 md:px-2.5",
                      "text-[11px] font-medium text-foreground transition-colors duration-dlc-fast ease-dlc-standard md:text-xs",
                      "hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    data-testid={`pipeline-file-favorites-chip-${blockId}`}
                  >
                    {def.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
