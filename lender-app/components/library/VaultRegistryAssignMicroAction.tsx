"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { User } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import {
  VaultRegistryAssignChip,
  VaultRegistryAssignPopover,
  useRegistryDisplayName,
  type VaultRegistryAssignTarget,
} from "@/components/library/VaultRegistryAssignPopover";

export type VaultRegistryAssignMicroActionProps = {
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  target: VaultRegistryAssignTarget;
  assignedContactId?: Id<"contacts">;
  assignedClientId?: Id<"clients">;
  assignedLenderId?: Id<"lenders">;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
};

export function VaultRegistryAssignMicroAction({
  organizationId,
  memberUserKey,
  target,
  assignedContactId,
  assignedClientId,
  assignedLenderId,
  disabled,
  compact = false,
  className,
}: VaultRegistryAssignMicroActionProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const clearFileTask = useMutation(
    api.documentVaultFileTasks.clearRegistryAssignment,
  );
  const clearLink = useMutation(
    api.documentVaultRegistryAssignment.clearDocumentLinkAssignment,
  );
  const clearFolder = useMutation(
    api.documentVaultRegistryAssignment.clearFolderAssignment,
  );

  const assigneeName = useRegistryDisplayName(
    assignedContactId,
    assignedClientId,
    assignedLenderId,
    organizationId,
    memberUserKey,
  );

  if (!organizationId || !memberUserKey) return null;

  const handleClear = () => {
    if (target.kind === "fileTask") {
      void clearFileTask({ fileTaskId: target.fileTaskId, memberUserKey });
    } else if (target.kind === "documentLink") {
      void clearLink({ linkId: target.linkId, memberUserKey });
    } else {
      void clearFolder({ folderId: target.folderId, memberUserKey });
    }
  };

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {assigneeName ? (
        <VaultRegistryAssignChip
          displayName={assigneeName}
          onClear={disabled ? undefined : handleClear}
        />
      ) : null}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-0.5 rounded-dlc-sm px-1 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40",
          compact && "text-[10px]",
        )}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Link Contact"
      >
        <User className="h-2.5 w-2.5 shrink-0" aria-hidden />
        <span>Link Contact</span>
      </button>
      <VaultRegistryAssignPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        organizationId={organizationId}
        memberUserKey={memberUserKey}
        target={target}
        onError={(msg) =>
          showOperationalToast({ title: "Assignment failed", description: msg })
        }
      />
    </span>
  );
}
