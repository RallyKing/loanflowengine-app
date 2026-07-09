/**
 * Phase Registry-2 — federated read model (`contacts` + `clients` + `lenders`).
 */
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertOrgMember,
  assertOrgPermission,
  assertOrgScopeArgs,
  sessionKeyIsGlobalAdmin,
} from "./organizationAccess";
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

const memberUserKeyArg = {
  memberUserKey: v.string(),
};

const registryTypeV = v.union(
  v.literal("contact"),
  v.literal("entity"),
  v.literal("lender"),
);

const DEFAULT_LIMIT = 2_000;
const SEARCH_FETCH_CAP = 400;

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
    .collect();

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
    sortBy: v.optional(v.union(v.literal("updatedAt"), v.literal("displayName"))),
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
    const globalAdmin = await sessionKeyIsGlobalAdmin(ctx, memberUserKey);
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
