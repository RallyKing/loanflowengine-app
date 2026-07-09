"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Landmark,
  MoreHorizontal,
  UserRound,
} from "lucide-react";
import type { RegistryItem, RegistryType } from "@/lib/registry/registryItem";
import { registryCommandCenterHref } from "@/lib/registry/registryRoutes";
import { registryRoleDisplayName } from "@/lib/registry/universalRoles";
import { formatRelativeTimestamp } from "@/lib/formatRelativeTimestamp";
import { HubDataTable, type HubDataTableColumn } from "@/components/contacts/hub/HubDataTable";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { OP_WORKSPACE_ISLAND } from "@/lib/ui/operationalInputs";

const TYPE_ICONS: Record<RegistryType, typeof UserRound> = {
  contact: UserRound,
  entity: Building2,
  lender: Landmark,
};

export type RegistryRowAction =
  | "edit"
  | "view-vault"
  | "promote-to-entity"
  | "delete";

export type RegistryDataTableProps = {
  items: RegistryItem[] | undefined;
  onRowAction: (item: RegistryItem, action: RegistryRowAction) => void;
  canMutate?: boolean;
};

function RegistryTypeIcon({ type }: { type: RegistryType }) {
  const Icon = TYPE_ICONS[type];
  return (
    <Icon
      className={cn(
        "h-4 w-4 shrink-0",
        type === "entity"
          ? "text-primary"
          : type === "lender"
            ? "text-amber-600 dark:text-amber-400"
            : "text-muted-foreground",
      )}
      aria-hidden
    />
  );
}

function RoleBadges({ roles }: { roles: RegistryItem["roles"] }) {
  if (roles.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex max-w-[14rem] flex-wrap gap-1">
      {roles.map((roleId) => (
        <span
          key={roleId}
          className="inline-flex rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium leading-tight text-primary"
        >
          {registryRoleDisplayName(roleId)}
        </span>
      ))}
    </div>
  );
}

function RegistryRowActions({
  item,
  onAction,
  canMutate,
}: {
  item: RegistryItem;
  onAction: (action: RegistryRowAction) => void;
  canMutate: boolean;
}) {
  return (
    <div
      className="inline-flex"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <DropdownMenu
        align="end"
        aria-label={`Actions for ${item.displayName}`}
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            data-testid={`registry-row-actions-${item._id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
            <span className="sr-only">Open actions menu</span>
          </Button>
        }
      >
        <DropdownMenuItem onClick={() => onAction("edit")}>Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("view-vault")}>
          View Vault
        </DropdownMenuItem>
      {canMutate && item.registryType === "contact" ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onAction("promote-to-entity")}>
            Promote to Entity
          </DropdownMenuItem>
        </>
      ) : null}
      {canMutate ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onClick={() => onAction("delete")}>
            Delete
          </DropdownMenuItem>
        </>
      ) : null}
      </DropdownMenu>
    </div>
  );
}

export function RegistryDataTable({
  items,
  onRowAction,
  canMutate = true,
}: RegistryDataTableProps) {
  const router = useRouter();
  const loading = items === undefined;

  const handleRowClick = useCallback(
    (item: RegistryItem) => {
      router.push(registryCommandCenterHref(item));
    },
    [router],
  );

  const columns = useMemo((): HubDataTableColumn<RegistryItem>[] => {
    return [
      {
        id: "name",
        header: "Name / Entity",
        headerClassName: "min-w-[12rem]",
        cellClassName: "font-medium",
        render: (row) => (
          <div className="flex min-w-0 items-center gap-2">
            <RegistryTypeIcon type={row.registryType} />
            <span className="min-w-0 truncate">{row.displayName}</span>
          </div>
        ),
      },
      {
        id: "roles",
        header: "Roles",
        headerClassName: "hidden md:table-cell",
        cellClassName: "hidden md:table-cell",
        render: (row) => <RoleBadges roles={row.roles} />,
      },
      {
        id: "email",
        header: "Email",
        headerClassName: "hidden lg:table-cell min-w-[10rem]",
        cellClassName: "hidden lg:table-cell text-muted-foreground",
        render: (row) => (
          <span className="block max-w-[14rem] truncate">
            {row.primaryEmail || "—"}
          </span>
        ),
      },
      {
        id: "phone",
        header: "Phone",
        headerClassName: "hidden sm:table-cell",
        cellClassName: "hidden sm:table-cell text-muted-foreground",
        render: (row) => row.primaryPhone || "—",
      },
      {
        id: "updated",
        header: "Last updated",
        headerClassName: "hidden xl:table-cell whitespace-nowrap",
        cellClassName:
          "hidden xl:table-cell whitespace-nowrap text-muted-foreground text-xs",
        render: (row) => formatRelativeTimestamp(row.updatedAt),
      },
      {
        id: "actions",
        header: "",
        headerClassName: "w-10",
        cellClassName: "w-10 text-right",
        render: (row) => (
          <RegistryRowActions
            item={row}
            canMutate={canMutate}
            onAction={(action) => onRowAction(row, action)}
          />
        ),
      },
    ];
  }, [canMutate, onRowAction]);

  if (loading) {
    return (
      <div
        className={cn(OP_WORKSPACE_ISLAND, "p-4")}
        data-testid="registry-table-loading"
      >
        <OperationalSkeletonList rows={10} />
      </div>
    );
  }

  return (
    <div className={cn("min-w-0", OP_WORKSPACE_ISLAND, "overflow-hidden p-0")}>
      <HubDataTable
        columns={columns}
        rows={items}
        rowKey={(row) => `${row.registryType}-${row._id}`}
        caption="Global registry records"
        emptyMessage="No registry records match your filters."
        className="rounded-none border-0"
        onRowClick={handleRowClick}
        rowClassName="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-inset"
      />
    </div>
  );
}
