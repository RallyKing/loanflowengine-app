import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertOrgPermission,
  assertOrgScopeArgs,
  filterPipelineRowsForMember,
  filterTaskRowsForMember,
} from "./organizationAccess";
import {
  buildPipelineOwnershipPresentation,
  buildTaskOwnershipPresentation,
} from "./resourceOwnershipPresentation";
import { resolveFileHierarchy } from "./pipelineHierarchyCompat";
import type { ResourceOwnershipBadgeKind } from "../lib/resourceOwnershipUi";
import { primaryContactEmail } from "../lib/contact/contactMethods";

const searchType = v.union(
  v.literal("file"),
  v.literal("contact"),
  v.literal("lender"),
  v.literal("task"),
);

type GlobalSearchHit = {
  kind: "file" | "contact" | "lender" | "task";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  ownershipLine?: string;
  ownershipBadge?: ResourceOwnershipBadgeKind | null;
  /** Phase 13.3 — file hits only, for hierarchical palette grouping. */
  clientLabel?: string;
  projectLabel?: string;
  clientKey?: string;
  projectKey?: string;
  /** Phase 14 — relationship badge when query matched a linked client name. */
  matchedRelationship?: string;
};

/** Org-private lenders or shared catalog rows (`organizationId` unset). */
function lenderVisibleInOrg(
  l: Doc<"lenders">,
  organizationId: Id<"organizations">,
): boolean {
  return l.organizationId == null || l.organizationId === organizationId;
}

/**
 * Unified search across pipeline files, contacts, lenders (catalog), and tasks.
 * Uses denormalized `globalSearchText` / `searchText` + Convex search indexes.
 * **Always scoped to one organization** (no global / cross-tenant mode).
 */
export const search = query({
  args: {
    q: v.string(),
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    /** Subset of entity kinds; omit for all. */
    types: v.optional(v.array(searchType)),
    limitPerType: v.optional(v.number()),
    /** When false (default), archived pipeline files are excluded after index hits. */
    includeArchivedFiles: v.optional(v.boolean()),
    /** Default `open` excludes done/archived tasks from task hits. */
    taskStatusFilter: v.optional(v.union(v.literal("open"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const raw = args.q.trim().toLowerCase();
    const limitPerType = Math.min(Math.max(args.limitPerType ?? 8, 1), 24);
    const fetchCap = Math.min(limitPerType * 5, 80);
    const types: Array<"file" | "contact" | "lender" | "task"> =
      args.types && args.types.length > 0
        ? [...args.types]
        : ["file", "contact", "lender", "task"];
    const typeSet = new Set(types);
    const includeArchived = args.includeArchivedFiles ?? false;
    const taskOpenOnly = (args.taskStatusFilter ?? "open") === "open";

    const empty = { hits: [] as GlobalSearchHit[], query: raw };

    if (raw.length < 2) {
      return empty;
    }

    const { organizationId, memberUserKey } = args;
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);

    if (typeSet.has("contact")) {
      await assertOrgPermission(
        ctx,
        organizationId,
        memberUserKey,
        "contacts.view",
      );
    }
    if (typeSet.has("file")) {
      await assertOrgPermission(
        ctx,
        organizationId,
        memberUserKey,
        "files.view",
      );
    }

    const hits: GlobalSearchHit[] = [];

    const pushFileRows = async (rows: Doc<"pipeline">[]) => {
      const visible = await filterPipelineRowsForMember(
        ctx,
        rows,
        organizationId,
        memberUserKey,
      );
      for (const r of visible) {
        if (!includeArchived && r.archivedAt != null) continue;
        if (hits.filter((h) => h.kind === "file").length >= limitPerType) break;
        const ownership = await buildPipelineOwnershipPresentation(
          ctx,
          r,
          memberUserKey,
        );
        const hierarchy = await resolveFileHierarchy(ctx, r);
        const clientLabel =
          hierarchy.linkedClients.length > 0
            ? hierarchy.linkedClients.map((c) => c.displayName).join(" · ")
            : hierarchy.client.displayName;
        const projectLabel = hierarchy.project.title;
        const clientKey =
          hierarchy.client.kind === "record"
            ? hierarchy.client.clientId
            : `legacy:${hierarchy.client.normalizedName}`;
        const projectKey =
          hierarchy.project.kind === "record"
            ? hierarchy.project.projectId
            : `legacy:${hierarchy.project.normalizedTitle}:${clientKey}`;
        let matchedRelationship: string | undefined;
        for (const lc of hierarchy.linkedClients) {
          if (lc.displayName.toLowerCase().includes(raw)) {
            matchedRelationship = lc.relationshipType;
            break;
          }
        }
        hits.push({
          kind: "file",
          id: String(r._id),
          title: r.fileName.trim() || "Untitled file",
          subtitle:
            ownership?.ownershipLine ?? (r.status?.trim() || undefined),
          href: `/pipeline/${encodeURIComponent(String(r._id))}`,
          ownershipLine: ownership?.ownershipLine,
          ownershipBadge: ownership?.badge ?? null,
          clientLabel,
          projectLabel,
          clientKey,
          projectKey,
          matchedRelationship,
        });
      }
    };

    const pushContactRows = (rows: Doc<"contacts">[]) => {
      for (const r of rows) {
        if (r.organizationId !== organizationId) continue;
        if (hits.filter((h) => h.kind === "contact").length >= limitPerType)
          break;
        const email = primaryContactEmail(r).trim();
        hits.push({
          kind: "contact",
          id: String(r._id),
          title: r.name.trim() || "Contact",
          subtitle: email || r.companyName?.trim() || undefined,
          href: `/contacts?contact=${encodeURIComponent(String(r._id))}`,
        });
      }
    };

    const pushLenderRows = (rows: Doc<"lenders">[]) => {
      for (const r of rows) {
        if (!lenderVisibleInOrg(r, organizationId)) continue;
        if (hits.filter((h) => h.kind === "lender").length >= limitPerType)
          break;
        const st = (r.primaryNiche ?? "").trim() || (r.entityType ?? "").trim();
        hits.push({
          kind: "lender",
          id: String(r._id),
          title: r.company.trim() || "Lender",
          subtitle: st || undefined,
          href: `/lenders?lender=${encodeURIComponent(String(r._id))}`,
        });
      }
    };

    const pushTaskRows = async (rows: Doc<"tasks">[]) => {
      const visible = await filterTaskRowsForMember(
        ctx,
        rows,
        organizationId,
        memberUserKey,
      );
      for (const r of visible) {
        if (taskOpenOnly && (r.status === "done" || r.status === "archived")) {
          continue;
        }
        if (hits.filter((h) => h.kind === "task").length >= limitPerType) break;
        const ownership = await buildTaskOwnershipPresentation(
          ctx,
          r,
          memberUserKey,
        );
        hits.push({
          kind: "task",
          id: String(r._id),
          title: r.title.trim() || "Task",
          subtitle: ownership?.ownershipLine ?? r.type,
          href: `/tasks?task=${encodeURIComponent(String(r._id))}`,
          ownershipLine: ownership?.ownershipLine,
          ownershipBadge: ownership?.badge ?? null,
        });
      }
    };

    if (typeSet.has("file")) {
      const rows = await ctx.db
        .query("pipeline")
        .withSearchIndex("global_search", (q) =>
          q.search("globalSearchText", raw).eq("organizationId", organizationId),
        )
        .take(fetchCap);
      await pushFileRows(rows);
    }

    if (typeSet.has("contact")) {
      const rows = await ctx.db
        .query("contacts")
        .withSearchIndex("global_search", (q) =>
          q.search("globalSearchText", raw).eq("organizationId", organizationId),
        )
        .take(fetchCap);
      pushContactRows(rows);
    }

    if (typeSet.has("lender")) {
      const rows = await ctx.db
        .query("lenders")
        .withSearchIndex("lender_scenario", (q) => q.search("searchText", raw))
        .take(fetchCap);
      pushLenderRows(rows);
    }

    if (typeSet.has("task")) {
      const rows = await ctx.db
        .query("tasks")
        .withSearchIndex("global_search", (q) =>
          q.search("globalSearchText", raw).eq("organizationId", organizationId),
        )
        .take(fetchCap);
      await pushTaskRows(rows);
    }

    const kindOrder: Record<GlobalSearchHit["kind"], number> = {
      file: 0,
      contact: 1,
      lender: 2,
      task: 3,
    };
    hits.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]);

    return { hits, query: raw };
  },
});
