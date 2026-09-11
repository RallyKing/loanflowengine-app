"use client";

import { memo, useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Landmark,
  MoreHorizontal,
  SearchX,
  UserRound,
  Users,
} from "lucide-react";
import type { RegistryItem, RegistryType } from "@/lib/registry/registryItem";
import { registryRoleDisplayName } from "@/lib/registry/universalRoles";
import { formatRelativeTimestamp } from "@/lib/formatRelativeTimestamp";
import { formatPhoneDisplay } from "@/lib/contact/contactMethods";
import {
  websiteDisplayLabel,
  websiteHref,
} from "@/lib/contacts/entityWebsites";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import { Button } from "@/components/ui/Button";
import { CopyableField } from "@/modules/contacts/workspace/CopyableField";
import { ContactsBulkToolbar } from "@/modules/contacts/workspace/ContactsBulkToolbar";
import { cn } from "@/lib/cn";
import { OP_WORKSPACE_ISLAND } from "@/lib/ui/operationalInputs";
import { useContactsScrollElement } from "@/modules/contacts/workspace/ContactsScrollContext";

const TYPE_ICONS: Record<RegistryType, typeof UserRound> = {
  contact: UserRound,
  entity: Building2,
  lender: Landmark,
};

const ROW_HEIGHT_PX = 48;

export type ContactsRowAction =
  | "edit"
  | "view-vault"
  | "promote-to-entity"
  | "delete";

export type ContactsDataTableProps = {
  items: RegistryItem[];
  loading?: boolean;
  searchQuery?: string;
  onClearSearch?: () => void;
  selectedId: string | null;
  onRowSelect: (item: RegistryItem) => void;
  onRowAction: (item: RegistryItem, action: ContactsRowAction) => void;
  canMutate?: boolean;
  columnVisibility: VisibilityState;
  sorting: SortingState;
  onSortingChange: (next: SortingState) => void;
  selectedRowKeys: Set<string>;
  onSelectedRowKeysChange: (next: Set<string>) => void;
  bulkBusy?: boolean;
  onBulkDelete?: () => void;
  onBulkAssignTag?: () => void;
};

const LINK_STATUS_LABEL: Record<
  NonNullable<RegistryItem["linkStatus"]>,
  string
> = {
  linked: "Linked",
  unlinked: "Unlinked",
  partial: "Partial",
};

function rowKey(item: RegistryItem): string {
  return `${item.registryType}-${item._id}`;
}

function SortHeader({
  label,
  sorted,
}: {
  label: string;
  sorted: false | "asc" | "desc";
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      {sorted === "asc" ? (
        <ChevronUp className="h-3.5 w-3.5 opacity-70" aria-hidden />
      ) : sorted === "desc" ? (
        <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
      ) : null}
    </span>
  );
}

const RowActions = memo(function RowActions({
  item,
  onAction,
  canMutate,
}: {
  item: RegistryItem;
  onAction: (action: ContactsRowAction) => void;
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
            data-testid={`contacts-row-actions-${item._id}`}
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
});

function buildColumns(
  canMutate: boolean,
  onRowAction: (item: RegistryItem, action: ContactsRowAction) => void,
  selectedRowKeys: Set<string>,
  allRowKeys: string[],
  onSelectedRowKeysChange: (next: Set<string>) => void,
): ColumnDef<RegistryItem>[] {
  const allSelected =
    allRowKeys.length > 0 && allRowKeys.every((k) => selectedRowKeys.has(k));
  const someSelected = allRowKeys.some((k) => selectedRowKeys.has(k));

  const selectColumn: ColumnDef<RegistryItem> = {
    id: "select",
    header: () => (
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-border accent-primary"
        checked={allSelected}
        ref={(el) => {
          if (el) el.indeterminate = !allSelected && someSelected;
        }}
        onChange={() => {
          if (allSelected) {
            onSelectedRowKeysChange(new Set());
          } else {
            onSelectedRowKeysChange(new Set(allRowKeys));
          }
        }}
        aria-label="Select all rows"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    enableSorting: false,
    cell: ({ row }) => {
      const key = rowKey(row.original);
      return (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border accent-primary"
          checked={selectedRowKeys.has(key)}
          onChange={() => {
            const next = new Set(selectedRowKeys);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            onSelectedRowKeysChange(next);
          }}
          aria-label={`Select ${row.original.displayName}`}
          onClick={(e) => e.stopPropagation()}
        />
      );
    },
  };

  const dataColumns: ColumnDef<RegistryItem>[] = [
    {
      id: "displayName",
      accessorKey: "displayName",
      header: "Name",
      cell: ({ row }) => {
        const Icon = TYPE_ICONS[row.original.registryType];
        const firstSite = row.original.websites?.[0];
        return (
          <div className="flex min-w-0 items-center gap-2">
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                row.original.registryType === "entity"
                  ? "text-primary"
                  : row.original.registryType === "lender"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground",
              )}
              aria-hidden
            />
            <div className="min-w-0">
              <span className="block min-w-0 truncate font-medium">
                {row.original.displayName}
              </span>
              {firstSite ? (
                <a
                  href={websiteHref(firstSite.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 block min-w-0 truncate text-xs text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  title={firstSite.url}
                >
                  {websiteDisplayLabel(firstSite)}
                  {(row.original.websites?.length ?? 0) > 1
                    ? ` +${(row.original.websites?.length ?? 1) - 1}`
                    : ""}
                </a>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      id: "roles",
      accessorFn: (row) => row.roles.join(","),
      header: "Roles",
      cell: ({ row }) => (
        <div className="flex max-w-[14rem] flex-wrap gap-1">
          {row.original.roles.map((roleId) => (
            <span
              key={roleId}
              className="inline-flex rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium leading-tight text-primary"
            >
              {registryRoleDisplayName(roleId)}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: "primaryEmail",
      accessorKey: "primaryEmail",
      header: "Email",
      cell: ({ row }) => {
        const email = row.original.primaryEmail;
        if (!email) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex max-w-[14rem] items-center gap-1">
            <span className="min-w-0 truncate text-muted-foreground">{email}</span>
            <CopyableField value={email} label="Copy email" />
          </div>
        );
      },
    },
    {
      id: "primaryPhone",
      accessorKey: "primaryPhone",
      header: "Phone",
      cell: ({ row }) => {
        const phone = row.original.primaryPhone;
        if (!phone) {
          return <span className="text-muted-foreground">—</span>;
        }
        const formatted = formatPhoneDisplay(phone);
        return (
          <div className="flex items-center gap-1">
            <span className="whitespace-nowrap text-muted-foreground">{formatted}</span>
            <CopyableField value={formatted} label="Copy phone" />
          </div>
        );
      },
    },
    {
      id: "linkStatus",
      accessorKey: "linkStatus",
      header: "Link status",
      cell: ({ row }) => {
        const status = row.original.linkStatus ?? "unlinked";
        return (
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
              status === "linked"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-muted/80 text-muted-foreground",
            )}
          >
            {LINK_STATUS_LABEL[status]}
          </span>
        );
      },
    },
    {
      id: "lastActivityAt",
      accessorKey: "lastActivityAt",
      header: "Last activity",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {row.original.lastActivityAt
            ? formatRelativeTimestamp(row.original.lastActivityAt)
            : "—"}
        </span>
      ),
    },
    {
      id: "lastInteractionAt",
      accessorKey: "lastInteractionAt",
      header: "Last interaction",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {row.original.lastInteractionAt
            ? formatRelativeTimestamp(row.original.lastInteractionAt)
            : "—"}
        </span>
      ),
    },
    {
      id: "updatedAt",
      accessorKey: "updatedAt",
      header: "Last updated",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatRelativeTimestamp(row.original.updatedAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <RowActions
          item={row.original}
          canMutate={canMutate}
          onAction={(action) => onRowAction(row.original, action)}
        />
      ),
    },
  ];

  return canMutate ? [selectColumn, ...dataColumns] : dataColumns;
}

const VirtualizedTableRow = memo(function VirtualizedTableRow({
  row,
  selected,
  bulkChecked,
  onRowSelect,
  measureRef,
}: {
  row: Row<RegistryItem>;
  selected: boolean;
  bulkChecked: boolean;
  onRowSelect: (item: RegistryItem) => void;
  measureRef: (el: HTMLTableRowElement | null) => void;
}) {
  const item = row.original;
  return (
    <tr
      ref={measureRef}
      data-index={row.index}
      className={cn(
        "border-b border-slate-200/80 transition-colors duration-dlc-short ease-dlc-standard",
        "cursor-pointer hover:bg-slate-50 dark:hover:bg-muted/40",
        (selected || bulkChecked) &&
          "bg-blue-50 hover:bg-blue-50 dark:bg-blue-950/30 dark:hover:bg-blue-950/35",
        selected && "shadow-[inset_3px_0_0_0] shadow-blue-500",
        !selected && !bulkChecked && (row.index % 2 === 1 ? "bg-muted/10" : "bg-background"),
      )}
      style={{ height: ROW_HEIGHT_PX }}
      onClick={() => onRowSelect(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRowSelect(item);
        }
      }}
      tabIndex={0}
      role="button"
      data-testid="contacts-table-row"
    >
      {row.getVisibleCells().map((cell) => (
        <td
          key={cell.id}
          className={cn(
            "px-4 py-3 align-middle",
            cell.column.id === "select" && "w-10",
            cell.column.id === "roles" && "hidden md:table-cell",
            cell.column.id === "primaryEmail" && "hidden lg:table-cell",
            cell.column.id === "primaryPhone" && "hidden sm:table-cell",
            (cell.column.id === "lastActivityAt" ||
              cell.column.id === "lastInteractionAt" ||
              cell.column.id === "updatedAt") &&
              "hidden xl:table-cell",
            cell.column.id === "linkStatus" && "hidden lg:table-cell",
            cell.column.id === "actions" && "w-10 text-right",
          )}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
});

export function ContactsDataTable({
  items,
  loading = false,
  searchQuery = "",
  onClearSearch,
  selectedId,
  onRowSelect,
  onRowAction,
  canMutate = true,
  columnVisibility,
  sorting,
  onSortingChange,
  selectedRowKeys,
  onSelectedRowKeysChange,
  bulkBusy = false,
  onBulkDelete,
  onBulkAssignTag,
}: ContactsDataTableProps) {
  const scrollElement = useContactsScrollElement();

  const allRowKeys = useMemo(() => items.map(rowKey), [items]);

  const columns = useMemo(
    () =>
      buildColumns(
        canMutate,
        onRowAction,
        selectedRowKeys,
        allRowKeys,
        onSelectedRowKeysChange,
      ),
    [canMutate, onRowAction, selectedRowKeys, allRowKeys, onSelectedRowKeysChange],
  );

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting, columnVisibility },
    manualSorting: true,
    onSortingChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  const tableRows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 12,
    measureElement:
      typeof window !== "undefined" &&
      navigator.userAgent.indexOf("Firefox") === -1
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0]!.start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1]!.end
      : 0;

  if (loading) {
    return (
      <div
        className={cn(OP_WORKSPACE_ISLAND, "p-4")}
        data-testid="contacts-table-loading"
      >
        <OperationalSkeletonList rows={10} />
      </div>
    );
  }

  if (items.length === 0) {
    const hasSearch = searchQuery.trim().length > 0;
    return (
      <div
        className={cn(
          OP_WORKSPACE_ISLAND,
          "flex flex-col items-center justify-center gap-5 p-12 text-center",
        )}
        data-testid="contacts-table-empty"
      >
        <div className="relative flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-muted/40" aria-hidden />
          {hasSearch ? (
            <SearchX
              className="relative h-10 w-10 text-muted-foreground/80"
              aria-hidden
            />
          ) : (
            <Users
              className="relative h-10 w-10 text-muted-foreground/80"
              aria-hidden
            />
          )}
        </div>
        <div className="max-w-md space-y-2">
          <p className="text-lg font-semibold tracking-tight text-foreground">
            {hasSearch
              ? "No matches found in your contacts"
              : "No contacts yet"}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {hasSearch
              ? `We couldn't find anyone matching “${searchQuery.trim()}”. Try a different name, email, or phone number.`
              : "No contacts match your filters. Adjust filters or add a new contact."}
          </p>
        </div>
        {hasSearch && onClearSearch ? (
          <Button type="button" variant="outline" size="sm" onClick={onClearSearch}>
            Clear search
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "min-w-0",
        OP_WORKSPACE_ISLAND,
        "overflow-hidden p-0",
      )}
      data-testid="contacts-data-table"
      data-feed-mode="full"
      data-row-count={items.length}
      data-virtual-row-count={virtualRows.length}
      data-total-row-count={tableRows.length}
    >
      <ContactsBulkToolbar
        count={selectedRowKeys.size}
        busy={bulkBusy}
        canMutate={canMutate}
        onAssignTag={() => onBulkAssignTag?.()}
        onDelete={() => onBulkDelete?.()}
        onClear={() => onSelectedRowKeysChange(new Set())}
        className="mx-3 mt-3"
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <caption className="sr-only">Contacts directory</caption>
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  if (!header.column.getIsVisible()) return null;
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={cn(
                        "px-4 py-3 text-dlc-label-md font-semibold text-muted-foreground",
                        header.column.getCanSort() &&
                          "cursor-pointer select-none hover:text-foreground",
                        header.id === "select" && "w-10",
                        header.id === "roles" && "hidden md:table-cell",
                        header.id === "primaryEmail" && "hidden lg:table-cell",
                        header.id === "primaryPhone" && "hidden sm:table-cell",
                        (header.id === "lastActivityAt" ||
                          header.id === "lastInteractionAt" ||
                          header.id === "updatedAt") &&
                          "hidden xl:table-cell",
                        header.id === "linkStatus" && "hidden lg:table-cell",
                      )}
                      onClick={
                        header.column.getCanSort()
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <SortHeader
                          label={String(header.column.columnDef.header)}
                          sorted={sorted}
                        />
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 ? (
              <tr aria-hidden>
                <td
                  colSpan={table.getVisibleFlatColumns().length}
                  style={{ height: paddingTop, padding: 0, border: 0 }}
                />
              </tr>
            ) : null}
            {virtualRows.map((vRow) => {
              const row = tableRows[vRow.index];
              if (!row) return null;
              const item = row.original;
              const key = rowKey(item);
              const selected = selectedId === key;
              const bulkChecked = selectedRowKeys.has(key);
              return (
                <VirtualizedTableRow
                  key={row.id}
                  row={row}
                  selected={selected}
                  bulkChecked={bulkChecked}
                  onRowSelect={onRowSelect}
                  measureRef={virtualizer.measureElement}
                />
              );
            })}
            {paddingBottom > 0 ? (
              <tr aria-hidden>
                <td
                  colSpan={table.getVisibleFlatColumns().length}
                  style={{ height: paddingBottom, padding: 0, border: 0 }}
                />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const CONTACTS_TABLE_COLUMN_IDS = [
  "select",
  "displayName",
  "roles",
  "primaryEmail",
  "primaryPhone",
  "linkStatus",
  "lastActivityAt",
  "lastInteractionAt",
  "updatedAt",
  "actions",
] as const;

export const DEFAULT_CONTACTS_COLUMN_VISIBILITY: VisibilityState = {
  select: true,
  displayName: true,
  roles: true,
  primaryEmail: true,
  primaryPhone: true,
  linkStatus: true,
  lastActivityAt: true,
  lastInteractionAt: false,
  updatedAt: true,
  actions: true,
};
