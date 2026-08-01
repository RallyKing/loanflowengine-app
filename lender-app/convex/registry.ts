/**
 * Phase Registry-2 — federated read model (`contacts` + `clients` + `lenders`).
 */
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertOrgMember,
  assertOrgPermission,
  assertOrgScopeArgs,
} from "./organizationAccess";
import { callerHasUnrestrictedOrgDataAccess } from "./viewerOrgAccess";
import { resolveClientAccessLevel } from "./resourceAccess";
import { registryRoleIdV } from "./registryRoleValidators";
import type { RegistryRoleId } from "../lib/registry/universalRoles";
import {
  mapContactToRegistryItem,
  mapEntityToRegistryItem,
  mapLenderToRegistryItem,
  registryItemMatchesRoleFilter,
  registryItemMatchesSearchQuery,
  sortRegistryItems,
  type RegistryItem,
  type RegistryType,
} from "../lib/registry/registryItem";
import {
  listAllRegistry,
  paginateRegistryList,
  searchRegistryGlobal,
  type RegistryListFilters,
} from "./registryPagination";

const memberUserKeyArg = {
  memberUserKey: v.string(),
};

const registryTypeV = v.union(
  v.literal("contact"),
  v.literal("entity"),
  v.literal("lender"),
);

const DEFAULT_LIMIT = 200;
const SEARCH_FETCH_CAP = 100;
const linkStatusFilterV = v.optional(
  v.array(
    v.union(
      v.literal("linked"),
      v.literal("unlinked"),
      v.literal("partial"),
    ),
  ),
);

function lenderVisibleInOrg(
  row: Doc<"lenders">,
  organizationId: Id<"organizations">,
): boolean {
  return row.organizationId == null || row.organizationId === organizationId;
}

async function filterClientsForMember(
  ctx: QueryCtx,
  rows: Doc<"clients">[],
  organizationId: Id<"organizations">,
  memberUserKey: string,
): Promise<Doc<"clients">[]> {
  const scoped = rows.filter((r) => r.organizationId === organizationId);
  const out: Doc<"clients">[] = [];
  for (const row of scoped) {
    const level = await resolveClientAccessLevel(ctx, row, memberUserKey);
    if (level !== "none") out.push(row);
  }
  return out;
}

function includesType(
  typeFilter: RegistryType[] | undefined,
  type: RegistryType,
): boolean {
  if (!typeFilter?.length) return true;
  return typeFilter.includes(type);
}

async function fetchContactItems(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    searchQuery?: string;
    limit: number;
    globalAdmin: boolean;
  },
): Promise<RegistryItem[]> {
  const { organizationId, searchQuery, limit, globalAdmin } = args;
  const q = searchQuery?.trim() ?? "";

  let rows: Doc<"contacts">[];
  if (q.length >= 2) {
    rows = await ctx.db
      .query("contacts")
      .withSearchIndex("global_search", (sq) =>
        sq.search("globalSearchText", q).eq("organizationId", organizationId),
      )
      .take(Math.min(limit, SEARCH_FETCH_CAP));
  } else if (globalAdmin) {
    rows = await ctx.db
      .query("contacts")
      .withIndex("by_updatedAt")
      .order("desc")
      .take(limit);
    rows = rows.filter((r) => r.organizationId === organizationId);
  } else {
    rows = await ctx.db
      .query("contacts")
      .withIndex("by_organization_updatedAt", (idx) =>
        idx.eq("organizationId", organizationId),
      )
      .order("desc")
      .take(limit);
  }

  return rows.map(mapContactToRegistryItem);
}

async function fetchEntityItems(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    searchQuery?: string;
    limit: number;
  },
): Promise<RegistryItem[]> {
  const rows = await ctx.db
    .query("clients")
    .withIndex("by_organization", (idx) =>
      idx.eq("organizationId", args.organizationId),
    )
    .take(Math.min(args.limit * 2, SEARCH_FETCH_CAP * 2));

  const visible = await filterClientsForMember(
    ctx,
    rows,
    args.organizationId,
    args.memberUserKey,
  );

  let items = visible.map(mapEntityToRegistryItem);
  const q = args.searchQuery?.trim();
  if (q) {
    items = items.filter((item) => registryItemMatchesSearchQuery(item, q));
  }
  return items.slice(0, args.limit);
}

async function fetchLenderItems(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    searchQuery?: string;
    limit: number;
    globalAdmin: boolean;
  },
): Promise<RegistryItem[]> {
  const { organizationId, searchQuery, limit, globalAdmin } = args;
  const q = searchQuery?.trim() ?? "";

  let rows: Doc<"lenders">[];
  if (q.length >= 2) {
    rows = await ctx.db
      .query("lenders")
      .withSearchIndex("lender_scenario", (sq) => sq.search("searchText", q))
      .take(Math.min(limit * 2, SEARCH_FETCH_CAP * 2));
    if (!globalAdmin) {
      rows = rows.filter((r) => lenderVisibleInOrg(r, organizationId));
    }
  } else {
    rows = await ctx.db.query("lenders").order("desc").take(limit * 3);
    if (!globalAdmin) {
      rows = rows.filter((r) => lenderVisibleInOrg(r, organizationId));
    }
  }

  return rows.slice(0, limit).map(mapLenderToRegistryItem);
}

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    searchQuery: v.optional(v.string()),
    typeFilter: v.optional(v.array(registryTypeV)),
    roleFilter: v.optional(v.array(registryRoleIdV)),
    limit: v.optional(v.number()),
    sortBy: v.optional(
      v.union(
        v.literal("updatedAt"),
        v.literal("displayName"),
        v.literal("lastActivityAt"),
        v.literal("lastInteractionAt"),
      ),
    ),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const {
      organizationId,
      memberUserKey,
      searchQuery,
      typeFilter,
      roleFilter,
      sortBy,
    } = args;

    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    await assertOrgMember(ctx, organizationId, memberUserKey);
    await assertOrgPermission(
      ctx,
      organizationId,
      memberUserKey,
      "contacts.view",
    );

    const cap = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), DEFAULT_LIMIT);
    const globalAdmin = await callerHasUnrestrictedOrgDataAccess(ctx, memberUserKey);
    const types = typeFilter as RegistryType[] | undefined;
    const roles = (roleFilter ?? []) as RegistryRoleId[];

    const wantContacts = includesType(types, "contact");
    const wantEntities = includesType(types, "entity");
    const wantLenders = includesType(types, "lender");

    const [contactItems, entityItems, lenderItems] = await Promise.all([
      wantContacts
        ? fetchContactItems(ctx, {
            organizationId,
            memberUserKey,
            searchQuery,
            limit: cap,
            globalAdmin,
          })
        : Promise.resolve([] as RegistryItem[]),
      wantEntities
        ? fetchEntityItems(ctx, {
            organizationId,
            memberUserKey,
            searchQuery,
            limit: cap,
          })
        : Promise.resolve([] as RegistryItem[]),
      wantLenders
        ? fetchLenderItems(ctx, {
            organizationId,
            searchQuery,
            limit: cap,
            globalAdmin,
          })
        : Promise.resolve([] as RegistryItem[]),
    ]);

    let merged = [...contactItems, ...entityItems, ...lenderItems];

    if (searchQuery?.trim()) {
      merged = merged.filter((item) =>
        registryItemMatchesSearchQuery(item, searchQuery),
      );
    }

    if (roles.length > 0) {
      merged = merged.filter((item) =>
        registryItemMatchesRoleFilter(item, roles),
      );
    }

    merged = sortRegistryItems(merged, sortBy ?? "updatedAt").slice(0, cap);

    return merged;
  },
});

const registryListFilterArgs = {
  organizationId: v.id("organizations"),
  searchQuery: v.string(),
  typeFilter: v.optional(v.array(registryTypeV)),
  roleFilter: v.optional(v.array(registryRoleIdV)),
  sortBy: v.optional(
    v.union(
      v.literal("updatedAt"),
      v.literal("displayName"),
      v.literal("lastActivityAt"),
      v.literal("lastInteractionAt"),
    ),
  ),
  linkStatusFilter: linkStatusFilterV,
  tagFilter: v.optional(v.array(v.string())),
  activityFrom: v.optional(v.number()),
  activityTo: v.optional(v.number()),
  ...memberUserKeyArg,
};

async function buildRegistryListFilters(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    searchQuery?: string;
    typeFilter?: RegistryType[];
    roleFilter?: RegistryRoleId[];
    sortBy?: RegistryListFilters["sortBy"];
    linkStatusFilter?: RegistryListFilters["linkStatusFilter"];
    tagFilter?: string[];
    activityFrom?: number;
    activityTo?: number;
  },
): Promise<RegistryListFilters> {
  const { organizationId, memberUserKey } = args;
  await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
  await assertOrgMember(ctx, organizationId, memberUserKey);
  await assertOrgPermission(ctx, organizationId, memberUserKey, "contacts.view");
  const globalAdmin = await callerHasUnrestrictedOrgDataAccess(ctx, memberUserKey);
  return {
    organizationId,
    memberUserKey,
    searchQuery: args.searchQuery,
    typeFilter: args.typeFilter,
    roleFilter: args.roleFilter ?? [],
    sortBy: args.sortBy,
    linkStatusFilter: args.linkStatusFilter,
    tagFilter: args.tagFilter,
    activityFrom: args.activityFrom,
    activityTo: args.activityTo,
    globalAdmin,
  };
}

/**
 * Global federated search — queries entire org via Convex search indexes.
 * Used by `/contacts` when the search bar has a non-empty term (no pagination).
 */
export const searchList = query({
  args: registryListFilterArgs,
  handler: async (ctx, args) => {
    const filters = await buildRegistryListFilters(ctx, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
      searchQuery: args.searchQuery,
      typeFilter: args.typeFilter as RegistryType[] | undefined,
      roleFilter: (args.roleFilter ?? []) as RegistryRoleId[],
      sortBy: args.sortBy,
      linkStatusFilter: args.linkStatusFilter,
      tagFilter: args.tagFilter,
      activityFrom: args.activityFrom,
      activityTo: args.activityTo,
    });
    return await searchRegistryGlobal(ctx, filters);
  },
});

/**
 * Full federated registry hose — drives `useQuery` on `/contacts`.
 * Returns up to 5000 merged rows; search is client-side on the frontend.
 */
export const listAll = query({
  args: {
    organizationId: v.id("organizations"),
    typeFilter: v.optional(v.array(registryTypeV)),
    roleFilter: v.optional(v.array(registryRoleIdV)),
    sortBy: v.optional(
      v.union(
        v.literal("updatedAt"),
        v.literal("displayName"),
        v.literal("lastActivityAt"),
        v.literal("lastInteractionAt"),
      ),
    ),
    linkStatusFilter: linkStatusFilterV,
    tagFilter: v.optional(v.array(v.string())),
    activityFrom: v.optional(v.number()),
    activityTo: v.optional(v.number()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const filters = await buildRegistryListFilters(ctx, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
      typeFilter: args.typeFilter as RegistryType[] | undefined,
      roleFilter: (args.roleFilter ?? []) as RegistryRoleId[],
      sortBy: args.sortBy,
      linkStatusFilter: args.linkStatusFilter,
      tagFilter: args.tagFilter,
      activityFrom: args.activityFrom,
      activityTo: args.activityTo,
    });

    return await listAllRegistry(ctx, filters);
  },
});

/**
 * Paginated federated registry — legacy path; `/contacts` uses `listAll`.
 * Fetches 50–100 rows per page via indexed streams (no full-table collect).
 */
export const listPaginated = query({
  args: {
    organizationId: v.id("organizations"),
    typeFilter: v.optional(v.array(registryTypeV)),
    roleFilter: v.optional(v.array(registryRoleIdV)),
    sortBy: v.optional(
      v.union(
        v.literal("updatedAt"),
        v.literal("displayName"),
        v.literal("lastActivityAt"),
        v.literal("lastInteractionAt"),
      ),
    ),
    linkStatusFilter: linkStatusFilterV,
    tagFilter: v.optional(v.array(v.string())),
    activityFrom: v.optional(v.number()),
    activityTo: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const filters = await buildRegistryListFilters(ctx, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
      typeFilter: args.typeFilter as RegistryType[] | undefined,
      roleFilter: (args.roleFilter ?? []) as RegistryRoleId[],
      sortBy: args.sortBy,
      linkStatusFilter: args.linkStatusFilter,
      tagFilter: args.tagFilter,
      activityFrom: args.activityFrom,
      activityTo: args.activityTo,
    });

    return await paginateRegistryList(ctx, filters, args.paginationOpts);
  },
});
