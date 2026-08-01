"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex/react";
import { Search, User, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/Input";
import { PortalOverlayPanel } from "@/components/ui/PortalOverlayPanel";
import { cn } from "@/lib/cn";
import type { RegistryItem } from "@/lib/registry/registryItem";
import type { RegistryType } from "@/lib/registry/registryItem";

export type VaultRegistryAssignTarget =
  | {
      kind: "fileTask";
      fileTaskId: Id<"documentVaultFileTasks">;
    }
  | {
      kind: "documentLink";
      linkId: Id<"libraryDocumentLinks">;
    }
  | {
      kind: "folder";
      folderId: Id<"documentFolders">;
    };

export type VaultRegistryAssignPopoverProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  organizationId: Id<"organizations">;
  memberUserKey?: string;
  target: VaultRegistryAssignTarget;
  onAssigned?: () => void;
  onError?: (message: string) => void;
};

export function VaultRegistryAssignPopover({
  open,
  onClose,
  anchorRef,
  organizationId,
  memberUserKey,
  target,
  onAssigned,
  onError,
}: VaultRegistryAssignPopoverProps) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0, width: 260 });
  const [busy, setBusy] = useState(false);

  const registryRows = useQuery(
    api.registry.list,
    open && memberUserKey
      ? {
          organizationId,
          memberUserKey,
          searchQuery: search.trim() || undefined,
          typeFilter: ["contact", "entity", "lender"],
          limit: 30,
        }
      : "skip",
  );

  const assignFileTask = useMutation(api.documentVaultFileTasks.assignRegistry);
  const assignLink = useMutation(
    api.documentVaultRegistryAssignment.assignDocumentLink,
  );
  const assignFolder = useMutation(api.documentVaultRegistryAssignment.assignFolder);

  const assignees = useMemo(
    () => (registryRows ?? []) as RegistryItem[],
    [registryRows],
  );

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - 280),
      width: 260,
    });
  }, [anchorRef]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  const handleSelect = async (item: RegistryItem) => {
    if (!memberUserKey || busy) return;
    setBusy(true);
    try {
      const registryKind = item.registryType as RegistryType;
      if (target.kind === "fileTask") {
        await assignFileTask({
          fileTaskId: target.fileTaskId,
          registryKind,
          registryId: item._id,
          memberUserKey,
        });
      } else if (target.kind === "documentLink") {
        await assignLink({
          linkId: target.linkId,
          registryKind,
          registryId: item._id,
          memberUserKey,
        });
      } else {
        await assignFolder({
          folderId: target.folderId,
          registryKind,
          registryId: item._id,
          memberUserKey,
        });
      }
      setSearch("");
      onAssigned?.();
      onClose();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Assignment failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalOverlayPanel
      open={open}
      onClose={onClose}
      position={position}
      aria-label="Link contact"
      data-testid="vault-registry-assign-popover"
      className="max-h-72 overflow-hidden p-0"
    >
      <div className="border-b border-border/60 px-2 py-1.5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search registry…"
            className="h-7 pl-7 text-xs"
            autoFocus
          />
        </div>
      </div>
      <ul className="max-h-52 overflow-y-auto py-1">
        {assignees.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">
            No matches
          </li>
        ) : (
          assignees.map((item) => (
            <li key={`${item.registryType}-${item._id}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/60 disabled:opacity-50"
                disabled={busy}
                onClick={() => void handleSelect(item)}
              >
                <User className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {item.displayName}
                </span>
                <span className="shrink-0 text-[10px] capitalize text-muted-foreground">
                  {item.registryType}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </PortalOverlayPanel>
  );
}

export type VaultRegistryAssignChipProps = {
  displayName: string;
  onClear?: () => void;
  className?: string;
};

export function VaultRegistryAssignChip({
  displayName,
  onClear,
  className,
}: VaultRegistryAssignChipProps) {
  const firstName = displayName.trim().split(/\s+/)[0] || displayName;
  return (
    <span
      className={cn(
        "inline-flex max-w-[7rem] items-center gap-0.5 rounded-full bg-muted/80 px-1.5 py-0.5 text-[9px] font-medium text-foreground",
        className,
      )}
      title={displayName}
    >
      <User className="h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{firstName}</span>
      {onClear ? (
        <button
          type="button"
          className="shrink-0 rounded-full p-0.5 hover:bg-background/80"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          aria-label="Clear contact link"
        >
          <X className="h-2 w-2" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

export function useRegistryDisplayName(
  assignedContactId?: Id<"contacts">,
  assignedClientId?: Id<"clients">,
  assignedLenderId?: Id<"lenders">,
  organizationId?: Id<"organizations">,
  memberUserKey?: string,
): string | null {
  const registryRows = useQuery(
    api.registry.list,
    organizationId && memberUserKey
      ? {
          organizationId,
          memberUserKey,
          limit: 500,
        }
      : "skip",
  );

  return useMemo(() => {
    if (!registryRows) return null;
    const id =
      assignedContactId != null
        ? String(assignedContactId)
        : assignedClientId != null
          ? String(assignedClientId)
          : assignedLenderId != null
            ? String(assignedLenderId)
            : null;
    if (!id) return null;
    const hit = (registryRows as RegistryItem[]).find((r) => r._id === id);
    return hit?.displayName ?? null;
  }, [
    assignedClientId,
    assignedContactId,
    assignedLenderId,
    registryRows,
  ]);
}
