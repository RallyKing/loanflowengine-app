import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const DOCUMENT_TASK_STARTER_STACKS: {
  name: string;
  description: string;
  tasks: { title: string; isRequired: boolean; isPortalVisible: boolean }[];
}[] = [
  {
    name: "Standard MCA Pack",
    description: "Common merchant cash advance document requests.",
    tasks: [
      { title: "3 Months Bank Statements", isRequired: true, isPortalVisible: true },
      { title: "Driver License / ID", isRequired: true, isPortalVisible: true },
      { title: "Voided Check", isRequired: true, isPortalVisible: true },
      { title: "Signed Application", isRequired: true, isPortalVisible: true },
    ],
  },
  {
    name: "Real Estate Refi Pack",
    description: "Residential refinance starter checklist.",
    tasks: [
      { title: "2 Years Tax Returns", isRequired: true, isPortalVisible: true },
      { title: "2 Months Bank Statements", isRequired: true, isPortalVisible: true },
      { title: "Pay Stubs (30 days)", isRequired: false, isPortalVisible: true },
      { title: "Homeowners Insurance", isRequired: false, isPortalVisible: true },
      { title: "Mortgage Statement", isRequired: true, isPortalVisible: true },
    ],
  },
];

export async function seedDocumentTaskTemplatesForOrg(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  userKey: string,
  force = false,
): Promise<{ seeded: boolean; stackCount: number; templateCount: number }> {
  const existing = await ctx.db
    .query("documentTaskTemplateStacks")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .first();
  if (existing && !force) {
    return { seeded: false, stackCount: 0, templateCount: 0 };
  }

  if (force && existing) {
    const stacks = await ctx.db
      .query("documentTaskTemplateStacks")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const stack of stacks) {
      const templates = await ctx.db
        .query("documentTaskTemplates")
        .withIndex("by_stack", (q) => q.eq("stackId", stack._id))
        .collect();
      for (const tpl of templates) {
        await ctx.db.delete(tpl._id);
      }
      await ctx.db.delete(stack._id);
    }
    const loose = await ctx.db
      .query("documentTaskTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const tpl of loose) {
      await ctx.db.delete(tpl._id);
    }
  }

  const now = Date.now();
  let templateCount = 0;
  for (let si = 0; si < DOCUMENT_TASK_STARTER_STACKS.length; si++) {
    const pack = DOCUMENT_TASK_STARTER_STACKS[si]!;
    const stackId = await ctx.db.insert("documentTaskTemplateStacks", {
      organizationId,
      name: pack.name,
      description: pack.description,
      sortOrder: si * 1000,
      createdByUserKey: userKey,
      createdAt: now,
      updatedAt: now,
    });
    for (let ti = 0; ti < pack.tasks.length; ti++) {
      const t = pack.tasks[ti]!;
      await ctx.db.insert("documentTaskTemplates", {
        organizationId,
        stackId,
        title: t.title,
        isRequired: t.isRequired,
        isPortalVisible: t.isPortalVisible,
        sortOrder: ti * 1000,
        createdByUserKey: userKey,
        createdAt: now,
        updatedAt: now,
      });
      templateCount += 1;
    }
  }

  return {
    seeded: true,
    stackCount: DOCUMENT_TASK_STARTER_STACKS.length,
    templateCount,
  };
}
