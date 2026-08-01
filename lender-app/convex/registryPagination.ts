/**
 * Federated registry pagination — k-way merge across contacts / clients / lenders
 * with composite cursor. Used by `api.registry.listPaginated`.
 *
 * Convex allows at most one `.paginate()` per query function, so streams use
 * indexed `.take()` batches with manual (updatedAt, _id) cursors.
 */
import type { QueryCtx } from "./_generated/server";
import type { PaginationOptions, PaginationResult } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveClientAccessLevel } from "./resourceAccess";
import { filterContactsByOrgScope } from "./organizationAccess";
import type { RegistryRoleId } from "../lib/registry/universalRoles";
import {
  mapContactToRegistryItem,
  mapEntityToRegistryItem,
  mapLenderToRegistryItem,
  registryItemMatchesDateRange,
  registryItemMatchesLinkStatusFilter,
  registryItemMatchesRoleFilter,
  registryItemMatchesSearchQuery,
  registryItemMatchesTagFilter,
  type RegistryItem,
  type RegistryType,
} from "../lib/registry/registryItem";

const STREAM_BATCH = 32;
/** Max rows returned from global federated search (Convex search indexes). */
const SEARCH_RESULT_CAP = 100;
/** Terminal cursor for bounded search pages — must be a non-empty string for usePaginatedQuery. */
export const SEARCH_TERMINAL_CURSOR = "__registry_search_done__";

export type RegistryListFilters = {
  organizationId: Id<"organizations">;
  memberUserKey: string;
  searchQuery?: string;
  typeFilter?: RegistryType[];
  roleFilter?: RegistryRoleId[];
  sortBy?: "updatedAt" | "displayName" | "lastActivityAt" | "lastInteractionAt";
  linkStatusFilter?: Array<"linked" | "unlinked" | "partial">;
  tagFilter?: string[];
  activityFrom?: number;
  activityTo?: number;
  globalAdmin: boolean;
};

type StreamCursor = {
  updatedAt: number;
  id: string;
};

type MergedCursor = {
  v: 2;
  contacts: StreamCursor | null;
  entities: StreamCursor | null;
  lenders: StreamCursor | null;
  contactsDone: boolean;
  entitiesDone: boolean;
  lendersDone: boolean;
};

function emptyCursor(): MergedCursor {
  return {
    v: 2,
    contacts: null,
    entities: null,
    lenders: null,
    contactsDone: false,
    entitiesDone: false,
    lendersDone: false,
  };
}

function decodeCursor(raw: string | null): MergedCursor {
  if (!raw || raw === SEARCH_TERMINAL_CURSOR) return emptyCursor();
  try {
    const parsed = JSON.parse(raw) as MergedCursor;
    if (parsed?.v === 2) return parsed;
    if ((parsed as { v?: number })?.v === 1) {
      return emptyCursor();
    }
  } catch {
    /* legacy opaque cursor */
  }
  return emptyCursor();
}

function encodeCursor(cursor: MergedCursor): string {
  return JSON.stringify(cursor);
}

function streamCursorFromRow(row: { _id: string; updatedAt: number }): StreamCursor {
  return { updatedAt: row.updatedAt, id: row._id };
}

function rowAfterStreamCursor<T extends { _id: string; updatedAt: number }>(
  row: T,
  cursor: StreamCursor | null,
): boolean {
  if (!cursor) return true;
  if (row.updatedAt < cursor.updatedAt) return true;
  if (row.updatedAt > cursor.updatedAt) return false;
  return row._id < cursor.id;
}

function includesType(
  typeFilter: RegistryType[] | undefined,
  type: RegistryType,
): boolean {
  if (!typeFilter?.length) return true;
  return typeFilter.includes(type);
}

function lenderVisibleInOrg(
  row: Doc<"lenders">,
  organizationId: Id<"organizations">,
): boolean {
  return row.organizationId == null || row.organizationId === organizationId;
}

function sortValue(
  item: RegistryItem,
  sortBy: RegistryListFilters["sortBy"],
): string | number {
  switch (sortBy) {
    case "displayName":
      return item.displayName.toLowerCase();
    case "lastActivityAt":
      return item.lastActivityAt ?? 0;
    case "lastInteractionAt":
      return item.lastInteractionAt ?? 0;
    default:
      return item.updatedAt;
  }
}

function compareItemsDesc(
  a: RegistryItem,
  b: RegistryItem,
  sortBy: RegistryListFilters["sortBy"],
): number {
  const av = sortValue(a, sortBy);
  const bv = sortValue(b, sortBy);
  if (typeof av === "string" && typeof bv === "string") {
    return bv.localeCompare(av, "en", { sensitivity: "base" });
  }
  return (bv as number) - (av as number);
}

export function registryItemPassesListFilters(
  item: RegistryItem,
  filters: RegistryListFilters,
  options?: { trustSearchIndex?: boolean },
): boolean {
  if (
    !options?.trustSearchIndex &&
    filters.searchQuery?.trim() &&
    !registryItemMatchesSearchQuery(item, filters.searchQuery)
  ) {
    return false;
  }
  if (
    filters.roleFilter?.length &&
    !registryItemMatchesRoleFilter(item, filters.roleFilter)
  ) {
    return false;
  }
  if (
    filters.linkStatusFilter?.length &&
    !registryItemMatchesLinkStatusFilter(item, filters.linkStatusFilter)
  ) {
    return false;
  }
  if (
    filters.tagFilter?.length &&
    !registryItemMatchesTagFilter(item, filters.tagFilter)
  ) {
    return false;
  }
  if (
    !registryItemMatchesDateRange(
      item,
      "lastActivityAt",
      filters.activityFrom,
      filters.activityTo,
    )
  ) {
    return false;
  }
  return true;
}

async function filterEntitiesForMember(
  ctx: QueryCtx,
  rows: Doc<"clients">[],
  organizationId: Id<"organizations">,
  memberUserKey: string,
): Promise<Doc<"clients">[]> {
  const out: Doc<"clients">[] = [];
  for (const row of rows) {
    if (row.organizationId !== organizationId) continue;
    const level = await resolveClientAccessLevel(ctx, row, memberUserKey);
    if (level !== "none") out.push(row);
  }
  return out;
}

async function fetchContactBatch(
  ctx: QueryCtx,
  filters: RegistryListFilters,
  streamCursor: StreamCursor | null,
): Promise<{ rows: Doc<"contacts">[]; done: boolean; next: StreamCursor | null }> {
  const overfetch = STREAM_BATCH * 4;
  let rows: Doc<"contacts">[];

  if (filters.globalAdmin) {
    rows = await ctx.db
      .query("contacts")
      .withIndex("by_updatedAt")
      .order("desc")
      .take(overfetch);
    rows = rows.filter(
      (r) =>
        r.organizationId === filters.organizationId &&
        rowAfterStreamCursor(r, streamCursor),
    );
  } else if (streamCursor) {
    const indexed = await ctx.db
      .query("contacts")
      .withIndex("by_organization_updatedAt", (idx) =>
        idx
          .eq("organizationId", filters.organizationId)
          .lte("updatedAt", streamCursor.updatedAt),
      )
      .order("desc")
      .take(overfetch);
    rows = indexed.filter((r) => rowAfterStreamCursor(r, streamCursor));
  } else {
    rows = await ctx.db
      .query("contacts")
      .withIndex("by_organization_updatedAt", (idx) =>
        idx.eq("organizationId", filters.organizationId),
      )
      .order("desc")
      .take(STREAM_BATCH);
    return {
      rows,
      done: rows.length < STREAM_BATCH,
      next: rows.length > 0 ? streamCursorFromRow(rows[rows.length - 1]!) : null,
    };
  }

  const page = rows.slice(0, STREAM_BATCH);
  const done = page.length < STREAM_BATCH;
  return {
    rows: page,
    done,
    next: page.length > 0 ? streamCursorFromRow(page[page.length - 1]!) : streamCursor,
  };
}

async function fetchEntityBatch(
  ctx: QueryCtx,
  filters: RegistryListFilters,
  streamCursor: StreamCursor | null,
): Promise<{ rows: Doc<"clients">[]; done: boolean; next: StreamCursor | null }> {
  const overfetch = STREAM_BATCH * 6;
  const raw = await ctx.db
    .query("clients")
    .withIndex("by_organization", (idx) =>
      idx.eq("organizationId", filters.organizationId),
    )
    .take(overfetch);

  const sorted = raw
    .filter((r) => rowAfterStreamCursor(r, streamCursor))
    .sort((a, b) => b.updatedAt - a.updatedAt || (a._id < b._id ? 1 : -1));

  const visible = await filterEntitiesForMember(
    ctx,
    sorted.slice(0, STREAM_BATCH * 2),
    filters.organizationId,
    filters.memberUserKey,
  );

  const page = visible.slice(0, STREAM_BATCH);
  const done = page.length < STREAM_BATCH;
  return {
    rows: page,
    done,
    next: page.length > 0 ? streamCursorFromRow(page[page.length - 1]!) : streamCursor,
  };
}

async function fetchLenderBatch(
  ctx: QueryCtx,
  filters: RegistryListFilters,
  streamCursor: StreamCursor | null,
): Promise<{ rows: Doc<"lenders">[]; done: boolean; next: StreamCursor | null }> {
  const overfetch = STREAM_BATCH * 8;
  let rows = await ctx.db.query("lenders").order("desc").take(overfetch);
  if (!filters.globalAdmin) {
    rows = rows.filter((r) => lenderVisibleInOrg(r, filters.organizationId));
  }
  const page = rows
    .filter((r) => rowAfterStreamCursor(r, streamCursor))
    .slice(0, STREAM_BATCH);

  const done = page.length < STREAM_BATCH;
  return {
    rows: page,
    done,
    next: page.length > 0 ? streamCursorFromRow(page[page.length - 1]!) : streamCursor,
  };
}

async function refillContacts(
  ctx: QueryCtx,
  filters: RegistryListFilters,
  cursor: MergedCursor,
  buf: RegistryItem[],
): Promise<void> {
  if (cursor.contactsDone) return;
  const { rows, done, next } = await fetchContactBatch(ctx, filters, cursor.contacts);
  cursor.contacts = next;
  cursor.contactsDone = done;

  for (const row of rows) {
    const item = mapContactToRegistryItem(row);
    if (registryItemPassesListFilters(item, filters)) {
      buf.push(item);
    }
  }
}

async function refillEntities(
  ctx: QueryCtx,
  filters: RegistryListFilters,
  cursor: MergedCursor,
  buf: RegistryItem[],
): Promise<void> {
  if (cursor.entitiesDone) return;
  const { rows, done, next } = await fetchEntityBatch(ctx, filters, cursor.entities);
  cursor.entities = next;
  cursor.entitiesDone = done;

  for (const row of rows) {
    const item = mapEntityToRegistryItem(row);
    if (registryItemPassesListFilters(item, filters)) {
      buf.push(item);
    }
  }
}

async function refillLenders(
  ctx: QueryCtx,
  filters: RegistryListFilters,
  cursor: MergedCursor,
  buf: RegistryItem[],
): Promise<void> {
  if (cursor.lendersDone) return;
  const { rows, done, next } = await fetchLenderBatch(ctx, filters, cursor.lenders);
  cursor.lenders = next;
  cursor.lendersDone = done;

  for (const row of rows) {
    const item = mapLenderToRegistryItem(row);
    if (registryItemPassesListFilters(item, filters)) {
      buf.push(item);
    }
  }
}

export async function paginateRegistryList(
  ctx: QueryCtx,
  filters: RegistryListFilters,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<RegistryItem>> {
  const numItems = Math.min(Math.max(paginationOpts.numItems, 1), 100);
  const cursor = decodeCursor(paginationOpts.cursor);
  const sortBy = filters.sortBy ?? "updatedAt";
  const types = filters.typeFilter;

  const wantContacts = includesType(types, "contact");
  const wantEntities = includesType(types, "entity");
  const wantLenders = includesType(types, "lender");

  const contactBuf: RegistryItem[] = [];
  const entityBuf: RegistryItem[] = [];
  const lenderBuf: RegistryItem[] = [];

  const page: RegistryItem[] = [];
  let guard = 0;
  const maxIterations = numItems * 12 + 48;

  while (page.length < numItems && guard < maxIterations) {
    guard += 1;

    if (wantContacts && contactBuf.length === 0 && !cursor.contactsDone) {
      await refillContacts(ctx, filters, cursor, contactBuf);
    }
    if (wantEntities && entityBuf.length === 0 && !cursor.entitiesDone) {
      await refillEntities(ctx, filters, cursor, entityBuf);
    }
    if (wantLenders && lenderBuf.length === 0 && !cursor.lendersDone) {
      await refillLenders(ctx, filters, cursor, lenderBuf);
    }

    const candidates: Array<{
      item: RegistryItem;
      stream: "contact" | "entity" | "lender";
    }> = [];
    if (wantContacts && contactBuf[0]) {
      candidates.push({ item: contactBuf[0], stream: "contact" });
    }
    if (wantEntities && entityBuf[0]) {
      candidates.push({ item: entityBuf[0], stream: "entity" });
    }
    if (wantLenders && lenderBuf[0]) {
      candidates.push({ item: lenderBuf[0], stream: "lender" });
    }

    if (candidates.length === 0) break;

    candidates.sort((a, b) => compareItemsDesc(a.item, b.item, sortBy));
    const winner = candidates[0]!;

    page.push(winner.item);
    if (winner.stream === "contact") contactBuf.shift();
    else if (winner.stream === "entity") entityBuf.shift();
    else lenderBuf.shift();
  }

  const streamsDone =
    (!wantContacts || cursor.contactsDone) &&
    (!wantEntities || cursor.entitiesDone) &&
    (!wantLenders || cursor.lendersDone);
  const buffersEmpty =
    contactBuf.length === 0 && entityBuf.length === 0 && lenderBuf.length === 0;
  const hasMore =
    !streamsDone || !buffersEmpty || page.length >= numItems;

  return {
    page,
    continueCursor: encodeCursor(cursor),
    isDone: !hasMore,
  };
}

/** Global federated search — parallel Convex search indexes, no pagination cursor. */
export async function searchRegistryGlobal(
  ctx: QueryCtx,
  filters: RegistryListFilters,
): Promise<RegistryItem[]> {
  const q = filters.searchQuery?.trim() ?? "";
  if (!q) return [];

  const types = filters.typeFilter;
  const wantContacts = includesType(types, "contact");
  const wantEntities = includesType(types, "entity");
  const wantLenders = includesType(types, "lender");

  const tasks: Array<Promise<RegistryItem[]>> = [];

  if (wantContacts) {
    tasks.push(
      ctx.db
        .query("contacts")
        .withSearchIndex("global_search", (sq) =>
          sq
            .search("globalSearchText", q)
            .eq("organizationId", filters.organizationId),
        )
        .take(SEARCH_RESULT_CAP)
        .then((rows) => rows.map(mapContactToRegistryItem)),
    );
  }

  if (wantEntities) {
    tasks.push(
      (async () => {
        const rows = await ctx.db
          .query("clients")
          .withSearchIndex("entity_search", (sq) =>
            sq
              .search("displayName", q)
              .eq("organizationId", filters.organizationId),
          )
          .take(SEARCH_RESULT_CAP);
        const visible = await filterEntitiesForMember(
          ctx,
          rows,
          filters.organizationId,
          filters.memberUserKey,
        );
        return visible.map(mapEntityToRegistryItem);
      })(),
    );
  }

  if (wantLenders) {
    tasks.push(
      ctx.db
        .query("lenders")
        .withSearchIndex("lender_scenario", (sq) => sq.search("searchText", q))
        .take(SEARCH_RESULT_CAP * 2)
        .then((rows) => {
          const scoped = filters.globalAdmin
            ? rows
            : rows.filter((r) => lenderVisibleInOrg(r, filters.organizationId));
          return scoped.slice(0, SEARCH_RESULT_CAP).map(mapLenderToRegistryItem);
        }),
    );
  }

  const chunks = await Promise.all(tasks);
  const merged = chunks.flat();

  const filtered = merged.filter((item) =>
    registryItemPassesListFilters(item, filters, { trustSearchIndex: true }),
  );
  filtered.sort((a, b) => compareItemsDesc(a, b, filters.sortBy));

  return filtered.slice(0, SEARCH_RESULT_CAP);
}

/** Max rows returned by `api.registry.listAll` (full federated hose). */
const LIST_ALL_CAP = 10000;

/** Per-stream fetch cap — ensures contacts are not starved by k-way merge. */
const LIST_ALL_STREAM_CAP = 5000;

async function fetchAllContactRegistryItems(
  ctx: QueryCtx,
  filters: RegistryListFilters,
): Promise<RegistryItem[]> {
  const { organizationId, globalAdmin } = filters;
  let rows: Doc<"contacts">[];

  if (globalAdmin) {
    rows = await ctx.db
      .query("contacts")
      .withIndex("by_updatedAt")
      .order("desc")
      .collect();
    rows = filterContactsByOrgScope(rows, organizationId);
  } else {
    rows = await ctx.db
      .query("contacts")
      .withIndex("by_organization_updatedAt", (idx) =>
        idx.eq("organizationId", organizationId),
      )
      .order("desc")
      .collect();
  }

  return rows
    .map(mapContactToRegistryItem)
    .filter((item) => registryItemPassesListFilters(item, filters));
}

async function fetchAllEntityRegistryItems(
  ctx: QueryCtx,
  filters: RegistryListFilters,
): Promise<RegistryItem[]> {
  const raw = await ctx.db
    .query("clients")
    .withIndex("by_organization", (idx) =>
      idx.eq("organizationId", filters.organizationId),
    )
    .collect();

  const visible = await filterEntitiesForMember(
    ctx,
    raw,
    filters.organizationId,
    filters.memberUserKey,
  );

  return visible
    .map(mapEntityToRegistryItem)
    .filter((item) => registryItemPassesListFilters(item, filters));
}

async function fetchAllLenderRegistryItems(
  ctx: QueryCtx,
  filters: RegistryListFilters,
): Promise<RegistryItem[]> {
  let rows = await ctx.db
    .query("lenders")
    .order("desc")
    .take(LIST_ALL_STREAM_CAP);

  if (!filters.globalAdmin) {
    rows = rows.filter((r) => lenderVisibleInOrg(r, filters.organizationId));
  }

  return rows
    .map(mapLenderToRegistryItem)
    .filter((item) => registryItemPassesListFilters(item, filters));
}

/**
 * Load the full federated registry (contacts + entities + lenders).
 * Fetches each collection in parallel, then merges — avoids k-way merge
 * starvation where lenders/entities crowd out contacts in the result cap.
 */
export async function listAllRegistry(
  ctx: QueryCtx,
  filters: RegistryListFilters,
): Promise<RegistryItem[]> {
  const sortBy = filters.sortBy ?? "updatedAt";
  const types = filters.typeFilter;

  const wantContacts = includesType(types, "contact");
  const wantEntities = includesType(types, "entity");
  const wantLenders = includesType(types, "lender");

  const [contactItems, entityItems, lenderItems] = await Promise.all([
    wantContacts ? fetchAllContactRegistryItems(ctx, filters) : Promise.resolve([]),
    wantEntities ? fetchAllEntityRegistryItems(ctx, filters) : Promise.resolve([]),
    wantLenders ? fetchAllLenderRegistryItems(ctx, filters) : Promise.resolve([]),
  ]);

  const merged = [...contactItems, ...entityItems, ...lenderItems];
  merged.sort((a, b) => compareItemsDesc(a, b, sortBy));

  return merged.length > LIST_ALL_CAP ? merged.slice(0, LIST_ALL_CAP) : merged;
}

/** Search path for `usePaginatedQuery` continuation contract. */
export async function searchRegistryPage(
  ctx: QueryCtx,
  filters: RegistryListFilters,
): Promise<PaginationResult<RegistryItem>> {
  const page = await searchRegistryGlobal(ctx, filters);

  return {
    page,
    continueCursor: SEARCH_TERMINAL_CURSOR,
    isDone: true,
  };
}
