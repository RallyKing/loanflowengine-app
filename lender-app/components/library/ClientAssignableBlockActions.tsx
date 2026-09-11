"use client";

/**
 * Reusable broker chrome actions for client-fillable pipeline blocks.
 * Creates Document Vault `block_assignment` tasks and selective
 * `clientPortalLinks` (linkKind `block_fill`) — no parallel link system.
 */
import { useState } from "react";
import { useMutation } from "convex/react";
import { ClipboardList, Link2, Loader2, MoreHorizontal } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu";
import {
  atomicPortalBlockLabel,
  isAtomicPortalBlockId,
  type AtomicPortalBlockId,
} from "@/lib/atomicPortalBlockRegistry";
import { cn } from "@/lib/cn";
import { showOperationalToast } from "@/lib/ui/operationalToast";

export type ClientAssignableBlockActionsProps = {
  pipelineFileId: Id<"pipeline">;
  /** Atomic portal block id (e.g. `pfs_statement`). */
  blockId: AtomicPortalBlockId | string;
  memberUserKey?: string;
  assignedContactId?: Id<"contacts"> | null;
  readOnly?: boolean;
  /**
   * When false, only the vault Assign action is shown (block not yet in the
   * portal fill registry / no client form). Defaults to true when `blockId`
   * is a known atomic portal id.
   */
  showFillLink?: boolean;
  className?: string;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ClientAssignableBlockActions({
  pipelineFileId,
  blockId,
  memberUserKey,
  assignedContactId,
  readOnly = false,
  showFillLink,
  className,
}: ClientAssignableBlockActionsProps) {
  const ensureTask = useMutation(
    api.documentVaultFileTasks.ensureBlockAssignmentTask,
  );
  const issueFillLink = useMutation(
    api.documentVaultClientBundlePortal.issueBlockFillLink,
  );
  const [busy, setBusy] = useState<"assign" | "link" | null>(null);

  if (readOnly || !memberUserKey?.trim()) return null;
  if (!isAtomicPortalBlockId(blockId) && !blockId.trim()) return null;

  const label = isAtomicPortalBlockId(blockId)
    ? atomicPortalBlockLabel(blockId)
    : blockId;
  const fillLinkEnabled =
    showFillLink ?? isAtomicPortalBlockId(blockId);
  const contactArg = assignedContactId
    ? { assignedContactId }
    : {};

  const runAssign = async () => {
    if (busy) return;
    setBusy("assign");
    try {
      const result = await ensureTask({
        pipelineFileId,
        blockId,
        memberUserKey,
        ...contactArg,
      });
      showOperationalToast({
        title: result.created
          ? "Vault task created"
          : "Vault task ready",
        description: result.created
          ? `"${result.title}" is in Document Vault for the client.`
          : `"${result.title}" already exists — portal-visible.`,
        variant: "success",
      });
    } catch (e) {
      showOperationalToast({
        title: "Could not create vault task",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const runCopyLink = async () => {
    if (busy) return;
    setBusy("link");
    try {
      const result = await issueFillLink({
        pipelineFileId,
        blockId,
        memberUserKey,
        ...contactArg,
      });
      const copied = await copyText(result.portalUrl);
      showOperationalToast({
        title: copied ? "Client fill link copied" : "Client fill link ready",
        description: copied
          ? `Scoped to ${label}. Also listed in the link repository.`
          : result.portalUrl,
        variant: "success",
        durationMs: copied ? 4200 : 8000,
      });
    } catch (e) {
      showOperationalToast({
        title: "Could not generate fill link",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={cn("inline-flex shrink-0 items-center gap-0.5", className)}
      data-testid={`client-assignable-block-actions-${blockId}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="hidden h-10 min-h-[40px] w-10 min-w-[40px] p-0 sm:inline-flex"
        disabled={busy !== null}
        aria-label={`Add ${label} to Document Vault for client`}
        title="Assign to client (Document Vault)"
        data-testid={`block-assign-vault-${blockId}`}
        onClick={() => void runAssign()}
      >
        {busy === "assign" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <ClipboardList className="h-4 w-4" aria-hidden />
        )}
      </Button>
      {fillLinkEnabled ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hidden h-10 min-h-[40px] w-10 min-w-[40px] p-0 sm:inline-flex"
          disabled={busy !== null}
          aria-label={`Copy client fill link for ${label}`}
          title="Copy client fill link"
          data-testid={`block-copy-fill-link-${blockId}`}
          onClick={() => void runCopyLink()}
        >
          {busy === "link" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Link2 className="h-4 w-4" aria-hidden />
          )}
        </Button>
      ) : null}

      <div className="sm:hidden">
        <DropdownMenu
          align="end"
          aria-label={`${label} client actions`}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 min-h-[40px] w-10 min-w-[40px] p-0"
              disabled={busy !== null}
              aria-label={`${label} client actions`}
              data-testid={`block-client-actions-menu-${blockId}`}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              )}
            </Button>
          }
        >
          <DropdownMenuItem
            onClick={() => void runAssign()}
            disabled={busy !== null}
          >
            <ClipboardList className="mr-2 h-4 w-4" aria-hidden />
            Assign to client (Document Vault)
          </DropdownMenuItem>
          {fillLinkEnabled ? (
            <DropdownMenuItem
              onClick={() => void runCopyLink()}
              disabled={busy !== null}
            >
              <Link2 className="mr-2 h-4 w-4" aria-hidden />
              Copy client fill link
            </DropdownMenuItem>
          ) : null}
        </DropdownMenu>
      </div>
    </div>
  );
}
