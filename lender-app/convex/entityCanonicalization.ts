/**
 * Phase Modular-A — canonical business-entity unification on `clients`.
 *
 * `clients` is the single canonical store for business entities (LLCs, corps).
 * `contactBusinessEntities` (contact sticky data) and `dealData.business`
 * (inline on the file) become derived caches that carry a `clientId`
 * back-reference. All writes here are additive: no sticky or inline data is
 * removed or overwritten.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { normalizeHierarchyName } from "./pipelineHierarchyCompat";
import { assertOrgMember, assertOrgPermission } from "./organizationAccess";
import {
  ownerFieldsForInsert,
  resolvePipelineAccessLevel,
} from "./resourceAccess";
import {
  mergePatchIntoDeal,
  resolveDealBaseForPipelinePatch,
} from "./dealDataMerge";
import { sanitizeDbPatch } from "./sanitizeConvexPatch";
import { appendPipelineFileActivity } from "./pipelineFileActivity";
import { clampActivitySummary } from "../lib/pipelineFileActivityModel";
import { refreshPipelineGlobalSearchText } from "./globalSearchSync";
import { syncFileClientTitleFromPrimaryParties } from "./pipelineClientTitleSync";
import {
  findLoanClientLink,
  listLoanClientLinks,
} from "./pipelineMultiClientLinks";
import {
  addLoanFileClientLink,
  findFileClientEdge,
  removeLoanFileClientLink,
} from "./indexedGraphEdgeSync";

type ClientEntityType = NonNullable<Doc<"clients">["entityType"]>;

/** Map free-text entity type (deal data / sticky rows) to the `clients` union. */
export function coerceClientEntityType(
  raw: string | undefined,
): ClientEntityType | undefined {
  const t = (raw ?? "").trim().toLowerCase().replace(/[.\s_-]+/g, "");
  if (!t) return undefined;
  if (t.includes("llc") || t.includes("limitedliability")) return "llc";
  if (t.includes("scorp") || t.includes("subchapters")) return "s_corp";
  if (
    t.includes("ccorp") ||
    t === "corp" ||
    t === "corporation" ||
    t === "inc" ||
    t === "incorporated"
  ) {
    return "c_corp";
  }
  if (t.includes("partner") || t === "lp" || t === "llp" || t === "gp") {
    return "partnership";
  }
  if (t.includes("sole") || t.includes("proprietor")) {
    return "sole_proprietorship";
  }
  return undefined;
}

function trimmed(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizedEin(ein: string | undefined): string {
  return (ein ?? "").replace(/[^0-9]/g, "");
}

function parseFormationDateMs(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Find the canonical `clients` row for a business entity within an org.
 * EIN match wins (strongest identity); falls back to normalized legal name.
 */
export async function findClientForOrg(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  legalName: string,
  ein?: string,
): Promise<Doc<"clients"> | null> {
  const einKey = normalizedEin(ein);
  if (einKey) {
    const orgClients = await ctx.db
      .query("clients")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
    const byEin = orgClients.find(
      (c) => normalizedEin(c.ein) === einKey && normalizedEin(c.ein) !== "",
    );
    if (byEin) return byEin;
  }
  return await ctx.db
    .query("clients")
    .withIndex("by_org_normalized", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("normalizedName", normalizeHierarchyName(legalName)),
    )
    .first();
}

export type EnsureClientFromBusinessArgs = {
  organizationId: Id<"organizations">;
  legalName: string;
  dba?: string;
  ein?: string;
  entityType?: string;
  stateOfIncorporation?: string;
  formationDate?: string;
  primaryContactId?: Id<"contacts">;
  /** Acting member key — becomes the owner on newly created rows. */
  ownerUserKey: string;
};

/**
 * Find-or-create the canonical `clients` row for a business entity.
 * Existing rows are matched (never mutated destructively); missing KYC fields
 * are patched in additively when we have better data.
 */
export async function ensureClientFromBusiness(
  ctx: MutationCtx,
  args: EnsureClientFromBusinessArgs,
): Promise<Id<"clients">> {
  const legalName = args.legalName.trim();
  const existing = await findClientForOrg(
    ctx,
    args.organizationId,
    legalName,
    args.ein,
  );
  const entityType = coerceClientEntityType(args.entityType);
  const ein = trimmed(args.ein);
  const dateOfFormation = parseFormationDateMs(args.formationDate);
  const stateOfIncorporation = trimmed(args.stateOfIncorporation);
  const now = Date.now();

  if (existing) {
    // Additive KYC enrichment only — never overwrite populated fields.
    const patch: Partial<Doc<"clients">> = {};
    if (!existing.entityType && entityType) patch.entityType = entityType;
    if (!existing.ein && ein) patch.ein = ein;
    if (!existing.stateOfIncorporation && stateOfIncorporation) {
      patch.stateOfIncorporation = stateOfIncorporation;
    }
    if (!existing.dateOfFormation && dateOfFormation) {
      patch.dateOfFormation = dateOfFormation;
    }
    if (!existing.companyName) patch.companyName = legalName;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
    }
    return existing._id;
  }

  return await ctx.db.insert("clients", {
    organizationId: args.organizationId,
    displayName: legalName,
    normalizedName: normalizeHierarchyName(legalName),
    companyName: trimmed(args.dba) ?? legalName,
    ...(args.primaryContactId ? { primaryContactId: args.primaryContactId } : {}),
    ...(entityType ? { entityType } : {}),
    ...(ein ? { ein } : {}),
    ...(stateOfIncorporation ? { stateOfIncorporation } : {}),
    ...(dateOfFormation ? { dateOfFormation } : {}),
    ...ownerFieldsForInsert(args.ownerUserKey),
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Link a `contactBusinessEntities` sticky row to its canonical `clients` row,
 * creating the clients row when needed. No-ops when already linked.
 */
export async function ensureClientBackrefForBusinessEntity(
  ctx: MutationCtx,
  entity: Doc<"contactBusinessEntities">,
  ownerUserKey: string,
): Promise<Id<"clients"> | null> {
  if (entity.clientId) {
    const linked = await ctx.db.get(entity.clientId);
    if (linked) return entity.clientId;
  }
  if (!entity.organizationId) return null;
  const legalName = trimmed(entity.entityName);
  if (!legalName) return null;

  const clientId = await ensureClientFromBusiness(ctx, {
    organizationId: entity.organizationId,
    legalName,
    dba: entity.dba,
    ein: entity.ein,
    entityType: entity.entityType,
    stateOfIncorporation: entity.state,
    formationDate: entity.formationDate,
    ownerUserKey,
  });
  await ctx.db.patch(entity._id, { clientId, updatedAt: Date.now() });
  return clientId;
}

const memberUserKeyArg = { memberUserKey: v.string() };

/**
 * Backfill migration: canonicalize every `contactBusinessEntities` row in an
 * org onto `clients`. Run with `dryRun: true` first to review the report;
 * commit mode links back-references and creates missing clients rows.
 * Fully additive — no rows deleted, no populated fields overwritten.
 */
export const backfillClientsFromBusinessEntities = mutation({
  args: {
    organizationId: v.id("organizations"),
    dryRun: v.boolean(),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "contacts.manage",
    );

    const entities = await ctx.db
      .query("contactBusinessEntities")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();

    let alreadyLinked = 0;
    let matchedExisting = 0;
    let createdClients = 0;
    let skippedNoName = 0;
    const samples: Array<{
      entityName: string;
      action: "already_linked" | "match_existing" | "create_client" | "skip_no_name";
    }> = [];
    const pushSample = (
      entityName: string,
      action: (typeof samples)[number]["action"],
    ) => {
      if (samples.length < 25) samples.push({ entityName, action });
    };

    for (const entity of entities) {
      const legalName = trimmed(entity.entityName);
      if (entity.clientId && (await ctx.db.get(entity.clientId))) {
        alreadyLinked += 1;
        pushSample(legalName ?? "(unnamed)", "already_linked");
        continue;
      }
      if (!legalName) {
        skippedNoName += 1;
        pushSample("(unnamed)", "skip_no_name");
        continue;
      }

      const match = await findClientForOrg(
        ctx,
        args.organizationId,
        legalName,
        entity.ein,
      );

      if (args.dryRun) {
        if (match) {
          matchedExisting += 1;
          pushSample(legalName, "match_existing");
        } else {
          createdClients += 1;
          pushSample(legalName, "create_client");
        }
        continue;
      }

      const clientId = await ensureClientBackrefForBusinessEntity(
        ctx,
        entity,
        args.memberUserKey,
      );
      if (!clientId) {
        skippedNoName += 1;
        continue;
      }
      if (match) {
        matchedExisting += 1;
        pushSample(legalName, "match_existing");
      } else {
        createdClients += 1;
        pushSample(legalName, "create_client");
      }
    }

    return {
      dryRun: args.dryRun,
      totalEntities: entities.length,
      alreadyLinked,
      matchedExisting,
      createdClients,
      skippedNoName,
      samples,
    };
  },
});

const CLIENT_ENTITY_TYPE_LABELS: Record<ClientEntityType, string> = {
  llc: "LLC",
  s_corp: "S-Corp",
  c_corp: "C-Corp",
  partnership: "Partnership",
  sole_proprietorship: "Sole Proprietor",
};

function dealBusinessFromFile(
  file: Doc<"pipeline">,
): Record<string, unknown> | null {
  const deal =
    file.dealData != null &&
    typeof file.dealData === "object" &&
    !Array.isArray(file.dealData)
      ? (file.dealData as Record<string, unknown>)
      : null;
  const business =
    deal?.business != null &&
    typeof deal.business === "object" &&
    !Array.isArray(deal.business)
      ? (deal.business as Record<string, unknown>)
      : null;
  return business;
}

export type CanonicalEntitySubRecord = {
  linkId: Id<"entityContactLinks">;
  contactId: Id<"contacts">;
  contactName: string;
  position: string;
  registryRoleId: string | null;
  relationshipRole: string;
  ownershipPercentage: number | null;
};

/**
 * Resolve the canonical `clients` row bound to a file's entity borrower
 * (`dealData.business`) plus its people sub-records (guarantors, sponsors,
 * signers from `entityContactLinks`).
 */
export const getCanonicalEntityForFile = query({
  args: {
    fileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file || !file.organizationId) return null;
    const memberUserKey = args.memberUserKey?.trim();
    if (!memberUserKey) return null;
    await assertOrgMember(ctx, file.organizationId, memberUserKey);

    const business = dealBusinessFromFile(file);
    const legalName = trimmed(business?.legalName);
    if (!legalName) return null;

    const client = await findClientForOrg(
      ctx,
      file.organizationId,
      legalName,
      trimmed(business?.ein),
    );
    if (!client) {
      return { client: null, subRecords: [] as CanonicalEntitySubRecord[] };
    }

    const links = await ctx.db
      .query("entityContactLinks")
      .withIndex("by_entity", (q) => q.eq("entityId", client._id))
      .collect();
    links.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const subRecords: CanonicalEntitySubRecord[] = [];
    for (const link of links) {
      const contact = await ctx.db.get(link.contactId);
      if (!contact) continue;
      subRecords.push({
        linkId: link._id,
        contactId: link.contactId,
        contactName: contact.name,
        position: link.position,
        registryRoleId: link.registryRoleId ?? null,
        relationshipRole: link.relationshipRole,
        ownershipPercentage: link.ownershipPercentage ?? null,
      });
    }

    return {
      client: {
        _id: client._id,
        displayName: client.displayName,
        companyName: client.companyName ?? null,
        entityType: client.entityType ?? null,
        entityTypeLabel: client.entityType
          ? CLIENT_ENTITY_TYPE_LABELS[client.entityType]
          : null,
        ein: client.ein ?? null,
        stateOfIncorporation: client.stateOfIncorporation ?? null,
        dateOfFormation: client.dateOfFormation ?? null,
      },
      subRecords,
    };
  },
});

/**
 * Inline registry create — minimal entity row for borrower linkage flows.
 */
export const quickCreateRegistryEntity = mutation({
  args: {
    organizationId: v.id("organizations"),
    legalName: v.string(),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "contacts.manage",
    );
    const legalName = args.legalName.trim();
    if (!legalName) throw new Error("Legal entity name is required.");
    const clientId = await ensureClientFromBusiness(ctx, {
      organizationId: args.organizationId,
      legalName,
      ownerUserKey: args.memberUserKey,
    });
    return { clientId };
  },
});

/**
 * Bind an existing `clients` entity as the borrower on a file: hydrates
 * `dealData.business` from the canonical record (no re-typing) and adds a
 * `loanClients`/`fileClients` edge with relationshipType `entity`.
 */
export const bindEntityBorrowerToFile = mutation({
  args: {
    fileId: v.id("pipeline"),
    clientId: v.id("clients"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file || !file.organizationId) throw new Error("File not found.");
    await assertOrgMember(ctx, file.organizationId, args.memberUserKey);
    const level = await resolvePipelineAccessLevel(
      ctx,
      file,
      args.memberUserKey,
    );
    if (level !== "edit") {
      throw new Error("You do not have permission to edit this file.");
    }

    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== file.organizationId) {
      throw new Error("Entity not found.");
    }

    const businessPatch: Record<string, unknown> = {
      legalName: client.displayName,
      ...(client.companyName && client.companyName !== client.displayName
        ? { dba: client.companyName }
        : {}),
      ...(client.ein ? { ein: client.ein } : {}),
      ...(client.entityType
        ? { entityType: CLIENT_ENTITY_TYPE_LABELS[client.entityType] }
        : {}),
      ...(client.stateOfIncorporation
        ? { stateOfFormation: client.stateOfIncorporation }
        : {}),
      ...(client.dateOfFormation
        ? {
            formationDate: new Date(client.dateOfFormation)
              .toISOString()
              .slice(0, 10),
          }
        : {}),
    };

    const existingBusiness = dealBusinessFromFile(file) ?? {};
    const deal = await resolveDealBaseForPipelinePatch(ctx, file);
    const mergedDeal = mergePatchIntoDeal(deal, {
      business: { ...existingBusiness, ...businessPatch },
      updatedAt: Date.now(),
    }) as Record<string, unknown>;
    const now = Date.now();
    await ctx.db.patch(
      file._id,
      sanitizeDbPatch({
        dealData: mergedDeal as Doc<"pipeline">["dealData"],
        updatedAt: now,
      }) as Partial<Doc<"pipeline">>,
    );

    if (file.intakeSheetId) {
      const intakeRow = await ctx.db.get(file.intakeSheetId);
      if (intakeRow) {
        const intakeBusiness =
          intakeRow.business != null &&
          typeof intakeRow.business === "object" &&
          !Array.isArray(intakeRow.business)
            ? (intakeRow.business as Record<string, unknown>)
            : {};
        await ctx.db.patch(
          file.intakeSheetId,
          sanitizeDbPatch({
            business: { ...intakeBusiness, ...businessPatch },
            updatedAt: now,
          }) as Partial<Doc<"intakeSheets">>,
        );
      }
    }

    await appendPipelineFileActivity(ctx, {
      fileId: file._id,
      at: now,
      kind: "deal_patch",
      keys: ["business"],
      summary: clampActivitySummary(
        `Entity borrower: ${client.displayName}`,
      ),
    });

    // Idempotent loanClients / fileClients edge (skip when it's the primary client).
    const isPrimaryClient =
      file.clientId && String(file.clientId) === String(args.clientId);
    if (!isPrimaryClient) {
      const existingLink = await findLoanClientLink(
        ctx,
        file._id,
        args.clientId,
      );
      const existingEdge = await findFileClientEdge(
        ctx,
        file._id,
        args.clientId,
      );
      if (!existingLink && !existingEdge) {
        const links = await listLoanClientLinks(ctx, file._id);
        const nextSortOrder =
          links.length === 0
            ? 1
            : Math.max(...links.map((l) => l.sortOrder)) + 1;
        await addLoanFileClientLink(ctx, {
          organizationId: file.organizationId,
          row: file,
          clientId: args.clientId,
          relationshipType: "entity",
          sortOrder: nextSortOrder,
          memberUserKey: args.memberUserKey,
        });
      }
    }

    await refreshPipelineGlobalSearchText(ctx, file._id);
    await syncFileClientTitleFromPrimaryParties(ctx, file._id);
    return {
      ok: true as const,
      clientId: args.clientId,
      business: businessPatch,
    };
  },
});

/**
 * Remove entity borrower binding — clears `dealData.business` (and intake
 * mirror) and drops the non-primary `loanClients` / file-client edge.
 */
export const unbindEntityBorrowerFromFile = mutation({
  args: {
    fileId: v.id("pipeline"),
    clientId: v.optional(v.id("clients")),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file || !file.organizationId) throw new Error("File not found.");
    await assertOrgMember(ctx, file.organizationId, args.memberUserKey);
    const level = await resolvePipelineAccessLevel(
      ctx,
      file,
      args.memberUserKey,
    );
    if (level !== "edit") {
      throw new Error("You do not have permission to edit this file.");
    }

    const deal = await resolveDealBaseForPipelinePatch(ctx, file);
    const now = Date.now();
    const mergedDeal = mergePatchIntoDeal(deal, {
      business: {},
      updatedAt: now,
    }) as Record<string, unknown>;

    await ctx.db.patch(
      file._id,
      sanitizeDbPatch({
        dealData: mergedDeal as Doc<"pipeline">["dealData"],
        updatedAt: now,
      }) as Partial<Doc<"pipeline">>,
    );

    if (file.intakeSheetId) {
      const intakeRow = await ctx.db.get(file.intakeSheetId);
      if (intakeRow) {
        await ctx.db.patch(
          file.intakeSheetId,
          sanitizeDbPatch({
            business: {},
            updatedAt: now,
          }) as Partial<Doc<"intakeSheets">>,
        );
      }
    }

    if (args.clientId) {
      try {
        await removeLoanFileClientLink(
          ctx,
          file,
          args.clientId,
          args.memberUserKey,
        );
      } catch {
        // Edge may already be absent — business clear is the source of truth.
      }
    }

    await appendPipelineFileActivity(ctx, {
      fileId: file._id,
      at: now,
      kind: "deal_patch",
      keys: ["business"],
      summary: clampActivitySummary("Entity borrower removed"),
    });
    await refreshPipelineGlobalSearchText(ctx, file._id);
    await syncFileClientTitleFromPrimaryParties(ctx, file._id);
    return { ok: true as const };
  },
});

/**
 * Entity master-record → file propagation. When canonical entity KYC changes
 * (rename, EIN, entity type, formation), refresh `dealData.business` on every
 * linked file whose business snapshot matches the entity's previous identity.
 * Quiet, additive writes; inverse of `bindEntityBorrowerToFile` hydration.
 */
export async function propagateEntityKycToLinkedFiles(
  ctx: MutationCtx,
  client: Doc<"clients">,
  previousDisplayName: string,
): Promise<{ filesTouched: number }> {
  if (!client.organizationId) return { filesTouched: 0 };

  const byFk = await ctx.db
    .query("pipeline")
    .withIndex("by_clientId", (q) => q.eq("clientId", client._id))
    .collect();
  const seen = new Set(byFk.map((f) => String(f._id)));
  const junction = await ctx.db
    .query("loanClients")
    .withIndex("by_client", (q) => q.eq("clientId", client._id))
    .collect();
  const files = [...byFk];
  for (const link of junction) {
    if (seen.has(String(link.pipelineId))) continue;
    const file = await ctx.db.get(link.pipelineId);
    if (file) {
      seen.add(String(file._id));
      files.push(file);
    }
  }

  const prevKey = normalizeHierarchyName(previousDisplayName);
  const currentKey = normalizeHierarchyName(client.displayName);
  const businessPatch: Record<string, unknown> = {
    legalName: client.displayName,
    ...(client.companyName && client.companyName !== client.displayName
      ? { dba: client.companyName }
      : {}),
    ...(client.ein ? { ein: client.ein } : {}),
    ...(client.entityType
      ? { entityType: CLIENT_ENTITY_TYPE_LABELS[client.entityType] }
      : {}),
    ...(client.stateOfIncorporation
      ? { stateOfFormation: client.stateOfIncorporation }
      : {}),
    ...(client.dateOfFormation
      ? {
          formationDate: new Date(client.dateOfFormation)
            .toISOString()
            .slice(0, 10),
        }
      : {}),
  };

  let filesTouched = 0;
  const MAX_FILES = 50;
  for (const file of files.slice(0, MAX_FILES)) {
    if (file.organizationId !== client.organizationId) continue;
    const business = dealBusinessFromFile(file);
    if (!business) continue;
    const legal = normalizeHierarchyName(
      typeof business.legalName === "string" ? business.legalName : "",
    );
    // Only refresh snapshots that clearly belong to this entity.
    if (legal !== prevKey && legal !== currentKey) continue;
    const differs = Object.entries(businessPatch).some(
      ([k, val]) => (business[k] ?? "") !== val,
    );
    if (!differs) continue;

    const deal = await resolveDealBaseForPipelinePatch(ctx, file);
    const mergedDeal = mergePatchIntoDeal(deal, {
      business: { ...business, ...businessPatch },
      updatedAt: Date.now(),
    }) as Record<string, unknown>;
    await ctx.db.patch(
      file._id,
      sanitizeDbPatch({
        dealData: mergedDeal as Doc<"pipeline">["dealData"],
        updatedAt: Date.now(),
      }) as Partial<Doc<"pipeline">>,
    );
    await refreshPipelineGlobalSearchText(ctx, file._id);
    await syncFileClientTitleFromPrimaryParties(ctx, file._id);
    filesTouched += 1;
  }
  return { filesTouched };
}
