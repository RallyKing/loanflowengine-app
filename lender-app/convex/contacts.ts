import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanMutateContactRow,
  assertCanReadContactRow,
  assertOrgPermission,
  assertOrgScopeArgs,
} from "./organizationAccess";
import {
  normalizeCompanyKey,
  normalizeEmailKey,
} from "../lib/crmRelationship";
import {
  coalesceContactRoleIdsFromArgs,
  DEFAULT_CONTACT_ROLE_IDS,
  effectiveContactRoleIdsFromDoc,
  effectiveContactRoleIdFromDoc,
  isValidContactRoleId,
  legacyRelationshipTypeToRoleId,
  primaryContactRoleIdFromDoc,
} from "../lib/contact/contactRoles";
import { readContactRolesForOrg } from "./organizationSettings";
import { appendContactCrudFeed } from "./activityFeed";
import { removeAllLibraryLinksForContact } from "./libraryDocumentsCleanup";
import { refreshContactGlobalSearchText } from "./globalSearchSync";
import { propagateContactIdentityToLinkedFiles } from "./pipelineContacts";
import {
  contactEmailsArgV,
  contactPhonesArgV,
} from "./contactMethodsShared";
import {
  allContactEmailStrings,
  contactMethodsToConvexFields,
  normalizeContactMethods,
} from "../lib/contact/contactMethods";
import {
  batchPrimaryEntitiesForContacts,
  resolvePrimaryEntityForContact,
  type PrimaryEntitySummary,
} from "./contactPrimaryEntity";
import {
  applyFicoScore,
  parseFicoScore,
  type FicoHistoryEntry,
} from "../lib/contacts/ficoHistory";

export type ContactHubRecord = Doc<"contacts"> & {
  primaryEntity: PrimaryEntitySummary | null;
};

const contactPiiArgV = {
  fico: v.optional(v.number()),
  /** When set with `fico`, timestamps the new pull (ms). Defaults to now. */
  ficoRecordedAt: v.optional(v.number()),
  ficoNote: v.optional(v.string()),
  ssn: v.optional(v.string()),
  dob: v.optional(v.string()),
};

const ficoHistoryValidator = v.array(
  v.object({
    id: v.string(),
    score: v.number(),
    recordedAt: v.number(),
    note: v.optional(v.string()),
  }),
);

function contactPiiPatchFromArgs(
  args: {
    fico?: number;
    ficoRecordedAt?: number;
    ficoNote?: string;
    ssn?: string;
    dob?: string;
  },
  row?: Pick<Doc<"contacts">, "fico" | "ficoHistory" | "createdAt" | "updatedAt">,
  now: number = Date.now(),
): Partial<Pick<Doc<"contacts">, "fico" | "ficoHistory" | "ssn" | "dob">> {
  const patch: Partial<
    Pick<Doc<"contacts">, "fico" | "ficoHistory" | "ssn" | "dob">
  > = {};
  if (args.fico !== undefined) {
    const next = parseFicoScore(args.fico);
    if (next == null) {
      throw new Error("FICO must be a whole number between 300 and 850.");
    }
    const sameAsCurrent = row != null && parseFicoScore(row.fico) === next;
    const explicitPull =
      args.ficoRecordedAt !== undefined ||
      Boolean(args.ficoNote?.trim());
    if (!sameAsCurrent || explicitPull || row == null) {
      const applied = applyFicoScore({
        fico: row?.fico,
        history: row?.ficoHistory as FicoHistoryEntry[] | undefined,
        nextScore: next,
        recordedAt: args.ficoRecordedAt ?? now,
        note: args.ficoNote,
        now,
        fallbackRecordedAt: row?.updatedAt ?? row?.createdAt ?? now,
      });
      patch.fico = applied.fico;
      patch.ficoHistory = applied.ficoHistory;
    }
  }
  if (args.ssn !== undefined) {
    const ssn = args.ssn.trim();
    patch.ssn = ssn || undefined;
  }
  if (args.dob !== undefined) {
    const dob = args.dob.trim();
    patch.dob = dob || undefined;
  }
  return patch;
}

async function resolveContactRoleIdForOrg(
  ctx: QueryCtx,
  organizationId: Id<"organizations"> | undefined,
  contactRoleId: string | undefined,
): Promise<string> {
  const roleId = contactRoleId?.trim();
  if (!organizationId) {
    return roleId && roleId.length > 0
      ? roleId
      : DEFAULT_CONTACT_ROLE_IDS.client;
  }
  const roles = await readContactRolesForOrg(ctx, organizationId);
  if (roleId && isValidContactRoleId(roles, roleId)) return roleId;
  return DEFAULT_CONTACT_ROLE_IDS.client;
}

async function resolveContactRoleIdsForOrg(
  ctx: QueryCtx,
  organizationId: Id<"organizations"> | undefined,
  contactRoleIds: string[] | undefined,
  fallbackSingle?: string | undefined,
): Promise<string[]> {
  const coalesced = coalesceContactRoleIdsFromArgs({
    contactRoleIds,
    contactRoleId: fallbackSingle,
  });
  const raw =
    coalesced.length > 0 ? coalesced : [DEFAULT_CONTACT_ROLE_IDS.client];
  const out: string[] = [];
  for (const id of raw) {
    const resolved = await resolveContactRoleIdForOrg(
      ctx,
      organizationId,
      id,
    );
    if (!out.includes(resolved)) out.push(resolved);
  }
  return out.length > 0 ? out : [DEFAULT_CONTACT_ROLE_IDS.client];
}

type LegacyContactFields = {
  labels?: string[];
  crmRelationshipTypes?: string[];
};

function effectiveLinkContactRoleId(link: {
  contactRoleId?: string;
  relationshipType?: string;
}): string | undefined {
  const trimmed = link.contactRoleId?.trim();
  if (trimmed) return trimmed;
  return legacyRelationshipTypeToRoleId(link.relationshipType);
}

/** Normalize contact rows for clients — always expose multi-role + legacy primary. */
export function normalizeContactForClient(
  row: Doc<"contacts"> & LegacyContactFields,
): Doc<"contacts"> {
  const bridged = coalesceContactRoleIdsFromArgs({
    contactRoleIds: row.contactRoleIds,
    contactRoleId: row.contactRoleId,
  });
  const contactRoleIds =
    bridged.length > 0 ? bridged : effectiveContactRoleIdsFromDoc(row);
  return {
    ...row,
    contactRoleIds,
    contactRoleId: primaryContactRoleIdFromDoc({ contactRoleIds }),
  };
}

async function enrichContactRow(
  ctx: QueryCtx,
  row: Doc<"contacts"> & LegacyContactFields,
  primaryMap?: Map<Id<"contacts">, PrimaryEntitySummary>,
): Promise<ContactHubRecord> {
  const normalized = normalizeContactForClient(row);
  const primary =
    primaryMap?.get(row._id) ??
    (await resolvePrimaryEntityForContact(ctx, row._id));
  return {
    ...normalized,
    primaryEntity: primary,
  };
}

async function contactMatchesRoleFilter(
  ctx: QueryCtx,
  contact: Doc<"contacts"> & LegacyContactFields,
  roleId: string,
  strictCanonicalRole?: boolean,
): Promise<boolean> {
  if (strictCanonicalRole) {
    const stored = contact.contactRoleIds ?? [];
    if (stored.includes(roleId)) return true;
    return contact.contactRoleId?.trim() === roleId;
  }
  if (effectiveContactRoleIdsFromDoc(contact).includes(roleId)) return true;
  const fileLinks = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
    .collect();
  if (
    fileLinks.some((l) => effectiveLinkContactRoleId(l) === roleId)
  ) {
    return true;
  }
  const lenderLinks = await ctx.db
    .query("contactLenderLinks")
    .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
    .collect();
  return lenderLinks.some((l) => effectiveLinkContactRoleId(l) === roleId);
}

async function assertNoDuplicateEmailsInOrg(
  ctx: MutationCtx,
  organizationId: Id<"organizations"> | undefined,
  emailKeys: readonly string[],
  excludeContactId?: Id<"contacts">,
): Promise<void> {
  if (!organizationId) return;
  const seen = new Set<string>();
  const orgRows = await ctx.db
    .query("contacts")
    .withIndex("by_organization_updatedAt", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();

  for (const raw of emailKeys) {
    const key = normalizeEmailKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const dupIndex = await ctx.db
      .query("contacts")
      .withIndex("by_organization_emailKey", (q) =>
        q.eq("organizationId", organizationId).eq("emailKey", key),
      )
      .first();
    if (dupIndex && dupIndex._id !== excludeContactId) {
      throw new Error(
        "A contact with this email already exists in this organization.",
      );
    }

    for (const other of orgRows) {
      if (other._id === excludeContactId) continue;
      if (allContactEmailStrings(other).includes(key)) {
        throw new Error(
          "A contact with this email already exists in this organization.",
        );
      }
    }
  }
}

function resolveMethodsFromArgs(args: {
  email?: string;
  phone?: string;
  emails?: import("../lib/contact/contactMethods").ContactEmailEntry[];
  phones?: import("../lib/contact/contactMethods").ContactPhoneEntry[];
  /** Arrays were explicitly provided (including empty clear). */
  emailsExplicit?: boolean;
  phonesExplicit?: boolean;
  /** Scalar email/phone were explicitly provided. */
  emailExplicit?: boolean;
  phoneExplicit?: boolean;
}) {
  const emailsExplicit = args.emailsExplicit === true;
  const phonesExplicit = args.phonesExplicit === true;
  const emailExplicit = args.emailExplicit === true;
  const phoneExplicit = args.phoneExplicit === true;
  return normalizeContactMethods(
    {
      // When arrays are explicit, do not resurrect methods from stale scalars.
      legacyEmail: emailExplicit
        ? args.email
        : emailsExplicit
          ? ""
          : args.email,
      legacyPhone: phoneExplicit
        ? args.phone
        : phonesExplicit
          ? ""
          : args.phone,
      emails: args.emails,
      phones: args.phones,
      legacyIsExplicitScalar:
        (emailExplicit && !emailsExplicit) || (phoneExplicit && !phonesExplicit),
    },
    (e) => normalizeEmailKey(e),
  );
}

export async function deleteContactGraph(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
): Promise<void> {
  for (const l of await ctx.db
    .query("contactFileLinks")
    .withIndex("by_contact", (q) => q.eq("contactId", contactId))
    .collect()) {
    await ctx.db.delete(l._id);
  }
  for (const l of await ctx.db
    .query("contactLenderLinks")
    .withIndex("by_contact", (q) => q.eq("contactId", contactId))
    .collect()) {
    await ctx.db.delete(l._id);
  }
  for (const a of await ctx.db
    .query("contactActivity")
    .withIndex("by_contact_at", (q) => q.eq("contactId", contactId))
    .collect()) {
    await ctx.db.delete(a._id);
  }
  for (const l of await ctx.db
    .query("entityContactLinks")
    .withIndex("by_contact", (q) => q.eq("contactId", contactId))
    .collect()) {
    await ctx.db.delete(l._id);
  }
  for (const l of await ctx.db
    .query("individualContactLinks")
    .withIndex("by_contact1", (q) => q.eq("contactId1", contactId))
    .collect()) {
    await ctx.db.delete(l._id);
  }
  for (const l of await ctx.db
    .query("individualContactLinks")
    .withIndex("by_contact2", (q) => q.eq("contactId2", contactId))
    .collect()) {
    await ctx.db.delete(l._id);
  }
  await removeAllLibraryLinksForContact(ctx, contactId);
}

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    contactRoleIdFilter: v.optional(v.string()),
    /** When true with `contactRoleIdFilter`, match stored `contacts.contactRoleId` only (no legacy/link inference). */
    strictCanonicalRoleMatch: v.optional(v.boolean()),
    /** Optional cap for peek/pagination callers (default: no limit). */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const {
      organizationId,
      memberUserKey,
      contactRoleIdFilter,
      strictCanonicalRoleMatch,
      limit,
    } = args;
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    await assertOrgPermission(
      ctx,
      organizationId,
      memberUserKey,
      "contacts.view",
    );
    // Org-scoped list — global admin still reads within the active org (avoids full-table scan).
    const rowCap =
      limit != null && Number.isFinite(limit) && limit > 0
        ? Math.min(Math.floor(limit), 5000)
        : undefined;
    const contactQuery = ctx.db
      .query("contacts")
      .withIndex("by_organization_updatedAt", (q) =>
        q.eq("organizationId", organizationId),
      )
      .order("desc");
    let rows =
      rowCap != null
        ? await contactQuery.take(rowCap)
        : await contactQuery.collect();

    const roleFilter = contactRoleIdFilter?.trim();
    if (roleFilter) {
      const matched: typeof rows = [];
      for (const r of rows) {
        if (
          await contactMatchesRoleFilter(
            ctx,
            r,
            roleFilter,
            strictCanonicalRoleMatch,
          )
        ) {
          matched.push(r);
        }
      }
      rows = matched;
    }
    const primaryMap = await batchPrimaryEntitiesForContacts(
      ctx,
      organizationId,
      rows.map((r) => r._id),
    );
    return Promise.all(
      rows.map((row) =>
        enrichContactRow(
          ctx,
          row as Doc<"contacts"> & LegacyContactFields,
          primaryMap,
        ),
      ),
    );
  },
});

export const get = query({
  args: {
    id: v.id("contacts"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) return null;
    await assertCanReadContactRow(ctx, row, memberUserKey);
    return enrichContactRow(ctx, row as Doc<"contacts"> & LegacyContactFields);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    emails: contactEmailsArgV,
    phones: contactPhonesArgV,
    notes: v.optional(v.string()),
    contactRoleId: v.optional(v.string()),
    contactRoleIds: v.optional(v.array(v.string())),
    /** @deprecated Phase CRM-4 — use entityContactLinks via setIndividualPrimaryCompany. */
    companyName: v.optional(v.string()),
    ...contactPiiArgV,
    organizationId: v.optional(v.id("organizations")),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Name is required");
    if (args.organizationId) {
      await assertOrgPermission(
        ctx,
        args.organizationId,
        args.memberUserKey,
        "contacts.manage",
      );
    }
    const methods = resolveMethodsFromArgs(args);
    await assertNoDuplicateEmailsInOrg(
      ctx,
      args.organizationId,
      allContactEmailStrings({
        email: methods.email,
        emails: methods.emails,
      }),
      undefined,
    );

    const now = Date.now();
    const roleArgs = coalesceContactRoleIdsFromArgs({
      contactRoleIds: args.contactRoleIds,
      contactRoleId: args.contactRoleId,
    });
    const contactRoleIds = await resolveContactRoleIdsForOrg(
      ctx,
      args.organizationId,
      roleArgs.length > 0 ? roleArgs : undefined,
      args.contactRoleId,
    );
    const contactRoleId = primaryContactRoleIdFromDoc({ contactRoleIds });
    const methodFields = contactMethodsToConvexFields(methods);

    const id = await ctx.db.insert("contacts", {
      name,
      ...methodFields,
      notes: (args.notes ?? "").trim(),
      contactRoleIds,
      contactRoleId,
      ...contactPiiPatchFromArgs(args, undefined, now),
      organizationId: args.organizationId,
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.get(id);
    if (created) {
      await refreshContactGlobalSearchText(ctx, id);
      await appendContactCrudFeed(
        ctx,
        created,
        "contact_created",
        `Created contact “${created.name.trim() || "Contact"}”`,
        args.memberUserKey?.trim(),
      );
    }
    return id;
  },
});

export async function insertDemoWorkspaceContact(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    demoBundleId: string;
    name: string;
    email: string;
    phone: string;
    notes: string;
    companyName?: string;
    contactRoleId?: string;
  },
): Promise<Id<"contacts">> {
  await assertOrgPermission(
    ctx,
    args.organizationId,
    args.memberUserKey,
    "contacts.manage",
  );
  const methods = resolveMethodsFromArgs({
    email: args.email,
    phone: args.phone,
  });
  await assertNoDuplicateEmailsInOrg(
    ctx,
    args.organizationId,
    allContactEmailStrings({
      email: methods.email,
      emails: methods.emails,
    }),
    undefined,
  );
  const now = Date.now();
  const contactRoleIds = await resolveContactRoleIdsForOrg(
    ctx,
    args.organizationId,
    undefined,
    args.contactRoleId,
  );
  const contactRoleId = primaryContactRoleIdFromDoc({ contactRoleIds });
  const companyName = (args.companyName ?? "").trim();
  const companyKey = normalizeCompanyKey(companyName);
  const methodFields = contactMethodsToConvexFields(methods);
  const id = await ctx.db.insert("contacts", {
    name: args.name.trim(),
    ...methodFields,
    notes: (args.notes ?? "").trim(),
    contactRoleIds,
    contactRoleId,
    companyName: companyName || undefined,
    companyKey: companyKey ?? undefined,
    organizationId: args.organizationId,
    demoBundleId: args.demoBundleId,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(id);
  if (created) {
    await refreshContactGlobalSearchText(ctx, id);
    await appendContactCrudFeed(
      ctx,
      created,
      "contact_created",
      `Created contact “${created.name.trim() || "Contact"}”`,
      args.memberUserKey?.trim(),
    );
  }
  return id;
}

export const update = mutation({
  args: {
    id: v.id("contacts"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    emails: contactEmailsArgV,
    phones: contactPhonesArgV,
    notes: v.optional(v.string()),
    crmTags: v.optional(v.array(v.string())),
    contactRoleId: v.optional(v.string()),
    contactRoleIds: v.optional(v.array(v.string())),
    /** Org portal default template ids (at most one per portal type). */
    portalDefaultIds: v.optional(v.array(v.id("portalDefaults"))),
    /** @deprecated Phase CRM-4 — use entityContactLinks via setIndividualPrimaryCompany. */
    companyName: v.optional(v.string()),
    ...contactPiiArgV,
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { id, memberUserKey, ...rest }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Contact not found");
    await assertCanMutateContactRow(ctx, row, memberUserKey);
    if (rest.name !== undefined && !rest.name.trim()) {
      throw new Error("Name is required");
    }
    const now = Date.now();

    const methodsTouched =
      rest.email !== undefined ||
      rest.phone !== undefined ||
      rest.emails !== undefined ||
      rest.phones !== undefined;

    let methodPatch: ReturnType<typeof contactMethodsToConvexFields> | undefined;
    if (methodsTouched) {
      const emailsExplicit = rest.emails !== undefined;
      const phonesExplicit = rest.phones !== undefined;
      const emailExplicit = rest.email !== undefined;
      const phoneExplicit = rest.phone !== undefined;
      const methods = resolveMethodsFromArgs({
        email: emailExplicit ? rest.email : row.email,
        phone: phoneExplicit ? rest.phone : row.phone,
        emails: emailsExplicit ? rest.emails : row.emails,
        phones: phonesExplicit ? rest.phones : row.phones,
        emailsExplicit,
        phonesExplicit,
        emailExplicit,
        phoneExplicit,
      });
      await assertNoDuplicateEmailsInOrg(
        ctx,
        row.organizationId,
        allContactEmailStrings({
          email: methods.email,
          emails: methods.emails,
        }),
        id,
      );
      methodPatch = contactMethodsToConvexFields(methods);
    }

    let rolePatch:
      | { contactRoleIds: string[]; contactRoleId: string }
      | undefined;
    if (
      rest.contactRoleIds !== undefined ||
      rest.contactRoleId !== undefined
    ) {
      const roleArgs = coalesceContactRoleIdsFromArgs({
        contactRoleIds: rest.contactRoleIds,
        contactRoleId: rest.contactRoleId,
      });
      const contactRoleIds = await resolveContactRoleIdsForOrg(
        ctx,
        row.organizationId,
        roleArgs.length > 0 ? roleArgs : undefined,
        rest.contactRoleId,
      );
      rolePatch = {
        contactRoleIds,
        contactRoleId: primaryContactRoleIdFromDoc({ contactRoleIds }),
      };
    }

    let portalDefaultIdsPatch:
      | { portalDefaultIds: Id<"portalDefaults">[] | undefined }
      | undefined;
    if (rest.portalDefaultIds !== undefined) {
      const { sanitizePortalDefaultIdsForOrg } = await import("./portalDefaults");
      const sanitized = await sanitizePortalDefaultIdsForOrg(
        ctx,
        row.organizationId,
        rest.portalDefaultIds,
      );
      portalDefaultIdsPatch = { portalDefaultIds: sanitized };
    }

    await ctx.db.patch(id, {
      ...(rest.name !== undefined ? { name: rest.name.trim() } : {}),
      ...(methodPatch ?? {}),
      ...(rest.notes !== undefined ? { notes: rest.notes.trim() } : {}),
      ...(rest.crmTags !== undefined
        ? {
            crmTags: rest.crmTags
              .map((t) => t.trim())
              .filter(Boolean),
          }
        : {}),
      ...(rolePatch ?? {}),
      ...(portalDefaultIdsPatch ?? {}),
      ...contactPiiPatchFromArgs(rest, row, now),
      updatedAt: now,
    });
    await refreshContactGlobalSearchText(ctx, id);
    const updatedRow = await ctx.db.get(id);
    if (updatedRow) {
      await appendContactCrudFeed(
        ctx,
        updatedRow,
        "contact_updated",
        `Updated contact “${updatedRow.name.trim() || "Contact"}”`,
        memberUserKey?.trim(),
      );
      // Bidirectional sync: identity edits on the master record refresh the
      // borrower snapshots on every linked pipeline file.
      const identityTouched =
        rest.name !== undefined ||
        methodsTouched ||
        Object.keys(contactPiiPatchFromArgs(rest, row, now)).length > 0;
      if (identityTouched) {
        await propagateContactIdentityToLinkedFiles(ctx, updatedRow);
      }
    }
  },
});

export const remove = mutation({
  args: {
    id: v.id("contacts"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Contact not found");
    await assertCanMutateContactRow(ctx, row, memberUserKey);
    await appendContactCrudFeed(
      ctx,
      row,
      "contact_deleted",
      `Deleted contact “${row.name.trim() || "Contact"}”`,
      memberUserKey?.trim(),
    );
    await deleteContactGraph(ctx, id);
    await ctx.db.delete(id);
  },
});

export const recordFicoScore = mutation({
  args: {
    id: v.id("contacts"),
    score: v.number(),
    recordedAt: v.optional(v.number()),
    note: v.optional(v.string()),
    memberUserKey: v.optional(v.string()),
  },
  returns: v.object({
    fico: v.number(),
    ficoHistory: ficoHistoryValidator,
  }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Contact not found");
    await assertCanMutateContactRow(ctx, row, args.memberUserKey);
    const now = Date.now();
    const applied = applyFicoScore({
      fico: row.fico,
      history: row.ficoHistory as FicoHistoryEntry[] | undefined,
      nextScore: args.score,
      recordedAt: args.recordedAt ?? now,
      note: args.note,
      now,
      fallbackRecordedAt: row.updatedAt ?? row.createdAt ?? now,
    });
    await ctx.db.patch(args.id, {
      fico: applied.fico,
      ficoHistory: applied.ficoHistory,
      updatedAt: now,
    });
    const updatedRow = await ctx.db.get(args.id);
    if (updatedRow) {
      await appendContactCrudFeed(
        ctx,
        updatedRow,
        "contact_updated",
        `Updated FICO for “${updatedRow.name.trim() || "Contact"}” to ${applied.fico}`,
        args.memberUserKey?.trim(),
      );
      await propagateContactIdentityToLinkedFiles(ctx, updatedRow);
    }
    return applied;
  },
});
