"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { hubDetailStyles } from "@/components/contacts/hub/hubDetailStyles";

export type HubDataTableColumn<T> = {
  id: string;
  header: string;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T, index: number) => ReactNode;
};

export type HubDataTableProps<T> = {
  columns: HubDataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  emptyMessage?: string;
  loading?: boolean;
  loadingMessage?: string;
  caption?: string;
  className?: string;
  /** When set, each body row is clickable (keyboard: Enter / Space). */
  onRowClick?: (row: T, index: number) => void;
  rowClassName?: string;
};

export function HubDataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No records.",
  loading = false,
  loadingMessage = "Loading…",
  caption,
  className,
  onRowClick,
  rowClassName,
}: HubDataTableProps<T>) {
  if (loading) {
    return (
      <p className={cn(hubDetailStyles.sectionHint, "py-8 text-center")}>
        {loadingMessage}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className={cn(hubDetailStyles.sectionHint, "py-8 text-center")}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-dlc-lg border border-slate-200",
        className,
      )}
    >
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
        {caption ? (
          <caption className="sr-only">{caption}</caption>
        ) : null}
        <thead>
          <tr className="border-b border-slate-200 bg-muted/40">
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                className={cn(
                  "px-4 py-3 text-dlc-label-md font-semibold text-muted-foreground",
                  col.headerClassName,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className={cn(
                "border-b border-slate-200/80 transition-colors duration-dlc-short ease-dlc-standard last:border-b-0",
                onRowClick
                  ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-muted/40"
                  : "hover:bg-slate-50",
                index % 2 === 1 ? "bg-muted/10" : "bg-background",
                rowClassName,
              )}
              onClick={
                onRowClick
                  ? () => {
                      onRowClick(row, index);
                    }
                  : undefined
              }
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row, index);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? "button" : undefined}
              data-testid={onRowClick ? "hub-data-table-row" : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.id}
                  className={cn(
                    "px-4 py-3 align-middle text-foreground",
                    col.cellClassName,
                  )}
                >
                  {col.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
