import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { assertOrganizationId } from "./organizationValidators";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const DEFAULT_TEMPLATES: {
  kind: "initial_request" | "file_task_reminder" | "magic_link";
  name: string;
  subject: string;
  bodyText: string;
}[] = [
  {
    kind: "initial_request",
    name: "Initial Document Request",
    subject: "Document request for your loan file",
    bodyText: [
      "Hi {{Client_Name}},",
      "",
      "You've been invited to upload documents for your loan file.",
      "",
      "Open your secure upload portal:",
      "{{Upload_Link}}",
      "",
      "If you have questions, reply to this email.",
    ].join("\n"),
  },
];

export const listForOrg = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
    kind: v.optional(
      v.union(
        v.literal("initial_request"),
        v.literal("file_task_reminder"),
        v.literal("magic_link"),
      ),
    ),
    ...memberKeyArg,
  },
  handler: async (ctx, { organizationId, kind }) => {
    if (organizationId) {
      await assertOrganizationId(ctx, organizationId);
    }

    let rows = await ctx.db.query("portalEmailTemplates").collect();
    if (organizationId) {
      rows = rows.filter(
        (r) =>
          r.organizationId === undefined ||
          String(r.organizationId) === String(organizationId),
      );
    }
    if (kind) {
      rows = rows.filter((r) => r.kind === kind);
    }

    if (rows.length === 0 && kind === "initial_request") {
      const fallback = DEFAULT_TEMPLATES.filter((t) => t.kind === kind);
      return fallback.map((t, i) => ({
        _id: `default-${i}` as Id<"portalEmailTemplates">,
        _creationTime: 0,
        organizationId,
        kind: t.kind,
        name: t.name,
        subject: t.subject,
        bodyText: t.bodyText,
        isDefault: true,
        createdAt: 0,
        updatedAt: 0,
      }));
    }

    rows.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return rows;
  },
});

export const seedDefaults = mutation({
  args: {
    organizationId: v.optional(v.id("organizations")),
    ...memberKeyArg,
  },
  handler: async (ctx, { organizationId }) => {
    if (organizationId) {
      await assertOrganizationId(ctx, organizationId);
    }
    const now = Date.now();
    for (const tpl of DEFAULT_TEMPLATES) {
      const existing = await ctx.db
        .query("portalEmailTemplates")
        .withIndex("by_org_kind", (q) =>
          q.eq("organizationId", organizationId).eq("kind", tpl.kind),
        )
        .first();
      if (existing) continue;
      await ctx.db.insert("portalEmailTemplates", {
        organizationId,
        kind: tpl.kind,
        name: tpl.name,
        subject: tpl.subject,
        bodyText: tpl.bodyText,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok: true as const };
  },
});

export const upsertTemplate = mutation({
  args: {
    organizationId: v.optional(v.id("organizations")),
    templateId: v.optional(v.id("portalEmailTemplates")),
    kind: v.union(
      v.literal("initial_request"),
      v.literal("file_task_reminder"),
      v.literal("magic_link"),
    ),
    name: v.string(),
    subject: v.string(),
    bodyText: v.string(),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    if (args.organizationId) {
      await assertOrganizationId(ctx, args.organizationId);
    }
    const now = Date.now();
    if (args.templateId) {
      const row = await ctx.db.get(args.templateId);
      if (!row) throw new Error("Template not found.");
      await ctx.db.patch(args.templateId, {
        name: args.name.trim(),
        subject: args.subject.trim(),
        bodyText: args.bodyText.trim(),
        updatedAt: now,
      });
      return { ok: true as const, templateId: args.templateId };
    }
    const id = await ctx.db.insert("portalEmailTemplates", {
      organizationId: args.organizationId,
      kind: args.kind,
      name: args.name.trim(),
      subject: args.subject.trim(),
      bodyText: args.bodyText.trim(),
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true as const, templateId: id };
  },
});
