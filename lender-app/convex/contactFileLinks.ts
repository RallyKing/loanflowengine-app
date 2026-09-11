import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { clampActivitySummary } from "../lib/pipelineFileActivityModel";
import { stableValueKey, undoJsonPairWithinLimit } from "../lib/pipelineFileUndo";
import { appendPipelineFileActivity } from "./pipelineFileActivity";
import { runPipelineBlockAutomations } from "./pipelineBlockAutomationRunner";
import {
  assertCanMutateContactFileLink,
  assertCanReadContactRow,
  assertCanReadPipelineRow,
  assertOrgScopeArgs,
} from "./organizationAccess";
import { insertContactActivity } from "./contactActivity";
import {
  isReferralContactFileLink,
  removeFileReferralEdge,
  syncFileReferralEdgeFromContactLink,
} from "./indexedGraphEdgeSync";

import {
  DEFAULT_CONTACT_ROLE_IDS,
  effectiveContactRoleIdFromDoc,
} from "../lib/contact/contactRoles";
import { appendMasterContactRoleId } from "./lib/contactRoleMasterSync";
import { syncFileClientTitleFromPrimaryParties } from "./pipelineClientTitleSync";

function normalizeRole(role: string): string {
  return role.trim().replace(/\s+/g, " ");
}

function normalizeNotes(notes: string | undefined): string | undefined {
  const t = notes?.trim();
  return t ? t : undefined;
}

export const listByContact = query({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { contactId, memberUserKey }) => {
    const c = await ctx.db.get(contactId);
    if (c) await assertCanReadContactRow(ctx, c, memberUserKey);
    return await ctx.db
      .query("contactFileLinks")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .order("desc")
      .collect();
  },
});

/** Contact links hydrated with file rows for fast contact-detail rendering. */
export const listByContactWithFiles = query({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { contactId, memberUserKey }) => {
    const c = await ctx.db.get(contactId);
    if (c) await assertCanReadContactRow(ctx, c, memberUserKey);
    const links = await ctx.db
      .query("contactFileLinks")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .order("desc")
      .collect();
    const out: Array<{ link: (typeof links)[number]; file: Doc<"pipeline"> | null }> =
      [];
    for (const link of links) {
      const file = await ctx.db.get(link.fileId);
      out.push({ link, file });
    }
    return out;
  },
});

/**
 * Contact↔file links for one pipeline file.
 * Always returns a **discriminated union** so clients can surface `ACCESS_DENIED`
 * and integrity warnings instead of a generic Convex “Server Error”.
 */
export const listByFile = query({
  args: {
    fileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { fileId, memberUserKey }) => {
    const fileIdStr = String(fileId);
    const file = await ctx.db.get(fileId);

    if (file) {
      try {
        await assertCanReadPipelineRow(ctx, file, memberUserKey);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[contactFileLinks.listByFile] access denied", {
          fileId: fileIdStr,
          organizationId: file.organizationId ?? null,
          message,
        });
        return {
          ok: false as const,
          code: "ACCESS_DENIED" as const,
          message,
          details: {
            fileId: fileIdStr,
            organizationId: file.organizationId ?? null,
            step: "assertCanReadPipelineRow",
          },
        };
      }
    }

    const links = await ctx.db
      .query("contactFileLinks")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .order("desc")
      .collect();

    const warnings: Array<{
      linkId: string;
      code: string;
      contactId?: string;
      fileId?: string;
    }> = [];

    for (const link of links) {
      const codes: string[] = [];
      const contact = await ctx.db.get(link.contactId);
      const rowFile = await ctx.db.get(link.fileId);
      if (!contact) codes.push("MISSING_CONTACT");
      if (!rowFile) {
        codes.push("MISSING_PIPELINE_FILE");
      } else if (
        contact &&
        contact.organizationId &&
        rowFile.organizationId &&
        contact.organizationId !== rowFile.organizationId
      ) {
        codes.push("ORG_MISMATCH");
      }
      if (codes.length) {
        warnings.push({
          linkId: String(link._id),
          code: codes.join(","),
          contactId: String(link.contactId),
          fileId: String(link.fileId),
        });
      }
    }

    if (warnings.length) {
      console.warn("[contactFileLinks.listByFile] integrity warnings", {
        fileId: fileIdStr,
        count: warnings.length,
        sample: warnings.slice(0, 12),
      });
    }

    return {
      ok: true as const,
      links,
      meta: {
        fileId: fileIdStr,
        fileResolved: Boolean(file),
        fileOrganizationId: file?.organizationId ?? null,
        linkCount: links.length,
        warningCount: warnings.length,
      },
      warnings: warnings.length ? warnings : undefined,
    };
  },
});

/** Phase 39.5 — CRM contacts linked to a pipeline file (for vault import/save modals). */
export const listLinkedContactsForFile = query({
  args: {
    fileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { fileId, memberUserKey }) => {
    const file = await ctx.db.get(fileId);
    if (!file) return [];
    await assertCanReadPipelineRow(ctx, file, memberUserKey);
    const links = await ctx.db
      .query("contactFileLinks")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .order("desc")
      .collect();
    const seen = new Set<string>();
    const out: Array<{
      contactId: Id<"contacts">;
      name: string;
      role: string;
    }> = [];
    for (const link of links) {
      const key = String(link.contactId);
      if (seen.has(key)) continue;
      seen.add(key);
      const contact = await ctx.db.get(link.contactId);
      if (!contact) continue;
      out.push({
        contactId: contact._id,
        name: contact.name.trim() || "Contact",
        role: link.role,
      });
    }
    return out.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  },
});

/**
 * One lowercased text blob per contact: linked pipeline file names, link roles,
 * and link notes — for client-side Contacts search (many contact↔file links).
 */
export const linkSearchTextByContact = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    const links = await ctx.db.query("contactFileLinks").collect();
    if (!links.length) return [] as Array<{ contactId: Id<"contacts">; text: string }>;

    const fileIds = [...new Set(links.map((l) => l.fileId))];
    const files = await Promise.all(fileIds.map((id) => ctx.db.get(id)));
    const fileById = new Map<Id<"pipeline">, Doc<"pipeline"> | null>();
    for (let i = 0; i < fileIds.length; i++) {
      fileById.set(fileIds[i], files[i]);
    }

    const contactIds = [...new Set(links.map((l) => l.contactId))];
    const contactRows = await Promise.all(
      contactIds.map((id) => ctx.db.get(id)),
    );
    const contactById = new Map<Id<"contacts">, Doc<"contacts"> | null>();
    for (let i = 0; i < contactIds.length; i++) {
      contactById.set(contactIds[i], contactRows[i]);
    }

    const chunksByContact = new Map<Id<"contacts">, string[]>();
    for (const link of links) {
      const file = fileById.get(link.fileId);
      const contactRow = contactById.get(link.contactId);
      if (
        !file ||
        file.organizationId !== organizationId ||
        !contactRow ||
        contactRow.organizationId !== organizationId
      ) {
        continue;
      }
      const parts = [
        file?.fileName,
        link.role,
        link.contactRoleId,
        link.notes,
        contactRow?.companyName,
      ]
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean);
      if (!parts.length) continue;
      const chunk = parts.join(" ").toLowerCase();
      const arr = chunksByContact.get(link.contactId) ?? [];
      arr.push(chunk);
      chunksByContact.set(link.contactId, arr);
    }

    return [...chunksByContact.entries()].map(([contactId, parts]) => ({
      contactId,
      text: parts.join(" "),
    }));
  },
});

export const getByContactAndFile = query({
  args: { contactId: v.id("contacts"), fileId: v.id("pipeline") },
  handler: async (ctx, { contactId, fileId }) => {
    return await ctx.db
      .query("contactFileLinks")
      .withIndex("by_contact_file", (q) =>
        q.eq("contactId", contactId).eq("fileId", fileId)
      )
      .first();
  },
});

/**
 * Create or update a single contact↔file link.
 * Enforces one row per pair via `by_contact_file` lookups.
 */
export const upsert = mutation({
  args: {
    contactId: v.id("contacts"),
    fileId: v.id("pipeline"),
    role: v.string(),
    notes: v.optional(v.string()),
    contactRoleId: v.optional(v.string()),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { contactId, fileId, role, notes, contactRoleId, memberUserKey } =
      args;
    const roleNorm = normalizeRole(role);
    if (!roleNorm) throw new Error("Role is required");

    const [contact, file] = await Promise.all([
      ctx.db.get(contactId),
      ctx.db.get(fileId),
    ]);
    if (!contact) {
      throw new Error(
        `contactFileLinks.upsert: Contact not found (contactId=${String(contactId)}).`,
      );
    }
    if (!file) {
      throw new Error(
        `contactFileLinks.upsert: Pipeline file not found (fileId=${String(fileId)}).`,
      );
    }
    await assertCanMutateContactFileLink(ctx, contact, file, memberUserKey);

    const now = Date.now();
    const actor = memberUserKey?.trim();
    const explicitRoleId = contactRoleId?.trim();
    let masterContact = contact;
    if (explicitRoleId) {
      masterContact = await appendMasterContactRoleId(
        ctx,
        contact,
        explicitRoleId,
      );
    }
    const resolvedContactRoleId = explicitRoleId
      ? explicitRoleId
      : effectiveContactRoleIdFromDoc(masterContact);
    const existing = await ctx.db
      .query("contactFileLinks")
      .withIndex("by_contact_file", (q) =>
        q.eq("contactId", contactId).eq("fileId", fileId)
      )
      .first();

    if (existing) {
      const preRole = existing.role;
      const preNotes = existing.notes;
      await ctx.db.patch(existing._id, {
        role: roleNorm,
        notes: normalizeNotes(notes),
        contactRoleId: resolvedContactRoleId,
        updatedAt: now,
      });
      await syncFileReferralEdgeFromContactLink(ctx, {
        contact: masterContact,
        file,
        contactRoleId: resolvedContactRoleId,
        actor,
      });
      const linkAfter = (await ctx.db.get(existing._id))!;
      const expectLinkKey = stableValueKey({
        role: linkAfter.role,
        notes: linkAfter.notes ?? undefined,
      });
      const linkUndoOk = undoJsonPairWithinLimit(
        { role: preRole, notes: preNotes ?? undefined },
        expectLinkKey,
      );
      await appendPipelineFileActivity(ctx, {
        fileId,
        at: now,
        kind: "contact_link_update",
        contactId,
        summary: clampActivitySummary(
          `${contact.name.trim() || "Contact"} — link updated (${roleNorm})`,
        ),
        ...(linkUndoOk
          ? {
              undoSpec: {
                v: 1 as const,
                kind: "contact_link_patch" as const,
                linkId: existing._id,
                pre: {
                  role: preRole,
                  notes: preNotes ?? undefined,
                },
              },
              expectPost: expectLinkKey,
            }
          : {}),
      });
      await insertContactActivity(ctx, {
        contactId,
        kind: "system",
        summary: `File link updated: ${file.fileName?.trim() || "Pipeline file"} (${roleNorm})`,
        detail: resolvedContactRoleId,
        actorUserKey: actor,
        relatedFileId: fileId,
        at: now,
      });
      await syncFileClientTitleFromPrimaryParties(ctx, fileId);
      return existing._id;
    }

    const newId = await ctx.db.insert("contactFileLinks", {
      contactId,
      fileId,
      role: roleNorm,
      notes: normalizeNotes(notes),
      contactRoleId: resolvedContactRoleId,
      createdAt: now,
      updatedAt: now,
    });

    await syncFileReferralEdgeFromContactLink(ctx, {
      contact: masterContact,
      file,
      contactRoleId: resolvedContactRoleId,
      actor,
    });

    const inserted = (await ctx.db.get(newId))!;
    const expectInsertKey = stableValueKey({
      contactId: inserted.contactId,
      fileId: inserted.fileId,
      role: inserted.role,
      notes: inserted.notes,
    });
    const insertUndoOk = undoJsonPairWithinLimit(
      { v: 1, kind: "contact_link_insert", linkId: newId },
      expectInsertKey,
    );

    await appendPipelineFileActivity(ctx, {
      fileId,
      at: now,
      kind: "contact_link",
      contactId,
      summary: clampActivitySummary(
        `${contact.name.trim() || "Contact"} linked as ${roleNorm}`,
      ),
      ...(insertUndoOk
        ? {
            undoSpec: {
              v: 1 as const,
              kind: "contact_link_insert" as const,
              linkId: newId,
            },
            expectPost: expectInsertKey,
          }
        : {}),
    });

    await insertContactActivity(ctx, {
      contactId,
      kind: "file_linked",
      summary: `Linked to file: ${file.fileName?.trim() || "Pipeline file"}`,
      detail: `Role: ${roleNorm} · CRM role: ${resolvedContactRoleId}`,
      actorUserKey: actor,
      relatedFileId: fileId,
      at: now,
    });

    const fileAfter = await ctx.db.get(fileId);
    if (fileAfter) {
      await runPipelineBlockAutomations({
        ctx,
        fileId,
        existing: fileAfter,
        now,
        event: {
          type: "contact_linked",
          role: roleNorm,
          isNewLink: true,
        },
      });
    }

    await syncFileClientTitleFromPrimaryParties(ctx, fileId);
    return newId;
  },
});

export const remove = mutation({
  args: { id: v.id("contactFileLinks"), memberUserKey: v.optional(v.string()) },
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Link not found");
    const [contact, file] = await Promise.all([
      ctx.db.get(row.contactId),
      ctx.db.get(row.fileId),
    ]);
    if (!contact || !file) {
      throw new Error("Contact or file not found");
    }
    await assertCanMutateContactFileLink(ctx, contact, file, memberUserKey);
    const now = Date.now();
    const actor = memberUserKey?.trim();
    if (
      isReferralContactFileLink({
        contact,
        contactRoleId: row.contactRoleId,
      })
    ) {
      await removeFileReferralEdge(ctx, row.fileId, row.contactId);
    }
    await insertContactActivity(ctx, {
      contactId: row.contactId,
      kind: "file_unlinked",
      summary: `Unlinked from file: ${file.fileName?.trim() || "Pipeline file"}`,
      actorUserKey: actor,
      relatedFileId: row.fileId,
      at: now,
    });
    await appendPipelineFileActivity(ctx, {
      fileId: row.fileId,
      at: now,
      kind: "contact_unlink",
      contactId: row.contactId,
      summary: clampActivitySummary(
        contact?.name?.trim()
          ? `${contact.name.trim()} removed from file`
          : "Contact removed from file",
      ),
      undoSpec: {
        v: 1 as const,
        kind: "contact_unlink_restore" as const,
        contactId: row.contactId,
        fileId: row.fileId,
        role: row.role,
        notes: row.notes ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      expectPost: "unlinked" as const,
    });
    await ctx.db.delete(id);
    await syncFileClientTitleFromPrimaryParties(ctx, row.fileId);
  },
});

export const removeByContactAndFile = mutation({
  args: {
    contactId: v.id("contacts"),
    fileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { contactId, fileId, memberUserKey }) => {
    const [contact, file] = await Promise.all([
      ctx.db.get(contactId),
      ctx.db.get(fileId),
    ]);
    if (!contact || !file) return null;
    await assertCanMutateContactFileLink(ctx, contact, file, memberUserKey);
    const existing = await ctx.db
      .query("contactFileLinks")
      .withIndex("by_contact_file", (q) =>
        q.eq("contactId", contactId).eq("fileId", fileId)
      )
      .first();
    if (!existing) return null;
    const now = Date.now();
    const actor = memberUserKey?.trim();
    if (
      isReferralContactFileLink({
        contact,
        contactRoleId: existing.contactRoleId,
      })
    ) {
      await removeFileReferralEdge(ctx, fileId, contactId);
    }
    await insertContactActivity(ctx, {
      contactId,
      kind: "file_unlinked",
      summary: `Unlinked from file: ${file.fileName?.trim() || "Pipeline file"}`,
      actorUserKey: actor,
      relatedFileId: fileId,
      at: now,
    });
    await appendPipelineFileActivity(ctx, {
      fileId,
      at: now,
      kind: "contact_unlink",
      contactId,
      summary: clampActivitySummary(
        contact.name?.trim()
          ? `${contact.name.trim()} removed from file`
          : "Contact removed from file",
      ),
      undoSpec: {
        v: 1 as const,
        kind: "contact_unlink_restore" as const,
        contactId: existing.contactId,
        fileId: existing.fileId,
        role: existing.role,
        notes: existing.notes ?? undefined,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      },
      expectPost: "unlinked" as const,
    });
    await ctx.db.delete(existing._id);
    await syncFileClientTitleFromPrimaryParties(ctx, fileId);
    return existing._id;
  },
});
