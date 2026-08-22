import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOrganizationId } from "./organizationValidators";
import {
  requireOrgReaderKey,
  requireOrgMemberKey,
} from "./authUtils";
import {
  assertCanMutateContactRow,
  assertCanReadPipelineRow,
} from "./organizationAccess";
import {
  emptyPortalDefaultConfig,
  isPortalDefaultType,
  portalDefaultTypeForContactRole,
  summarizePortalDefaultConfig,
  type PortalDefaultConfig,
  type PortalDefaultType,
} from "../lib/portalDefaults";
import {
  defaultSectionsForPortalType,
  sanitizePortalPageSections,
  summarizePortalPageSections,
  type PortalPageSectionInstance,
} from "../lib/portalPageSections";
import {
  defaultPortalChrome,
  sanitizePortalChrome,
  type PortalChromeConfig,
} from "../lib/portalChrome";
import {
  effectiveContactRoleIdFromDoc,
  effectiveContactRoleIdsFromDoc,
} from "../lib/contact/contactRoles";
import { normalizePortalToken } from "../lib/portalToken";
import { sha256Hex } from "./clientPortalCrypto";
import { loadLinkByTokenHash } from "./clientPortalLinks";
const memberUserKeyArg = { memberUserKey: v.optional(v.string()) };

const portalTypeV = v.union(
  v.literal("client"),
  v.literal("lender"),
  v.literal("referrer"),
  v.literal("deal_partner"),
);

const checklistItemV = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  folderName: v.optional(v.string()),
});

const sectionInstanceV = v.object({
  instanceId: v.string(),
  sectionId: v.string(),
  enabled: v.optional(v.boolean()),
  /** Validated/sanitized via sanitizePortalPageSections (lib/portalSectionConfig). */
  props: v.optional(v.any()),
  layout: v.optional(
    v.object({
      colSpan: v.optional(v.number()),
      order: v.optional(v.number()),
    }),
  ),
});

/** Chrome is sanitized server-side; keep validator permissive for additive fields. */
const chromeV = v.optional(v.any());

const configV = v.object({
  welcomeMessage: v.optional(v.string()),
  permission: v.optional(v.union(v.literal("view"), v.literal("view_upload"))),
  linkExpiresPreset: v.optional(
    v.union(
      v.literal("1h"),
      v.literal("24h"),
      v.literal("7d"),
      v.literal("30d"),
    ),
  ),
  grantExpiresPreset: v.optional(
    v.union(v.literal("never"), v.literal("30d"), v.literal("90d")),
  ),
  checklistId: v.optional(v.string()),
  requestChecklist: v.optional(v.array(checklistItemV)),
  lenderPermission: v.optional(
    v.union(v.literal("view_only"), v.literal("downloadable")),
  ),
  includeAllDocumentsByDefault: v.optional(v.boolean()),
  showDealSummary: v.optional(v.boolean()),
  allowMessaging: v.optional(v.boolean()),
  statusVisibility: v.optional(
    v.union(v.literal("basic"), v.literal("detailed")),
  ),
  sections: v.optional(v.array(sectionInstanceV)),
  chrome: chromeV,
});

const publicRowV = v.object({
  _id: v.id("portalDefaults"),
  organizationId: v.id("organizations"),
  name: v.string(),
  description: v.optional(v.string()),
  portalType: portalTypeV,
  config: configV,
  activeVersionId: v.optional(v.id("portalDefaultVersions")),
  archivedAt: v.optional(v.number()),
  createdByUserKey: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  sectionSummary: v.optional(v.string()),
});

const versionRowV = v.object({
  _id: v.id("portalDefaultVersions"),
  organizationId: v.id("organizations"),
  portalDefaultId: v.id("portalDefaults"),
  name: v.string(),
  sections: v.array(sectionInstanceV),
  chrome: chromeV,
  status: v.union(v.literal("draft"), v.literal("published")),
  createdByUserKey: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  isActive: v.boolean(),
});

const MAX_NAME = 120;
const MAX_DESC = 500;
const MAX_WELCOME = 4000;
const MAX_CHECKLIST = 40;
const MAX_VERSIONS = 40;

async function requireOrgReader(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  await assertOrganizationId(ctx, organizationId);
  return requireOrgReaderKey(
    ctx,
    organizationId,
    memberUserKey,
    "portalDefaults.requireOrgReader",
  );
}

async function requireOrgSettingsEditor(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  await assertOrganizationId(ctx, organizationId);
  return requireOrgMemberKey(ctx, organizationId, memberUserKey, {
    permission: "settings.manage",
    stage: "portalDefaults.requireOrgSettingsEditor",
  });
}

function sanitizeChecklist(
  raw:
    | readonly { title: string; description?: string; folderName?: string }[]
    | undefined,
): PortalDefaultConfig["requestChecklist"] {
  if (!raw || raw.length === 0) return undefined;
  const out: NonNullable<PortalDefaultConfig["requestChecklist"]> = [];
  for (const item of raw.slice(0, MAX_CHECKLIST)) {
    const title = item.title.trim().slice(0, 200);
    if (!title) continue;
    out.push({
      title,
      description: item.description?.trim().slice(0, 4000) || undefined,
      folderName: item.folderName?.trim().slice(0, 120) || undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

function sanitizeConfig(
  portalType: PortalDefaultType,
  raw: PortalDefaultConfig | undefined,
): PortalDefaultConfig {
  const base = emptyPortalDefaultConfig(portalType);
  const c = raw ?? {};
  const welcomeMessage =
    c.welcomeMessage?.trim().slice(0, MAX_WELCOME) || undefined;
  const sections =
    c.sections !== undefined
      ? sanitizePortalPageSections(portalType, c.sections)
      : base.sections;
  const chrome = sanitizePortalChrome(portalType, c.chrome ?? base.chrome);

  if (portalType === "client") {
    return {
      welcomeMessage,
      permission:
        c.permission === "view" || c.permission === "view_upload"
          ? c.permission
          : base.permission,
      linkExpiresPreset:
        c.linkExpiresPreset === "1h" ||
        c.linkExpiresPreset === "24h" ||
        c.linkExpiresPreset === "7d" ||
        c.linkExpiresPreset === "30d"
          ? c.linkExpiresPreset
          : base.linkExpiresPreset,
      grantExpiresPreset:
        c.grantExpiresPreset === "never" ||
        c.grantExpiresPreset === "30d" ||
        c.grantExpiresPreset === "90d"
          ? c.grantExpiresPreset
          : base.grantExpiresPreset,
      checklistId: c.checklistId?.trim().slice(0, 80) || undefined,
      requestChecklist: sanitizeChecklist(c.requestChecklist),
      sections,
      chrome,
    };
  }

  if (portalType === "lender") {
    return {
      welcomeMessage,
      lenderPermission:
        c.lenderPermission === "view_only" ||
        c.lenderPermission === "downloadable"
          ? c.lenderPermission
          : base.lenderPermission,
      includeAllDocumentsByDefault:
        typeof c.includeAllDocumentsByDefault === "boolean"
          ? c.includeAllDocumentsByDefault
          : base.includeAllDocumentsByDefault,
      sections,
      chrome,
    };
  }

  return {
    welcomeMessage,
    showDealSummary:
      typeof c.showDealSummary === "boolean"
        ? c.showDealSummary
        : base.showDealSummary,
    allowMessaging:
      typeof c.allowMessaging === "boolean"
        ? c.allowMessaging
        : base.allowMessaging,
    statusVisibility:
      c.statusVisibility === "basic" || c.statusVisibility === "detailed"
        ? c.statusVisibility
        : base.statusVisibility,
    sections,
    chrome,
  };
}

function publicRow(row: Doc<"portalDefaults">) {
  const rawConfig = row.config;
  const config = (
    rawConfig && typeof rawConfig === "object"
      ? rawConfig
      : emptyPortalDefaultConfig(row.portalType)
  ) as PortalDefaultConfig;
  return {
    _id: row._id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    portalType: row.portalType,
    config,
    activeVersionId: row.activeVersionId,
    archivedAt: row.archivedAt,
    createdByUserKey: row.createdByUserKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sectionSummary: summarizePortalPageSections(config.sections),
  };
}

function publicVersion(
  row: Doc<"portalDefaultVersions">,
  activeVersionId: Id<"portalDefaultVersions"> | undefined,
) {
  return {
    _id: row._id,
    organizationId: row.organizationId,
    portalDefaultId: row.portalDefaultId,
    name: row.name,
    sections: row.sections as PortalPageSectionInstance[],
    chrome: (row.chrome as PortalChromeConfig | undefined) ?? undefined,
    status: row.status,
    createdByUserKey: row.createdByUserKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isActive: activeVersionId === row._id,
  };
}

/**
 * Deduplicate assigned defaults: keep at most one id per portalType,
 * drop missing/archived/wrong-org rows.
 */
export async function sanitizePortalDefaultIdsForOrg(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations"> | undefined,
  raw: readonly Id<"portalDefaults">[] | undefined,
): Promise<Id<"portalDefaults">[] | undefined> {
  if (!raw || raw.length === 0 || !organizationId) return undefined;
  const seenTypes = new Set<string>();
  const out: Id<"portalDefaults">[] = [];
  for (const id of raw) {
    const row = await ctx.db.get(id);
    if (!row) continue;
    if (row.organizationId !== organizationId) continue;
    if (row.archivedAt != null) continue;
    if (seenTypes.has(row.portalType)) continue;
    seenTypes.add(row.portalType);
    out.push(id);
  }
  return out.length > 0 ? out : undefined;
}

async function resolveStageLabel(
  ctx: QueryCtx,
  pipeline: Doc<"pipeline">,
): Promise<{ stageLabel: string; stageDetail?: string }> {
  if (pipeline.stageId) {
    const stage = await ctx.db.get(pipeline.stageId);
    if (stage?.name?.trim()) {
      let stageDetail: string | undefined;
      if (pipeline.subStageId) {
        const sub = await ctx.db.get(pipeline.subStageId);
        stageDetail = sub?.name?.trim() || undefined;
      }
      return {
        stageLabel: stage.name.trim(),
        stageDetail,
      };
    }
  }
  const status = pipeline.status?.trim();
  return {
    stageLabel: status && status.length > 0 ? status : "In progress",
  };
}

async function resolveFileOwnerContact(
  ctx: QueryCtx,
  pipeline: Doc<"pipeline">,
): Promise<{
  name: string;
  email?: string;
  phone?: string;
  title?: string;
} | null> {
  const key = pipeline.ownerUserKey?.trim() || pipeline.ownerUserId?.trim();
  if (!key) return null;
  const authUser = await ctx.db.get(key as Id<"authUsers">);
  if (authUser && "displayUsername" in authUser) {
    return {
      name:
        (authUser.displayUsername as string | undefined)?.trim() ||
        (authUser.email as string | undefined)?.trim() ||
        "Your broker",
      email: (authUser.email as string | undefined)?.trim() || undefined,
      title: "File owner",
    };
  }
  return {
    name: "Your broker",
    title: "File owner",
  };
}

async function resolveOrgPrimaryContact(
  ctx: QueryCtx,
  organizationId: Id<"organizations"> | undefined,
  pipeline?: Doc<"pipeline"> | null,
  sections?: PortalPageSectionInstance[],
): Promise<{
  name: string;
  email?: string;
  phone?: string;
  title?: string;
} | null> {
  const contactSection = (sections ?? []).find(
    (s) => s.sectionId === "company_primary_contact" && s.enabled !== false,
  );
  const props = contactSection?.props as
    | {
        contactSource?: string;
        customContact?: {
          name?: string;
          title?: string;
          email?: string;
          phone?: string;
        };
      }
    | undefined;

  if (props?.contactSource === "custom" && props.customContact) {
    const c = props.customContact;
    return {
      name: c.name?.trim() || "Primary contact",
      title: c.title?.trim() || undefined,
      email: c.email?.trim() || undefined,
      phone: c.phone?.trim() || undefined,
    };
  }

  if (props?.contactSource === "file_owner" && pipeline) {
    const owner = await resolveFileOwnerContact(ctx, pipeline);
    if (owner) return owner;
  }

  if (!organizationId) return null;
  const org = await ctx.db.get(organizationId);
  if (!org) return null;
  const name = org.name?.trim() || "Your lending team";
  return {
    name,
    email: undefined,
    phone: undefined,
    title: "Brokerage",
  };
}

async function findAssignedDefaultForFile(
  ctx: QueryCtx,
  args: {
    pipelineFileId: Id<"pipeline">;
    organizationId: Id<"organizations"> | undefined;
    portalType: PortalDefaultType;
    emailKey?: string;
  },
): Promise<Doc<"portalDefaults"> | null> {
  const links = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_file", (q) => q.eq("fileId", args.pipelineFileId))
    .order("desc")
    .take(80);

  let fallback: Doc<"portalDefaults"> | null = null;

  for (const link of links) {
    const contact = await ctx.db.get(link.contactId);
    if (!contact) continue;
    const ids = contact.portalDefaultIds ?? [];
    for (const defaultId of ids) {
      const tpl = await ctx.db.get(defaultId);
      if (!tpl || tpl.archivedAt != null) continue;
      if (tpl.portalType !== args.portalType) continue;
      if (
        args.organizationId &&
        tpl.organizationId !== args.organizationId
      ) {
        continue;
      }
      const sections = tpl.config.sections as
        | PortalPageSectionInstance[]
        | undefined;
      if (!sections || sections.length === 0) continue;

      if (args.emailKey && contact.emailKey === args.emailKey) {
        return tpl;
      }
      if (!fallback) fallback = tpl;
    }
  }
  return fallback;
}

export const listForOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    portalType: v.optional(portalTypeV),
    includeArchived: v.optional(v.boolean()),
    ...memberUserKeyArg,
  },
  returns: v.array(publicRowV),
  handler: async (ctx, { organizationId, portalType, includeArchived, memberUserKey }) => {
    await requireOrgReader(ctx, organizationId, memberUserKey);
    let rows: Doc<"portalDefaults">[];
    if (portalType) {
      rows = await ctx.db
        .query("portalDefaults")
        .withIndex("by_organization_type", (q) =>
          q.eq("organizationId", organizationId).eq("portalType", portalType),
        )
        .order("desc")
        .take(100);
    } else {
      rows = await ctx.db
        .query("portalDefaults")
        .withIndex("by_organization_updated", (q) =>
          q.eq("organizationId", organizationId),
        )
        .order("desc")
        .take(100);
    }
    if (!includeArchived) {
      rows = rows.filter((r) => r.archivedAt == null);
    }
    return rows.map(publicRow);
  },
});

export const get = query({
  args: {
    id: v.id("portalDefaults"),
    ...memberUserKeyArg,
  },
  returns: v.union(publicRowV, v.null()),
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) return null;
    await requireOrgReader(ctx, row.organizationId, memberUserKey);
    return publicRow(row);
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    portalType: portalTypeV,
    config: v.optional(configV),
    ...memberUserKeyArg,
  },
  returns: v.id("portalDefaults"),
  handler: async (ctx, args) => {
    const key = await requireOrgSettingsEditor(
      ctx,
      args.organizationId,
      args.memberUserKey,
    );
    const name = args.name.trim().slice(0, MAX_NAME);
    if (!name) throw new Error("Name is required");
    const now = Date.now();
    const portalType = args.portalType;
    if (!isPortalDefaultType(portalType)) {
      throw new Error("Invalid portal type");
    }
    const config = sanitizeConfig(
      portalType,
      args.config as PortalDefaultConfig | undefined,
    );
    if (!config.sections || config.sections.length === 0) {
      config.sections = defaultSectionsForPortalType(portalType);
    }
    const defaultId = await ctx.db.insert("portalDefaults", {
      organizationId: args.organizationId,
      name,
      description: args.description?.trim().slice(0, MAX_DESC) || undefined,
      portalType,
      config,
      createdByUserKey: key,
      createdAt: now,
      updatedAt: now,
    });
    const versionId = await ctx.db.insert("portalDefaultVersions", {
      organizationId: args.organizationId,
      portalDefaultId: defaultId,
      name: "Version 1",
      sections: config.sections ?? [],
      status: "published",
      createdByUserKey: key,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(defaultId, { activeVersionId: versionId });
    return defaultId;
  },
});

export const update = mutation({
  args: {
    id: v.id("portalDefaults"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    config: v.optional(configV),
    ...memberUserKeyArg,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Portal default not found");
    await requireOrgSettingsEditor(
      ctx,
      row.organizationId,
      args.memberUserKey,
    );
    const patch: Partial<Doc<"portalDefaults">> = {
      updatedAt: Date.now(),
    };
    if (args.name !== undefined) {
      const name = args.name.trim().slice(0, MAX_NAME);
      if (!name) throw new Error("Name is required");
      patch.name = name;
    }
    if (args.description !== undefined) {
      patch.description =
        args.description.trim().slice(0, MAX_DESC) || undefined;
    }
    if (args.config !== undefined) {
      patch.config = sanitizeConfig(
        row.portalType,
        {
          ...(row.config as PortalDefaultConfig),
          ...(args.config as PortalDefaultConfig),
        },
      );
    }
    await ctx.db.patch(args.id, patch);
    return null;
  },
});

export const archive = mutation({
  args: {
    id: v.id("portalDefaults"),
    ...memberUserKeyArg,
  },
  returns: v.null(),
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Portal default not found");
    await requireOrgSettingsEditor(ctx, row.organizationId, memberUserKey);
    await ctx.db.patch(id, {
      archivedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const restore = mutation({
  args: {
    id: v.id("portalDefaults"),
    ...memberUserKeyArg,
  },
  returns: v.null(),
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Portal default not found");
    await requireOrgSettingsEditor(ctx, row.organizationId, memberUserKey);
    await ctx.db.patch(id, {
      archivedAt: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const listVersions = query({
  args: {
    portalDefaultId: v.id("portalDefaults"),
    ...memberUserKeyArg,
  },
  returns: v.array(versionRowV),
  handler: async (ctx, { portalDefaultId, memberUserKey }) => {
    const parent = await ctx.db.get(portalDefaultId);
    if (!parent) return [];
    await requireOrgReader(ctx, parent.organizationId, memberUserKey);
    const rows = await ctx.db
      .query("portalDefaultVersions")
      .withIndex("by_portal_default", (q) =>
        q.eq("portalDefaultId", portalDefaultId),
      )
      .order("desc")
      .take(MAX_VERSIONS);
    return rows.map((r) => publicVersion(r, parent.activeVersionId));
  },
});

export const getVersion = query({
  args: {
    versionId: v.id("portalDefaultVersions"),
    ...memberUserKeyArg,
  },
  returns: v.union(versionRowV, v.null()),
  handler: async (ctx, { versionId, memberUserKey }) => {
    const row = await ctx.db.get(versionId);
    if (!row) return null;
    await requireOrgReader(ctx, row.organizationId, memberUserKey);
    const parent = await ctx.db.get(row.portalDefaultId);
    return publicVersion(row, parent?.activeVersionId);
  },
});

export const createVersion = mutation({
  args: {
    portalDefaultId: v.id("portalDefaults"),
    name: v.optional(v.string()),
    /** Clone from this version; otherwise clone active / config sections. */
    fromVersionId: v.optional(v.id("portalDefaultVersions")),
    ...memberUserKeyArg,
  },
  returns: v.id("portalDefaultVersions"),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.portalDefaultId);
    if (!parent) throw new Error("Portal default not found");
    const key = await requireOrgSettingsEditor(
      ctx,
      parent.organizationId,
      args.memberUserKey,
    );
    const existing = await ctx.db
      .query("portalDefaultVersions")
      .withIndex("by_portal_default", (q) =>
        q.eq("portalDefaultId", args.portalDefaultId),
      )
      .take(MAX_VERSIONS);
    if (existing.length >= MAX_VERSIONS) {
      throw new Error(`Maximum of ${MAX_VERSIONS} versions reached`);
    }

    let sections: PortalPageSectionInstance[] = [];
    let chrome: PortalChromeConfig = defaultPortalChrome(parent.portalType);
    if (args.fromVersionId) {
      const from = await ctx.db.get(args.fromVersionId);
      if (!from || from.portalDefaultId !== parent._id) {
        throw new Error("Source version not found");
      }
      sections = sanitizePortalPageSections(
        parent.portalType,
        from.sections as PortalPageSectionInstance[],
      );
      chrome = sanitizePortalChrome(parent.portalType, from.chrome);
    } else if (parent.activeVersionId) {
      const active = await ctx.db.get(parent.activeVersionId);
      sections = sanitizePortalPageSections(
        parent.portalType,
        (active?.sections as PortalPageSectionInstance[] | undefined) ??
          ((parent.config as PortalDefaultConfig | null)?.sections as
            | PortalPageSectionInstance[]
            | undefined),
      );
      chrome = sanitizePortalChrome(
        parent.portalType,
        active?.chrome ??
          (parent.config as PortalDefaultConfig | null)?.chrome,
      );
    } else {
      sections = sanitizePortalPageSections(
        parent.portalType,
        (parent.config as PortalDefaultConfig | null)?.sections as
          | PortalPageSectionInstance[]
          | undefined,
      );
      chrome = sanitizePortalChrome(
        parent.portalType,
        (parent.config as PortalDefaultConfig | null)?.chrome,
      );
    }
    if (sections.length === 0) {
      sections = defaultSectionsForPortalType(parent.portalType);
    }

    const now = Date.now();
    const name =
      args.name?.trim().slice(0, MAX_NAME) ||
      `Version ${existing.length + 1}`;
    return await ctx.db.insert("portalDefaultVersions", {
      organizationId: parent.organizationId,
      portalDefaultId: parent._id,
      name,
      sections,
      chrome,
      status: "draft",
      createdByUserKey: key,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateVersion = mutation({
  args: {
    versionId: v.id("portalDefaultVersions"),
    name: v.optional(v.string()),
    sections: v.optional(v.array(sectionInstanceV)),
    chrome: chromeV,
    ...memberUserKeyArg,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.versionId);
    if (!row) throw new Error("Version not found");
    const parent = await ctx.db.get(row.portalDefaultId);
    if (!parent) throw new Error("Portal default not found");
    await requireOrgSettingsEditor(
      ctx,
      parent.organizationId,
      args.memberUserKey,
    );
    const patch: Partial<Doc<"portalDefaultVersions">> = {
      updatedAt: Date.now(),
    };
    if (args.name !== undefined) {
      const name = args.name.trim().slice(0, MAX_NAME);
      if (!name) throw new Error("Name is required");
      patch.name = name;
    }
    if (args.sections !== undefined) {
      patch.sections = sanitizePortalPageSections(
        parent.portalType,
        args.sections as PortalPageSectionInstance[],
      );
      // Editing a published version demotes it to draft until re-promoted.
      if (row.status === "published" && parent.activeVersionId !== row._id) {
        patch.status = "draft";
      } else if (parent.activeVersionId === row._id) {
        // Keep published while editing the live version; promote still required
        // to sync parent.config — but allow saving sections in place.
        patch.status = "draft";
      }
    }
    if (args.chrome !== undefined) {
      patch.chrome = sanitizePortalChrome(parent.portalType, args.chrome);
      if (row.status === "published") {
        patch.status = "draft";
      }
    }
    await ctx.db.patch(args.versionId, patch);
    return null;
  },
});

/**
 * Promote a version → live default: copy sections onto parent config,
 * mark version published, set activeVersionId.
 */
export const promoteVersion = mutation({
  args: {
    versionId: v.id("portalDefaultVersions"),
    ...memberUserKeyArg,
  },
  returns: v.null(),
  handler: async (ctx, { versionId, memberUserKey }) => {
    const row = await ctx.db.get(versionId);
    if (!row) throw new Error("Version not found");
    const parent = await ctx.db.get(row.portalDefaultId);
    if (!parent) throw new Error("Portal default not found");
    await requireOrgSettingsEditor(ctx, parent.organizationId, memberUserKey);
    const sections = sanitizePortalPageSections(
      parent.portalType,
      row.sections as PortalPageSectionInstance[],
    );
    const chrome = sanitizePortalChrome(parent.portalType, row.chrome);
    const now = Date.now();
    await ctx.db.patch(versionId, {
      status: "published",
      sections,
      chrome,
      updatedAt: now,
    });
    await ctx.db.patch(parent._id, {
      activeVersionId: versionId,
      config: {
        ...parent.config,
        sections,
        chrome,
      },
      updatedAt: now,
    });
    return null;
  },
});

const filePortalEntryV = v.object({
  contactId: v.id("contacts"),
  contactName: v.string(),
  contactEmail: v.string(),
  linkRole: v.string(),
  registryRoleId: v.optional(v.string()),
  suggestedPortalType: v.union(portalTypeV, v.null()),
  assignedDefaults: v.array(
    v.object({
      _id: v.id("portalDefaults"),
      name: v.string(),
      portalType: portalTypeV,
      config: configV,
      summary: v.string(),
      sectionSummary: v.optional(v.string()),
    }),
  ),
  missingSuggestedDefault: v.boolean(),
});

/**
 * Resolve contactFileLinks → contacts → assigned portal defaults for
 * the Portals & Progress tab. Additive — does not invent live links.
 */
export const listForPipelineFile = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    ...memberUserKeyArg,
  },
  returns: v.object({
    ok: v.boolean(),
    entries: v.array(filePortalEntryV),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, { pipelineFileId, memberUserKey }) => {
    const file = await ctx.db.get(pipelineFileId);
    if (!file) {
      return { ok: false, entries: [], message: "File not found" };
    }
    try {
      await assertCanReadPipelineRow(ctx, file, memberUserKey);
    } catch (err) {
      return {
        ok: false,
        entries: [],
        message: err instanceof Error ? err.message : "Access denied",
      };
    }

    const links = await ctx.db
      .query("contactFileLinks")
      .withIndex("by_file", (q) => q.eq("fileId", pipelineFileId))
      .order("desc")
      .collect();

    const entries: Array<{
      contactId: Id<"contacts">;
      contactName: string;
      contactEmail: string;
      linkRole: string;
      registryRoleId?: string;
      suggestedPortalType: PortalDefaultType | null;
      assignedDefaults: Array<{
        _id: Id<"portalDefaults">;
        name: string;
        portalType: PortalDefaultType;
        config: PortalDefaultConfig;
        summary: string;
        sectionSummary?: string;
      }>;
      missingSuggestedDefault: boolean;
    }> = [];

    for (const link of links) {
      const contact = await ctx.db.get(link.contactId);
      if (!contact) continue;

      const suggested =
        portalDefaultTypeForContactRole(
          link.registryRoleId ??
            link.contactRoleId ??
            effectiveContactRoleIdFromDoc(contact),
        ) ??
        (() => {
          for (const rid of effectiveContactRoleIdsFromDoc(contact)) {
            const t = portalDefaultTypeForContactRole(rid);
            if (t) return t;
          }
          return null;
        })();

      const assignedDefaults: (typeof entries)[number]["assignedDefaults"] = [];
      const ids = contact.portalDefaultIds ?? [];
      for (const defaultId of ids) {
        const tpl = await ctx.db.get(defaultId);
        if (!tpl || tpl.archivedAt != null) continue;
        if (
          file.organizationId &&
          tpl.organizationId !== file.organizationId
        ) {
          continue;
        }
        assignedDefaults.push({
          _id: tpl._id,
          name: tpl.name,
          portalType: tpl.portalType,
          config: tpl.config as PortalDefaultConfig,
          summary: summarizePortalDefaultConfig(
            tpl.portalType,
            tpl.config as PortalDefaultConfig,
          ),
          sectionSummary: summarizePortalPageSections(
            (tpl.config as PortalDefaultConfig).sections,
          ),
        });
      }

      const hasSuggested =
        suggested != null &&
        assignedDefaults.some((d) => d.portalType === suggested);

      entries.push({
        contactId: contact._id,
        contactName: contact.name.trim() || "Contact",
        contactEmail: contact.email?.trim() || "",
        linkRole: link.role,
        registryRoleId: link.registryRoleId ?? link.contactRoleId,
        suggestedPortalType: suggested,
        assignedDefaults,
        missingSuggestedDefault: suggested != null && !hasSuggested,
      });
    }

    return { ok: true, entries };
  },
});

/**
 * Assign / replace portal defaults on a contact (at most one per type).
 */
export const assignToContact = mutation({
  args: {
    contactId: v.id("contacts"),
    portalDefaultIds: v.array(v.id("portalDefaults")),
    ...memberUserKeyArg,
  },
  returns: v.null(),
  handler: async (ctx, { contactId, portalDefaultIds, memberUserKey }) => {
    const contact = await ctx.db.get(contactId);
    if (!contact) throw new Error("Contact not found");
    await assertCanMutateContactRow(ctx, contact, memberUserKey);
    const sanitized = await sanitizePortalDefaultIdsForOrg(
      ctx,
      contact.organizationId,
      portalDefaultIds,
    );
    await ctx.db.patch(contactId, {
      portalDefaultIds: sanitized,
      updatedAt: Date.now(),
    });
    return null;
  },
});

const compositionContextV = v.object({
  stageLabel: v.string(),
  stageDetail: v.optional(v.string()),
  primaryContact: v.optional(
    v.object({
      name: v.string(),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      title: v.optional(v.string()),
    }),
  ),
  fileLabel: v.string(),
  workspaceName: v.string(),
  welcomeMessage: v.optional(v.string()),
  outstandingCount: v.optional(v.number()),
  statusVisibility: v.optional(
    v.union(v.literal("basic"), v.literal("detailed")),
  ),
  allowMessaging: v.optional(v.boolean()),
  showDealSummary: v.optional(v.boolean()),
});

const compositionResultV = v.object({
  status: v.union(v.literal("ok"), v.literal("none"), v.literal("not_found")),
  portalType: v.optional(portalTypeV),
  defaultId: v.optional(v.id("portalDefaults")),
  defaultName: v.optional(v.string()),
  sections: v.array(sectionInstanceV),
  chrome: chromeV,
  context: v.optional(compositionContextV),
});

/**
 * Public: resolve composed page for a client bundle token from assigned
 * contact portal defaults on the linked file. Falls back to `none`.
 */
export const resolveCompositionForClientBundle = query({
  args: {
    token: v.string(),
    companySlug: v.optional(v.string()),
  },
  returns: compositionResultV,
  handler: async (ctx, { token, companySlug }) => {
    const trimmed = normalizePortalToken(token);
    if (!trimmed) return { status: "not_found" as const, sections: [] };

    const tokenHash = await sha256Hex(trimmed);
    const link = await loadLinkByTokenHash(ctx, tokenHash);
    let pipelineFileId: Id<"pipeline"> | null = null;
    let emailKey: string | undefined;
    let outstandingCount = 0;

    if (link?.bundleTokenId) {
      if (
        companySlug &&
        link.companySlug &&
        link.companySlug !== companySlug.trim().toLowerCase()
      ) {
        return { status: "not_found" as const, sections: [] };
      }
      pipelineFileId = link.pipelineFileId;
      emailKey = link.emailKey;
      const bundle = await ctx.db.get(link.bundleTokenId);
      if (bundle) {
        outstandingCount = bundle.fileTaskIds.length;
      }
    } else {
      const legacy = await ctx.db
        .query("documentVaultClientBundleTokens")
        .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
        .first();
      if (!legacy) return { status: "not_found" as const, sections: [] };
      pipelineFileId = legacy.pipelineFileId;
      outstandingCount = legacy.fileTaskIds.length;
    }

    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) return { status: "not_found" as const, sections: [] };

    const tpl = await findAssignedDefaultForFile(ctx, {
      pipelineFileId,
      organizationId: pipeline.organizationId,
      portalType: "client",
      emailKey,
    });
    if (!tpl) {
      return { status: "none" as const, sections: [] };
    }

    const sections = sanitizePortalPageSections(
      "client",
      tpl.config.sections as PortalPageSectionInstance[] | undefined,
    ).filter((s) => s.enabled !== false);
    if (sections.length === 0) {
      return { status: "none" as const, sections: [] };
    }
    const chrome = sanitizePortalChrome("client", tpl.config.chrome);

    const org = pipeline.organizationId
      ? await ctx.db.get(pipeline.organizationId)
      : null;
    const stage = await resolveStageLabel(ctx, pipeline);
    const primaryContact = await resolveOrgPrimaryContact(
      ctx,
      pipeline.organizationId,
      pipeline,
      sections,
    );

    return {
      status: "ok" as const,
      portalType: "client" as const,
      defaultId: tpl._id,
      defaultName: tpl.name,
      sections,
      chrome,
      context: {
        ...stage,
        primaryContact: primaryContact ?? undefined,
        fileLabel:
          pipeline.fileName?.trim() ||
          pipeline.propertyAddress?.trim() ||
          "Loan file",
        workspaceName:
          org?.name?.trim() && org.name.trim().length > 0
            ? org.name.trim()
            : "Your lender",
        welcomeMessage: tpl.config.welcomeMessage,
        outstandingCount,
        statusVisibility: tpl.config.statusVisibility,
        allowMessaging: tpl.config.allowMessaging ?? true,
        showDealSummary: tpl.config.showDealSummary,
      },
    };
  },
});

/**
 * Public: resolve composed page for a lender delivery token.
 */
export const resolveCompositionForLenderDelivery = query({
  args: {
    token: v.string(),
  },
  returns: compositionResultV,
  handler: async (ctx, { token }) => {
    const trimmed = normalizePortalToken(token);
    if (!trimmed) return { status: "not_found" as const, sections: [] };
    const tokenHash = await sha256Hex(trimmed);

    let pipelineFileId: Id<"pipeline"> | null = null;
    let outstandingCount = 0;

    const link = await loadLinkByTokenHash(ctx, tokenHash);
    if (link?.lenderDeliveryTokenId) {
      pipelineFileId = link.pipelineFileId;
      const delivery = await ctx.db.get(link.lenderDeliveryTokenId);
      if (delivery) {
        outstandingCount = delivery.includedDocumentIds.length;
      }
    } else {
      const legacy = await ctx.db
        .query("lenderDeliveryTokens")
        .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
        .first();
      if (!legacy) return { status: "not_found" as const, sections: [] };
      pipelineFileId = legacy.pipelineFileId;
      outstandingCount = legacy.includedDocumentIds.length;
    }

    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) return { status: "not_found" as const, sections: [] };

    const tpl = await findAssignedDefaultForFile(ctx, {
      pipelineFileId,
      organizationId: pipeline.organizationId,
      portalType: "lender",
    });
    if (!tpl) {
      return { status: "none" as const, sections: [] };
    }

    const sections = sanitizePortalPageSections(
      "lender",
      tpl.config.sections as PortalPageSectionInstance[] | undefined,
    ).filter((s) => s.enabled !== false);
    if (sections.length === 0) {
      return { status: "none" as const, sections: [] };
    }
    const chrome = sanitizePortalChrome("lender", tpl.config.chrome);

    const org = pipeline.organizationId
      ? await ctx.db.get(pipeline.organizationId)
      : null;
    const stage = await resolveStageLabel(ctx, pipeline);
    const primaryContact = await resolveOrgPrimaryContact(
      ctx,
      pipeline.organizationId,
      pipeline,
      sections,
    );

    return {
      status: "ok" as const,
      portalType: "lender" as const,
      defaultId: tpl._id,
      defaultName: tpl.name,
      sections,
      chrome,
      context: {
        ...stage,
        primaryContact: primaryContact ?? undefined,
        fileLabel:
          pipeline.fileName?.trim() ||
          pipeline.propertyAddress?.trim() ||
          "Loan file",
        workspaceName:
          org?.name?.trim() && org.name.trim().length > 0
            ? org.name.trim()
            : "Your lender",
        welcomeMessage: tpl.config.welcomeMessage,
        outstandingCount,
        statusVisibility: tpl.config.statusVisibility,
        allowMessaging: false,
        showDealSummary: tpl.config.showDealSummary ?? true,
      },
    };
  },
});
