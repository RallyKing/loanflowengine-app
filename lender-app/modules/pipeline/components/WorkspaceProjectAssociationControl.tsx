"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { Check, ChevronDown, FolderKanban } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { pipelineDealEditorHref } from "@/lib/pipeline/routes";
import { touchTargetMinClass } from "@/lib/ui/touchTarget";

export type ProjectSiblingFileOption = {
  _id: Id<"pipeline"> | string;
  fileName?: string | null;
};

export type WorkspaceProjectAssociationControlProps = {
  projectName: string | null | undefined;
  projectHref: string | null | undefined;
  currentFileId: Id<"pipeline"> | string;
  siblingFiles: readonly ProjectSiblingFileOption[];
  className?: string;
  /** Denser header chrome (~40px) — skips 44px touch floor for file snap header. */
  dense?: boolean;
};

function fileLabel(fileName: string | null | undefined): string {
  const t = fileName?.trim();
  return t || "Untitled file";
}

/**
 * Visible project association for the file workspace header.
 * Opens a portal menu: navigate to the project + switch sibling files in that project.
 * Uses the same switcher row source as the header disclosure (filtered by project).
 */
export function WorkspaceProjectAssociationControl({
  projectName,
  projectHref,
  currentFileId,
  siblingFiles,
  className,
  dense = false,
}: WorkspaceProjectAssociationControlProps) {
  const router = useRouter();
  const name = projectName?.trim() || "";
  const hasProject = Boolean(name);
  const href = projectHref?.trim() || "";

  if (!hasProject) {
    return (
      <span
        className={cn(
          "inline-flex h-7 max-w-[7.5rem] shrink-0 items-center truncate rounded-dlc-sm px-1.5 md:h-8 md:px-2",
          "text-[11px] font-medium text-muted-foreground/80 sm:max-w-[10rem] md:text-xs",
          className,
        )}
        data-testid="workspace-project-association-empty"
        title="No project"
      >
        No project
      </span>
    );
  }

  const otherSiblings = siblingFiles.filter(
    (f) => String(f._id) !== String(currentFileId),
  );

  return (
    <DropdownMenu
      align="start"
      aria-label={`Project: ${name}. Open project or switch files`}
      className={cn("min-w-0 max-w-[9.5rem] sm:max-w-[12rem]", className)}
      trigger={
        <span
          data-testid="workspace-project-association-trigger"
          className={cn(
            "inline-flex max-w-full min-w-0 items-center gap-1 rounded-dlc-sm border border-border/80",
            "bg-dlc-surface-high text-xs font-semibold text-foreground shadow-dlc-1",
            "transition-colors duration-dlc-short ease-dlc-standard hover:bg-muted/70",
            dense
              ? "h-8 max-h-8 min-h-8 px-1.5 max-md:h-10 max-md:max-h-10 max-md:min-h-10"
              : cn(
                  "h-8 px-2",
                  touchTargetMinClass,
                  "max-md:min-h-11",
                ),
          )}
          title={`Project: ${name}`}
        >
          <FolderKanban
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="min-w-0 truncate">{name}</span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </span>
      }
    >
      <div
        className="min-w-[min(18rem,calc(100vw-1.5rem))] max-w-[22rem]"
        data-testid="workspace-project-association-menu"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {href ? (
          <DropdownMenuItem
            className="max-md:min-h-11"
            onClick={() => {
              startTransition(() => {
                router.push(href);
              });
            }}
          >
            <FolderKanban className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">Open project</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled className="max-md:min-h-11">
            <FolderKanban className="h-4 w-4 shrink-0" aria-hidden />
            Open project
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Files in this project
        </p>

        {siblingFiles.length === 0 ? (
          <p
            className="px-3 py-2 text-xs text-muted-foreground"
            data-testid="workspace-project-association-no-siblings"
          >
            No other files in this project yet.
          </p>
        ) : (
          <ul className="max-h-[min(50vh,16rem)] overflow-y-auto overscroll-contain py-0.5">
            {siblingFiles.map((file) => {
              const isCurrent = String(file._id) === String(currentFileId);
              const label = fileLabel(file.fileName);
              return (
                <li key={String(file._id)}>
                  <DropdownMenuItem
                    disabled={isCurrent}
                    className={cn(
                      "max-md:min-h-11",
                      isCurrent && "bg-muted/40 font-medium opacity-100",
                    )}
                    onClick={() => {
                      if (isCurrent) return;
                      startTransition(() => {
                        router.push(pipelineDealEditorHref(String(file._id)));
                      });
                    }}
                  >
                    {isCurrent ? (
                      <Check
                        className="h-4 w-4 shrink-0 text-primary"
                        aria-hidden
                      />
                    ) : (
                      <span className="inline-block h-4 w-4 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 truncate">{label}</span>
                    {isCurrent ? (
                      <span className="ml-auto shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Current
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                </li>
              );
            })}
          </ul>
        )}

        {siblingFiles.length === 1 && otherSiblings.length === 0 ? (
          <p className="border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
            This is the only file in the project.
          </p>
        ) : null}

        {href ? (
          <div className="border-t border-border/40 px-3 py-2 md:hidden">
            <Link
              href={href}
              className="text-xs font-medium text-primary hover:underline"
              data-testid="workspace-project-association-open-link"
            >
              Open project page
            </Link>
          </div>
        ) : null}
      </div>
    </DropdownMenu>
  );
}
