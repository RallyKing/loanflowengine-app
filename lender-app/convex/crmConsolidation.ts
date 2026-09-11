/**
 * Phase 3 — CRM merge engine & entity conversion (transaction-safe orchestration).
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  assertCanMutateContactRow,
  assertCanReadContactRow,
  assertOrgMember,
  assertOrgPermission,
} from "./organizationAccess";
import { resolveClientAccessLevel, ownerFieldsForInsert } from "./resourceAccess";
import { deleteContactGraph } from "./contacts";
import { deleteClientGraphEdges } from "./hierarchyEntityCleanup";
import { upsertFileClientEdge } from "./indexedGraphEdgeSync";
import { refreshContactGlobalSearchText } from "./globalSearchSync";
import { normalizeHierarchyName } from "./pipelineHierarchyCompat";
import { upsertEntityContactLink } from "./entityContactLinkHelpers";
import { registryRoleIdV } from "./registryRoleValidators";
import {
  CONVERSION_DEFAULT_GATEWAY_POSITION,
  CONVERSION_DEFAULT_GATEWAY_ROLE,
  type RegistryRoleId,
} from "../lib/registry/universalRoles";
import {
  mergeContactRoleIds,
  primaryContactRoleIdFromDoc,
} from "../lib/contact/contactRoles";
import {
  mergeEntityWebsites,
} from "../lib/contacts/entityWebsites";
import {
  primaryContactEmail,
  primaryContactPhone,
} from "../lib/contact/contactMethods";
import {
  currentFicoFromHistory,
  mergeFicoHistories,
  type FicoHistoryEntry,
} from "../lib/contacts/ficoHistory";
import {
  isCoBorrowerFileLink,
  isPrimaryBorrowerFileLink,
} from "../lib/contacts/borrowerIdentityFromDeal";
import type { ClientRelationshipType } from "../lib/pipelineClientRelationships";

const memberUserKeyArg = {
  memberUserKey: v.string(),
};

const recordKindV = v.union(v.literal("contact"), v.literal("entity"));

const fieldWinnerV = v.union(v.literal("surviving"), v.literal("merged"));

const fieldResolutionV = v.array(
  v.object({
    field: v.string(),
    winner: fieldWinnerV,
  }),
);

export type MergeRecordKind = "contact" | "entity";

export type MergeFieldConflict = {
  field: string;
  label: string;
  survivingValue: string;
  mergedValue: string;
};

export type MergeReparentCounts = {
  contactFileLinks: number;
  entityContactLinks: number;
  individualContactLinks: number;
  contactLenderLinks: number;
  clientsAsPrimaryContact: number;
  projects: number;
  pipelineFiles: number;
  fileClients: number;
  loanClients: number;
};

type AffectedRelation = {
  table: string;
  edgeId?: string;
  detail?: string;
};

function displayOrDash(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "—";
  }
  const s = String(value).trim();
  return s || "—";
}

function valuesConflict(a: unknown, b: unknown): boolean {
  return displayOrDash(a) !== displayOrDash(b);
}

function fileLinkRelationshipType(
  link: Doc<"contactFileLinks">,
): ClientRelationshipType {
  if (isCoBorrowerFileLink(link)) return "coborrower";
  if (/guarantor/i.test(link.role)) return "guarantor";
  if (isPrimaryBorrowerFileLink(link)) return "primary";
  return "other";
}

async function assertContactMergePair(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
  survivingId: Id<"contacts">,
  mergedId: Id<"contacts">,
): Promise<{ surviving: Doc<"contacts">; merged: Doc<"contacts"> }> {
  if (String(survivingId) === String(mergedId)) {
    throw new Error("Cannot merge a record with itself.");
  }
  const surviving = await ctx.db.get(survivingId);
  const merged = await ctx.db.get(mergedId);
  if (!surviving || surviving.organizationId !== organizationId) {
    throw new Error("Surviving contact not found.");
  }
  if (!merged || merged.organizationId !== organizationId) {
    throw new Error("Merged contact not found.");
  }
  await assertCanReadContactRow(ctx, surviving, memberUserKey);
  await assertCanReadContactRow(ctx, merged, memberUserKey);
  return { surviving, merged };
}

async function assertEntityMergePair(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
  survivingId: Id<"clients">,
  mergedId: Id<"clients">,
): Promise<{ surviving: Doc<"clients">; merged: Doc<"clients"> }> {
  if (String(survivingId) === String(mergedId)) {
    throw new Error("Cannot merge a record with itself.");
  }
  const surviving = await ctx.db.get(survivingId);
  const merged = await ctx.db.get(mergedId);
  if (!surviving || surviving.organizationId !== organizationId) {
    throw new Error("Surviving entity not found.");
  }
  if (!merged || merged.organizationId !== organizationId) {
    throw new Error("Merged entity not found.");
  }
  for (const client of [surviving, merged]) {
    const level = await resolveClientAccessLevel(ctx, client, memberUserKey);
    if (level !== "edit") {
      throw new Error("You do not have permission to merge these entities.");
    }
  }
  return { surviving, merged };
}

function buildContactConflicts(
  surviving: Doc<"contacts">,
  merged: Doc<"contacts">,
): MergeFieldConflict[] {
  const fields: Array<{
    field: string;
    label: string;
    survivingValue: unknown;
    mergedValue: unknown;
  }> = [
    { field: "name", label: "Name", survivingValue: surviving.name, mergedValue: merged.name },
    {
      field: "primaryEmail",
      label: "Primary email",
      survivingValue: primaryContactEmail(surviving),
      mergedValue: primaryContactEmail(merged),
    },
    {
      field: "primaryPhone",
      label: "Primary phone",
      survivingValue: primaryContactPhone(surviving),
      mergedValue: primaryContactPhone(merged),
    },
    { field: "notes", label: "Notes", survivingValue: surviving.notes, mergedValue: merged.notes },
    { field: "fico", label: "FICO", survivingValue: surviving.fico, mergedValue: merged.fico },
    { field: "ssn", label: "SSN", survivingValue: surviving.ssn, mergedValue: merged.ssn },
    { field: "dob", label: "Date of birth", survivingValue: surviving.dob, mergedValue: merged.dob },
    {
      field: "companyName",
      label: "Company (legacy)",
      survivingValue: surviving.companyName,
      mergedValue: merged.companyName,
    },
  ];
  return fields
    .filter((f) => valuesConflict(f.survivingValue, f.mergedValue))
    .map((f) => ({
      field: f.field,
      label: f.label,
      survivingValue: displayOrDash(f.survivingValue),
      mergedValue: displayOrDash(f.mergedValue),
    }));
}

function buildEntityConflicts(
  surviving: Doc<"clients">,
  merged: Doc<"clients">,
): MergeFieldConflict[] {
  const fields: Array<{
    field: string;
    label: string;
    survivingValue: unknown;
    mergedValue: unknown;
  }> = [
    {
      field: "displayName",
      label: "Display name",
      survivingValue: surviving.displayName,
      mergedValue: merged.displayName,
    },
    {
      field: "companyName",
      label: "Company name",
      survivingValue: surviving.companyName,
      mergedValue: merged.companyName,
    },
    { field: "ein", label: "EIN", survivingValue: surviving.ein, mergedValue: merged.ein },
    {
      field: "entityType",
      label: "Entity type",
      survivingValue: surviving.entityType,
      mergedValue: merged.entityType,
    },
    {
      field: "stateOfIncorporation",
      label: "State of incorporation",
      survivingValue: surviving.stateOfIncorporation,
      mergedValue: merged.stateOfIncorporation,
    },
    {
      field: "dateOfFormation",
      label: "Date of formation",
      survivingValue: surviving.dateOfFormation,
      mergedValue: merged.dateOfFormation,
    },
  ];
  return fields
    .filter((f) => valuesConflict(f.survivingValue, f.mergedValue))
    .map((f) => ({
      field: f.field,
      label: f.label,
      survivingValue: displayOrDash(f.survivingValue),
      mergedValue: displayOrDash(f.mergedValue),
    }));
}

async function countContactReparents(
  ctx: QueryCtx,
  mergedContactId: Id<"contacts">,
  organizationId: Id<"organizations">,
): Promise<MergeReparentCounts> {
  const contactFileLinks = (
    await ctx.db
      .query("contactFileLinks")
      .withIndex("by_contact", (q) => q.eq("contactId", mergedContactId))
      .collect()
  ).length;

  const entityContactLinks = (
    await ctx.db
      .query("entityContactLinks")
      .withIndex("by_contact", (q) => q.eq("contactId", mergedContactId))
      .collect()
  ).length;

  const individual1 = (
    await ctx.db
      .query("individualContactLinks")
      .withIndex("by_contact1", (q) => q.eq("contactId1", mergedContactId))
      .collect()
  ).length;
  const individual2 = (
    await ctx.db
      .query("individualContactLinks")
      .withIndex("by_contact2", (q) => q.eq("contactId2", mergedContactId))
      .collect()
  ).length;

  const contactLenderLinks = (
    await ctx.db
      .query("contactLenderLinks")
      .withIndex("by_contact", (q) => q.eq("contactId", mergedContactId))
      .collect()
  ).length;

  const orgClients = await ctx.db
    .query("clients")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const clientsAsPrimaryContact = orgClients.filter(
    (c) => c.primaryContactId && String(c.primaryContactId) === String(mergedContactId),
  ).length;

  return {
    contactFileLinks,
    entityContactLinks,
    individualContactLinks: individual1 + individual2,
    contactLenderLinks,
    clientsAsPrimaryContact,
    projects: 0,
    pipelineFiles: 0,
    fileClients: 0,
    loanClients: 0,
  };
}

async function countEntityReparents(
  ctx: QueryCtx,
  mergedClientId: Id<"clients">,
): Promise<MergeReparentCounts> {
  const projects = (
    await ctx.db
      .query("projects")
      .withIndex("by_client", (q) => q.eq("clientId", mergedClientId))
      .collect()
  ).length;

  const pipelineFiles = (
    await ctx.db
      .query("pipeline")
      .withIndex("by_clientId", (q) => q.eq("clientId", mergedClientId))
      .collect()
  ).length;

  const fileClients = (
    await ctx.db
      .query("fileClients")
      .withIndex("by_entity", (q) => q.eq("clientId", mergedClientId))
      .collect()
  ).length;

  const loanClients = (
    await ctx.db
      .query("loanClients")
      .withIndex("by_client", (q) => q.eq("clientId", mergedClientId))
      .collect()
  ).length;

  const entityContactLinks = (
    await ctx.db
      .query("entityContactLinks")
      .withIndex("by_entity", (q) => q.eq("entityId", mergedClientId))
      .collect()
  ).length;

  return {
    contactFileLinks: 0,
    entityContactLinks,
    individualContactLinks: 0,
    contactLenderLinks: 0,
    clientsAsPrimaryContact: 0,
    projects,
    pipelineFiles,
    fileClients,
    loanClients,
  };
}

function resolutionMap(
  resolutions: Array<{ field: string; winner: "surviving" | "merged" }>,
): Map<string, "surviving" | "merged"> {
  return new Map(resolutions.map((r) => [r.field, r.winner]));
}

function pickField<T>(
  field: string,
  survivingValue: T,
  mergedValue: T,
  resolutions: Map<string, "surviving" | "merged">,
): T {
  const winner = resolutions.get(field);
  if (winner === "merged") return mergedValue;
  return survivingValue;
}

async function writeMergeAudit(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    operationType: Doc<"mergeAuditLogs">["operationType"];
    survivingRecordId: string;
    mergedRecordId: string;
    affectedRelations: AffectedRelation[];
    performedBy: string;
    startedAt: number;
  },
): Promise<Id<"mergeAuditLogs">> {
  return await ctx.db.insert("mergeAuditLogs", {
    organizationId: args.organizationId,
    operationType: args.operationType,
    survivingRecordId: args.survivingRecordId,
    mergedRecordId: args.mergedRecordId,
    affectedRelations: args.affectedRelations,
    performedBy: args.performedBy,
    createdAt: args.startedAt,
    completedAt: Date.now(),
  });
}

export const previewMerge = query({
  args: {
    organizationId: v.id("organizations"),
    recordKind: recordKindV,
    survivingRecordId: v.string(),
    mergedRecordId: v.string(),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "contacts.view",
    );

    if (args.recordKind === "contact") {
      const { surviving, merged } = await assertContactMergePair(
        ctx,
        args.organizationId,
        args.memberUserKey,
        args.survivingRecordId as Id<"contacts">,
        args.mergedRecordId as Id<"contacts">,
      );
      const reparentCounts = await countContactReparents(
        ctx,
        merged._id,
        args.organizationId,
      );
      return {
        recordKind: "contact" as const,
        surviving: {
          id: String(surviving._id),
          label: surviving.name?.trim() || "Contact",
        },
        merged: {
          id: String(merged._id),
          label: merged.name?.trim() || "Contact",
        },
        conflicts: buildContactConflicts(surviving, merged),
        reparentCounts,
      };
    }

    const { surviving, merged } = await assertEntityMergePair(
      ctx,
      args.organizationId,
      args.memberUserKey,
      args.survivingRecordId as Id<"clients">,
      args.mergedRecordId as Id<"clients">,
    );
    const reparentCounts = await countEntityReparents(ctx, merged._id);
    return {
      recordKind: "entity" as const,
      surviving: {
        id: String(surviving._id),
        label: surviving.displayName?.trim() || "Entity",
      },
      merged: {
        id: String(merged._id),
        label: merged.displayName?.trim() || "Entity",
      },
      conflicts: buildEntityConflicts(surviving, merged),
      reparentCounts,
    };
  },
});

export const mergeContacts = mutation({
  args: {
    organizationId: v.id("organizations"),
    survivingRecordId: v.id("contacts"),
    mergedRecordId: v.id("contacts"),
    fieldResolutions: fieldResolutionV,
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

    const { surviving, merged } = await assertContactMergePair(
      ctx,
      args.organizationId,
      args.memberUserKey,
      args.survivingRecordId,
      args.mergedRecordId,
    );
    await assertCanMutateContactRow(ctx, surviving, args.memberUserKey);
    await assertCanMutateContactRow(ctx, merged, args.memberUserKey);

    const startedAt = Date.now();
    const affected: AffectedRelation[] = [];
    const resolutions = resolutionMap(args.fieldResolutions);
    const now = Date.now();
    const ficoHistory = mergeFicoHistories(
      surviving.ficoHistory as FicoHistoryEntry[] | undefined,
      merged.ficoHistory as FicoHistoryEntry[] | undefined,
    );
    const ficoFromHistory = currentFicoFromHistory(ficoHistory);

    const patch: Partial<Doc<"contacts">> = {
      name: pickField("name", surviving.name, merged.name, resolutions),
      notes: pickField("notes", surviving.notes, merged.notes, resolutions),
      companyName: pickField(
        "companyName",
        surviving.companyName,
        merged.companyName,
        resolutions,
      ),
      fico:
        ficoFromHistory ??
        pickField("fico", surviving.fico, merged.fico, resolutions),
      ficoHistory,
      ssn: pickField("ssn", surviving.ssn, merged.ssn, resolutions),
      dob: pickField("dob", surviving.dob, merged.dob, resolutions),
      updatedAt: now,
    };

    const emailWinner = resolutions.get("primaryEmail");
    if (emailWinner === "merged") {
      patch.email = merged.email;
      if (merged.emails?.length) patch.emails = merged.emails;
    }
    const phoneWinner = resolutions.get("primaryPhone");
    if (phoneWinner === "merged") {
      patch.phone = merged.phone;
      if (merged.phones?.length) patch.phones = merged.phones;
    }

    await ctx.db.patch(surviving._id, patch);

    for (const link of await ctx.db
      .query("contactFileLinks")
      .withIndex("by_contact", (q) => q.eq("contactId", merged._id))
      .collect()) {
      const duplicate = await ctx.db
        .query("contactFileLinks")
        .withIndex("by_contact_file", (q) =>
          q.eq("contactId", surviving._id).eq("fileId", link.fileId),
        )
        .first();
      if (duplicate) {
        await ctx.db.delete(link._id);
        affected.push({
          table: "contactFileLinks",
          edgeId: String(link._id),
          detail: "deduped_existing_link",
        });
      } else {
        await ctx.db.patch(link._id, {
          contactId: surviving._id,
          updatedAt: now,
        });
        affected.push({
          table: "contactFileLinks",
          edgeId: String(link._id),
          detail: "reparented",
        });
      }
    }

    for (const link of await ctx.db
      .query("entityContactLinks")
      .withIndex("by_contact", (q) => q.eq("contactId", merged._id))
      .collect()) {
      const duplicate = await ctx.db
        .query("entityContactLinks")
        .withIndex("by_entity_contact", (q) =>
          q.eq("entityId", link.entityId).eq("contactId", surviving._id),
        )
        .first();
      if (duplicate) {
        await ctx.db.delete(link._id);
        affected.push({
          table: "entityContactLinks",
          edgeId: String(link._id),
          detail: "deduped_existing_link",
        });
      } else {
        await ctx.db.patch(link._id, {
          contactId: surviving._id,
          updatedAt: now,
        });
        affected.push({
          table: "entityContactLinks",
          edgeId: String(link._id),
          detail: "reparented",
        });
      }
    }

    for (const link of await ctx.db
      .query("individualContactLinks")
      .withIndex("by_contact1", (q) => q.eq("contactId1", merged._id))
      .collect()) {
      const newId1 = surviving._id;
      const newId2 = link.contactId2;
      if (String(newId1) === String(newId2)) {
        await ctx.db.delete(link._id);
        affected.push({
          table: "individualContactLinks",
          edgeId: String(link._id),
          detail: "removed_self_link",
        });
        continue;
      }
      const duplicate = await ctx.db
        .query("individualContactLinks")
        .withIndex("by_contact_pair", (q) =>
          q.eq("contactId1", newId1).eq("contactId2", newId2),
        )
        .first();
      if (duplicate) {
        await ctx.db.delete(link._id);
        affected.push({
          table: "individualContactLinks",
          edgeId: String(link._id),
          detail: "deduped_existing_link",
        });
      } else {
        await ctx.db.patch(link._id, {
          contactId1: newId1,
          updatedAt: now,
        });
        affected.push({
          table: "individualContactLinks",
          edgeId: String(link._id),
          detail: "reparented",
        });
      }
    }

    for (const link of await ctx.db
      .query("individualContactLinks")
      .withIndex("by_contact2", (q) => q.eq("contactId2", merged._id))
      .collect()) {
      if (String(link.contactId1) === String(merged._id)) continue;
      const newId2 = surviving._id;
      const duplicate = await ctx.db
        .query("individualContactLinks")
        .withIndex("by_contact_pair", (q) =>
          q.eq("contactId1", link.contactId1).eq("contactId2", newId2),
        )
        .first();
      if (duplicate) {
        await ctx.db.delete(link._id);
        affected.push({
          table: "individualContactLinks",
          edgeId: String(link._id),
          detail: "deduped_existing_link",
        });
      } else {
        await ctx.db.patch(link._id, {
          contactId2: newId2,
          updatedAt: now,
        });
        affected.push({
          table: "individualContactLinks",
          edgeId: String(link._id),
          detail: "reparented",
        });
      }
    }

    for (const link of await ctx.db
      .query("contactLenderLinks")
      .withIndex("by_contact", (q) => q.eq("contactId", merged._id))
      .collect()) {
      const duplicate = await ctx.db
        .query("contactLenderLinks")
        .withIndex("by_contact_lender", (q) =>
          q.eq("contactId", surviving._id).eq("lenderId", link.lenderId),
        )
        .first();
      if (duplicate) {
        await ctx.db.delete(link._id);
        affected.push({
          table: "contactLenderLinks",
          edgeId: String(link._id),
          detail: "deduped_existing_link",
        });
      } else {
        await ctx.db.patch(link._id, {
          contactId: surviving._id,
          updatedAt: now,
        });
        affected.push({
          table: "contactLenderLinks",
          edgeId: String(link._id),
          detail: "reparented",
        });
      }
    }

    for (const client of await ctx.db
      .query("clients")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect()) {
      if (
        client.primaryContactId &&
        String(client.primaryContactId) === String(merged._id)
      ) {
        await ctx.db.patch(client._id, {
          primaryContactId: surviving._id,
          primaryContactName:
            surviving.name?.trim() || client.primaryContactName,
          primaryContactEmail:
            primaryContactEmail(surviving) || client.primaryContactEmail,
          primaryContactPhone:
            primaryContactPhone(surviving) || client.primaryContactPhone,
          updatedAt: now,
        });
        affected.push({
          table: "clients",
          edgeId: String(client._id),
          detail: "primaryContactId_repointed",
        });
      }
    }

    for (const row of await ctx.db
      .query("contactActivity")
      .withIndex("by_contact_at", (q) => q.eq("contactId", merged._id))
      .collect()) {
      await ctx.db.patch(row._id, { contactId: surviving._id });
      affected.push({
        table: "contactActivity",
        edgeId: String(row._id),
        detail: "reparented",
      });
    }

    await refreshContactGlobalSearchText(ctx, surviving._id);
    await deleteContactGraph(ctx, merged._id);
    await ctx.db.delete(merged._id);
    affected.push({
      table: "contacts",
      edgeId: String(merged._id),
      detail: "deleted_merged_record",
    });

    const auditId = await writeMergeAudit(ctx, {
      organizationId: args.organizationId,
      operationType: "ContactMerge",
      survivingRecordId: String(surviving._id),
      mergedRecordId: String(merged._id),
      affectedRelations: affected,
      performedBy: args.memberUserKey,
      startedAt,
    });

    return { ok: true as const, survivingContactId: surviving._id, auditId };
  },
});

export const mergeEntities = mutation({
  args: {
    organizationId: v.id("organizations"),
    survivingRecordId: v.id("clients"),
    mergedRecordId: v.id("clients"),
    fieldResolutions: fieldResolutionV,
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

    const { surviving, merged } = await assertEntityMergePair(
      ctx,
      args.organizationId,
      args.memberUserKey,
      args.survivingRecordId,
      args.mergedRecordId,
    );

    const startedAt = Date.now();
    const affected: AffectedRelation[] = [];
    const resolutions = resolutionMap(args.fieldResolutions);
    const now = Date.now();

    const displayName = pickField(
      "displayName",
      surviving.displayName,
      merged.displayName,
      resolutions,
    );
    await ctx.db.patch(surviving._id, {
      displayName,
      normalizedName: normalizeHierarchyName(displayName),
      companyName: pickField(
        "companyName",
        surviving.companyName,
        merged.companyName,
        resolutions,
      ),
      ein: pickField("ein", surviving.ein, merged.ein, resolutions),
      entityType: pickField(
        "entityType",
        surviving.entityType,
        merged.entityType,
        resolutions,
      ),
      stateOfIncorporation: pickField(
        "stateOfIncorporation",
        surviving.stateOfIncorporation,
        merged.stateOfIncorporation,
        resolutions,
      ),
      dateOfFormation: pickField(
        "dateOfFormation",
        surviving.dateOfFormation,
        merged.dateOfFormation,
        resolutions,
      ),
      // Always union websites (deduped); ignore fieldResolutions for this array.
      websites: mergeEntityWebsites(surviving.websites, merged.websites),
      updatedAt: now,
    });

    for (const project of await ctx.db
      .query("projects")
      .withIndex("by_client", (q) => q.eq("clientId", merged._id))
      .collect()) {
      await ctx.db.patch(project._id, {
        clientId: surviving._id,
        updatedAt: now,
      });
      affected.push({
        table: "projects",
        edgeId: String(project._id),
        detail: "reparented",
      });
    }

    for (const file of await ctx.db
      .query("pipeline")
      .withIndex("by_clientId", (q) => q.eq("clientId", merged._id))
      .collect()) {
      await ctx.db.patch(file._id, { clientId: surviving._id, updatedAt: now });
      affected.push({
        table: "pipeline",
        edgeId: String(file._id),
        detail: "clientId_reparented",
      });
    }

    for (const edge of await ctx.db
      .query("fileClients")
      .withIndex("by_entity", (q) => q.eq("clientId", merged._id))
      .collect()) {
      const result = await upsertFileClientEdge(ctx, {
        organizationId: args.organizationId,
        fileId: edge.fileId,
        clientId: surviving._id,
        relationshipType: edge.relationshipType,
        sortOrder: edge.sortOrder,
        actor: args.memberUserKey,
      });
      await ctx.db.delete(edge._id);
      affected.push({
        table: "fileClients",
        edgeId: String(edge._id),
        detail: `reparented_${result}`,
      });
    }

    for (const edge of await ctx.db
      .query("loanClients")
      .withIndex("by_client", (q) => q.eq("clientId", merged._id))
      .collect()) {
      const existing = await ctx.db
        .query("loanClients")
        .withIndex("by_pipeline_client", (q) =>
          q.eq("pipelineId", edge.pipelineId).eq("clientId", surviving._id),
        )
        .first();
      if (existing) {
        await ctx.db.delete(edge._id);
        affected.push({
          table: "loanClients",
          edgeId: String(edge._id),
          detail: "deduped_existing_link",
        });
      } else {
        await ctx.db.patch(edge._id, {
          clientId: surviving._id,
          updatedAt: now,
        });
        affected.push({
          table: "loanClients",
          edgeId: String(edge._id),
          detail: "reparented",
        });
      }
    }

    for (const edge of await ctx.db
      .query("projectClients")
      .withIndex("by_client", (q) => q.eq("clientId", merged._id))
      .collect()) {
      const existing = await ctx.db
        .query("projectClients")
        .withIndex("by_project_client", (q) =>
          q.eq("projectId", edge.projectId).eq("clientId", surviving._id),
        )
        .first();
      if (existing) {
        await ctx.db.delete(edge._id);
        affected.push({
          table: "projectClients",
          edgeId: String(edge._id),
          detail: "deduped_existing_link",
        });
      } else {
        await ctx.db.patch(edge._id, {
          clientId: surviving._id,
          updatedAt: now,
        });
        affected.push({
          table: "projectClients",
          edgeId: String(edge._id),
          detail: "reparented",
        });
      }
    }

    for (const link of await ctx.db
      .query("entityContactLinks")
      .withIndex("by_entity", (q) => q.eq("entityId", merged._id))
      .collect()) {
      const duplicate = await ctx.db
        .query("entityContactLinks")
        .withIndex("by_entity_contact", (q) =>
          q.eq("entityId", surviving._id).eq("contactId", link.contactId),
        )
        .first();
      if (duplicate) {
        await ctx.db.delete(link._id);
        affected.push({
          table: "entityContactLinks",
          edgeId: String(link._id),
          detail: "deduped_existing_link",
        });
      } else {
        await ctx.db.patch(link._id, {
          entityId: surviving._id,
          updatedAt: now,
        });
        affected.push({
          table: "entityContactLinks",
          edgeId: String(link._id),
          detail: "reparented",
        });
      }
    }

    await deleteClientGraphEdges(ctx, merged._id);
    await ctx.db.delete(merged._id);
    affected.push({
      table: "clients",
      edgeId: String(merged._id),
      detail: "deleted_merged_record",
    });

    const auditId = await writeMergeAudit(ctx, {
      organizationId: args.organizationId,
      operationType: "ClientMerge",
      survivingRecordId: String(surviving._id),
      mergedRecordId: String(merged._id),
      affectedRelations: affected,
      performedBy: args.memberUserKey,
      startedAt,
    });

    return { ok: true as const, survivingClientId: surviving._id, auditId };
  },
});

export const convertContactToEntity = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    displayName: v.optional(v.string()),
    entityType: v.optional(
      v.union(
        v.literal("llc"),
        v.literal("s_corp"),
        v.literal("c_corp"),
        v.literal("partnership"),
        v.literal("sole_proprietorship"),
      ),
    ),
    ein: v.optional(v.string()),
    /** Gateway title at the new entity (default: Authorized Signer). */
    gatewayPosition: v.optional(v.string()),
    /** Canonical registry role for the source contact on the new entity. */
    gatewayRegistryRoleId: v.optional(registryRoleIdV),
    /**
     * When true (default), also mirror contact file links onto `fileClients`
     * edges for the new entity without removing contact-side links.
     */
    mirrorFileLinksToEntity: v.optional(v.boolean()),
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

    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.organizationId !== args.organizationId) {
      throw new Error("Contact not found.");
    }
    await assertCanMutateContactRow(ctx, contact, args.memberUserKey);

    const startedAt = Date.now();
    const affected: AffectedRelation[] = [];
    const now = Date.now();
    const displayName =
      args.displayName?.trim() || contact.name?.trim() || "Entity";
    const gatewayPosition =
      args.gatewayPosition?.trim() || CONVERSION_DEFAULT_GATEWAY_POSITION;
    const gatewayRegistryRoleId: RegistryRoleId =
      args.gatewayRegistryRoleId ?? CONVERSION_DEFAULT_GATEWAY_ROLE;
    const mirrorFiles = args.mirrorFileLinksToEntity !== false;

    const entityId = await ctx.db.insert("clients", {
      organizationId: args.organizationId,
      displayName,
      normalizedName: normalizeHierarchyName(displayName),
      companyName: displayName,
      primaryContactId: contact._id,
      primaryContactName: contact.name?.trim() || undefined,
      primaryContactEmail: primaryContactEmail(contact) || undefined,
      primaryContactPhone: primaryContactPhone(contact) || undefined,
      ...(args.entityType ? { entityType: args.entityType } : {}),
      ...(args.ein?.trim() ? { ein: args.ein.trim() } : {}),
      ...ownerFieldsForInsert(args.memberUserKey),
      createdAt: now,
      updatedAt: now,
    });
    affected.push({
      table: "clients",
      edgeId: String(entityId),
      detail: "created_from_contact",
    });

    const linkId = await upsertEntityContactLink(ctx, {
      organizationId: args.organizationId,
      entityId,
      contactId: contact._id,
      position: gatewayPosition,
      registryRoleId: gatewayRegistryRoleId,
      sortOrder: 0,
    });
    affected.push({
      table: "entityContactLinks",
      edgeId: String(linkId),
      detail: "gateway_contact_linked",
    });

    const existingRoleIds = contact.contactRoleIds ?? [];
    const nextRoleIds = mergeContactRoleIds(existingRoleIds, [
      gatewayRegistryRoleId,
    ]);
    await ctx.db.patch(contact._id, {
      contactRoleIds: nextRoleIds,
      contactRoleId: primaryContactRoleIdFromDoc({ contactRoleIds: nextRoleIds }),
      updatedAt: now,
    });
    affected.push({
      table: "contacts",
      edgeId: String(contact._id),
      detail: "preserved_and_roles_updated",
    });

    if (mirrorFiles) {
      for (const link of await ctx.db
        .query("contactFileLinks")
        .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
        .collect()) {
        const file = await ctx.db.get(link.fileId);
        if (!file?.organizationId) continue;
        const relationshipType = fileLinkRelationshipType(link);
        await upsertFileClientEdge(ctx, {
          organizationId: file.organizationId,
          fileId: link.fileId,
          clientId: entityId,
          relationshipType,
          sortOrder: 0,
          actor: args.memberUserKey,
        });
        // Never overwrite an existing primary FK — only set when unset.
        if (file.clientId == null) {
          await ctx.db.patch(file._id, {
            clientId: entityId,
            updatedAt: now,
          });
          affected.push({
            table: "pipeline",
            edgeId: String(file._id),
            detail: "clientId_set_on_conversion",
          });
        }
        affected.push({
          table: "fileClients",
          edgeId: String(link.fileId),
          detail: "mirrored_from_contact_file_link",
        });
      }
    }

    await refreshContactGlobalSearchText(ctx, contact._id);

    const auditId = await writeMergeAudit(ctx, {
      organizationId: args.organizationId,
      operationType: "EntityConversion",
      survivingRecordId: String(entityId),
      mergedRecordId: String(contact._id),
      affectedRelations: affected,
      performedBy: args.memberUserKey,
      startedAt,
    });

    return {
      ok: true as const,
      entityId,
      contactId: contact._id,
      entityContactLinkId: linkId,
      auditId,
    };
  },
});
