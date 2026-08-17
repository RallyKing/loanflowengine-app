"use client";

import { Search, Star, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

export type DocumentVaultExplorerFilterStripProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  starredOnly: boolean;
  onStarredOnlyChange: (next: boolean) => void;
  starredCount?: number;
};

export function DocumentVaultExplorerFilterStrip({
  searchValue,
  onSearchChange,
  starredOnly,
  onStarredOnlyChange,
  starredCount = 0,
}: DocumentVaultExplorerFilterStripProps) {
  return (
    <div
      className="flex min-w-0 items-center gap-1.5 border-b border-border/50 px-2 py-1.5"
      data-testid="document-vault-explorer-filter-strip"
    >
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search tasks, files, folders…"
          className="h-9 w-full min-w-0 pl-8 pr-8 text-sm"
          data-testid="document-vault-explorer-search"
          aria-label="Search tasks, files, and folders"
        />
        {searchValue.trim() ? (
          <button
            type="button"
            className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            aria-label="Clear search"
            data-testid="document-vault-explorer-search-clear"
            onClick={() => onSearchChange("")}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <Button
        type="button"
        variant={starredOnly ? "secondary" : "ghost"}
        size="sm"
        className={cn(
          "h-9 shrink-0 gap-1 px-2 text-xs",
          starredOnly && "bg-amber-500/15 text-amber-800 hover:bg-amber-500/20 dark:text-amber-300",
        )}
        aria-pressed={starredOnly}
        aria-label={
          starredOnly ? "Show all explorer items" : "Show starred files and folders"
        }
        title="Starred"
        data-testid="document-vault-explorer-starred-filter"
        onClick={() => onStarredOnlyChange(!starredOnly)}
      >
        <Star
          className={cn(
            "h-3.5 w-3.5",
            starredOnly
              ? "fill-amber-400 text-amber-500"
              : "fill-transparent text-muted-foreground",
          )}
          aria-hidden
        />
        <span className="hidden sm:inline">Starred</span>
        {starredCount > 0 ? (
          <span className="tabular-nums text-[10px] text-muted-foreground">
            {starredCount}
          </span>
        ) : null}
      </Button>
    </div>
  );
}
