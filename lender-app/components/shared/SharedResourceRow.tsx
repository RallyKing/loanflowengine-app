"use client";

import { useRouter } from "next/navigation";
import {
  CheckSquare,
  ExternalLink,
  FileText,
  ShieldOff,
  ShieldPlus,
  Trash2,
} from "lucide-react";
import {
  ActionSuite,
  ActionSuiteIconButton,
} from "@/components/ui/ActionSuite";
import { ResourceOwnershipBadge } from "@/components/ownership/ResourceOwnershipBadge";
import type { ResourceOwnershipBadgeKind } from "@/lib/resourceOwnershipUi";
import {
  resourceTypeBadgeClass,
  resourceTypeBadgeLabel,
  roleBadgeBaseClass,
} from "@/lib/ui/roleBadgeTokens";
import { OperationalRowShell } from "@/components/ui/OperationalRowShell";

export type SharedRowModel = {
  shareId: string;
  resourceType: "task" | "pipeline";
  resourceId: string;
  title: string;
  permission: "view" | "edit";
  ownerUserId: string;
  ownerDisplayUsername: string;
  ownershipLine: string;
  ownershipBadge: ResourceOwnershipBadgeKind | null;
  sharedUserId: string;
  sharedDisplayUsername: string;
  updatedAt: number;
};

type Props = {
  row: SharedRowModel;
  mode: "with_me" | "by_me";
  viewerUserKey: string;
  showRecipient: boolean;
  busy: boolean;
  onUpgrade?: () => void;
  onDowngrade?: () => void;
  onRevoke?: () => void;
};

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SharedResourceRow({
  row,
  mode,
  viewerUserKey,
  showRecipient,
  busy,
  onUpgrade,
  onDowngrade,
  onRevoke,
}: Props) {
  const router = useRouter();
  const isOwner = row.ownerUserId === viewerUserKey;
  const canManage = mode === "by_me" && isOwner;

  const openHref =
    row.resourceType === "task"
      ? `/tasks?task=${encodeURIComponent(row.resourceId)}`
      : `/pipeline/${encodeURIComponent(row.resourceId)}`;

  const handleOpen = () => {
    router.push(openHref);
  };

  const typeKey = row.resourceType === "task" ? "task" : "pipeline";

  return (
    <li className="list-none border-b border-border/50 last:border-0">
      <OperationalRowShell
        onRowClick={handleOpen}
        left={
          <span
            className={roleBadgeBaseClass(
              "inline-flex items-center gap-1",
              resourceTypeBadgeClass(typeKey),
            )}
          >
            {row.resourceType === "task" ? (
              <CheckSquare className="h-3 w-3" aria-hidden />
            ) : (
              <FileText className="h-3 w-3" aria-hidden />
            )}
            {resourceTypeBadgeLabel(typeKey)}
          </span>
        }
        primary={row.title}
        secondary={
          <>
            <span className="whitespace-nowrap">{formatRelative(row.updatedAt)}</span>
            <span className="mx-1 text-muted-foreground/50">·</span>
            <span className="truncate" title={row.ownershipLine}>
              {row.ownershipLine}
            </span>
            {showRecipient ? (
              <>
                <span className="mx-1 text-muted-foreground/50">·</span>
                <span className="whitespace-nowrap">
                  → {row.sharedDisplayUsername}
                </span>
              </>
            ) : null}
          </>
        }
        tertiary={
          row.ownershipBadge ? (
            <ResourceOwnershipBadge badge={row.ownershipBadge} />
          ) : null
        }
        actions={
          <ActionSuite aria-label="Shared resource actions">
            {canManage ? (
              <>
                {row.permission === "view" ? (
                  <ActionSuiteIconButton
                    tooltip="Upgrade to edit"
                    testId={`share-upgrade-${row.shareId}`}
                    disabled={busy}
                    onClick={() => onUpgrade?.()}
                  >
                    <ShieldPlus className="h-4 w-4" aria-hidden />
                  </ActionSuiteIconButton>
                ) : (
                  <ActionSuiteIconButton
                    tooltip="Downgrade to view"
                    testId={`share-downgrade-${row.shareId}`}
                    disabled={busy}
                    onClick={() => onDowngrade?.()}
                  >
                    <ShieldOff className="h-4 w-4" aria-hidden />
                  </ActionSuiteIconButton>
                )}
                <ActionSuiteIconButton
                  tooltip="Revoke share"
                  testId={`share-revoke-${row.shareId}`}
                  disabled={busy}
                  destructive
                  onClick={() => onRevoke?.()}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </ActionSuiteIconButton>
              </>
            ) : null}
            <ActionSuiteIconButton
              tooltip="Open resource"
              testId={`share-open-${row.shareId}`}
              onClick={() => handleOpen()}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
            </ActionSuiteIconButton>
          </ActionSuite>
        }
      />
    </li>
  );
}
