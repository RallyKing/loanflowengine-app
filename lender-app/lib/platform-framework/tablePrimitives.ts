/**
 * Enterprise data table primitives — class hooks and contracts (no shadow table system).
 * Table markup should use `dlc-data-table` from `app/globals.css` where applicable.
 */

export const PLATFORM_DATA_TABLE_CLASS = "dlc-data-table" as const;

/** Single primary sticky band per table; coordinate with hub `<main>` scroll owner. */
export const PLATFORM_TABLE_HEADER_STICKY_CLASS =
  "sticky top-0 z-10 bg-[rgb(var(--table-header)/0.92)]" as const;
