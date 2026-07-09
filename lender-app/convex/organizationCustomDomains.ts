import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { internal, api } from "./_generated/api";
import { assertOrgPermission } from "./organizationRbac";

const MAX_HOSTNAME_LEN = 253;
const MAX_DOMAINS_PER_ORG = 3;

export function normalizeHostname(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("://")) {
    try {
      s = new URL(s).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  if (s.includes(":")) s = s.split(":")[0] ?? s;
  if (!s || s.length > MAX_HOSTNAME_LEN) return null;
  if (s === "localhost" || s.startsWith("127.") || s.endsWith(".local")) {
    return null;
  }
  const host = s.replace(/\.$/, "");
  const labels = host.split(".");
  if (labels.length < 2) return null;
  for (const label of labels) {
    if (label.length < 1 || label.length > 63) return null;
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label)) return null;
  }
  return host;
}

function verificationTxtName(hostname: string): string {
  return `_lender-verify.${hostname}`;
}

async function orgBrandingPayload(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
) {
  const org = await ctx.db.get(orgId);
  if (!org) return null;
  const b = org.branding;
  let logoUrl: string | null = null;
  if (b?.logoStorageId) {
    try {
      logoUrl = await ctx.storage.getUrl(b.logoStorageId);
    } catch (err) {
      console.error(
        "[orgBrandingPayload] storage.getUrl failed",
        String(orgId),
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return {
    headerTitle: (b?.appName?.trim() || org.name).slice(0, 120),
    logoUrl,
    primaryHex: b?.primaryColor ?? null,
    secondaryHex: b?.secondaryColor ?? null,
  };
}

/** Public: active custom hostname → Convex organization id (for middleware / CDN). */
export const resolveHostToOrganizationId = query({
  args: { hostname: v.string() },
  handler: async (ctx, { hostname }) => {
    const norm = normalizeHostname(hostname);
    if (!norm) return null;
    const row = await ctx.db
      .query("organizationCustomDomains")
      .withIndex("by_hostname", (q) => q.eq("hostname", norm))
      .first();
    if (!row || row.status !== "active") return null;
    return row.organizationId;
  },
});

/** Public: hostname → Convex organization id for client bootstrap on custom domains. */
export const resolveHostBinding = query({
  args: { hostname: v.string() },
  handler: async (ctx, { hostname }) => {
    const norm = normalizeHostname(hostname);
    if (!norm) return null;
    const row = await ctx.db
      .query("organizationCustomDomains")
      .withIndex("by_hostname", (q) => q.eq("hostname", norm))
      .first();
    if (!row || row.status !== "active") return null;
    return {
      organizationId: row.organizationId,
    };
  },
});

/** Public: branding for sign-in and unauthenticated views on a mapped host. */
export const brandingForHostname = query({
  args: { hostname: v.string() },
  handler: async (ctx, { hostname }) => {
    const norm = normalizeHostname(hostname);
    if (!norm) return null;
    const row = await ctx.db
      .query("organizationCustomDomains")
      .withIndex("by_hostname", (q) => q.eq("hostname", norm))
      .first();
    if (!row || row.status !== "active") return null;
    return await orgBrandingPayload(ctx, row.organizationId);
  },
});

export const listForOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await assertOrgPermission(
      ctx,
      organizationId,
      memberUserKey,
      "settings.access",
    );
    return await ctx.db
      .query("organizationCustomDomains")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
  },
});

export const requestCustomDomain = mutation({
  args: {
    organizationId: v.id("organizations"),
    hostname: v.string(),
    actorUserKey: v.string(),
  },
  handler: async (ctx, { organizationId, hostname, actorUserKey }) => {
    await assertOrgPermission(
      ctx,
      organizationId,
      actorUserKey,
      "settings.access",
    );
    const org = await ctx.db.get(organizationId);
    if (!org) throw new Error("Organization not found.");

    const norm = normalizeHostname(hostname);
    if (!norm) {
      throw new Error("Enter a valid hostname (e.g. app.client.com).");
    }

    const existingHost = await ctx.db
      .query("organizationCustomDomains")
      .withIndex("by_hostname", (q) => q.eq("hostname", norm))
      .first();
    if (existingHost && existingHost.organizationId !== organizationId) {
      throw new Error("That hostname is already registered to another workspace.");
    }
    if (
      existingHost &&
      existingHost.organizationId === organizationId &&
      existingHost.status !== "disabled"
    ) {
      throw new Error("This hostname is already on file for your team.");
    }

    const current = await ctx.db
      .query("organizationCustomDomains")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
    const activeCount = current.filter((r) => r.status !== "disabled").length;
    if (activeCount >= MAX_DOMAINS_PER_ORG) {
      throw new Error(`You can register at most ${MAX_DOMAINS_PER_ORG} domains.`);
    }

    const token = [...crypto.getRandomValues(new Uint8Array(18))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const now = Date.now();

    if (existingHost?.status === "disabled") {
      await ctx.db.patch(existingHost._id, {
        hostname: norm,
        status: "pending",
        verificationToken: token,
        updatedAt: now,
        verifiedAt: undefined,
      });
      await ctx.db.patch(organizationId, { updatedAt: now });
      return {
        domainId: existingHost._id,
        txtName: verificationTxtName(norm),
        txtValue: `lender-verify=${token}`,
      };
    }

    const domainId = await ctx.db.insert("organizationCustomDomains", {
      organizationId,
      hostname: norm,
      status: "pending",
      verificationToken: token,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(organizationId, { updatedAt: now });
    return {
      domainId,
      txtName: verificationTxtName(norm),
      txtValue: `lender-verify=${token}`,
    };
  },
});

export const scheduleTxtVerification = mutation({
  args: {
    domainId: v.id("organizationCustomDomains"),
    actorUserKey: v.string(),
  },
  handler: async (ctx, { domainId, actorUserKey }) => {
    const row = await ctx.db.get(domainId);
    if (!row) throw new Error("Domain not found.");
    await assertOrgPermission(
      ctx,
      row.organizationId,
      actorUserKey,
      "settings.access",
    );
    if (row.status !== "pending") {
      throw new Error("Only pending domains can be verified.");
    }
    await ctx.scheduler.runAfter(
      0,
      internal.organizationCustomDomains.verifyTxtJob,
      { domainId },
    );
    return { ok: true as const };
  },
});

export const disableCustomDomain = mutation({
  args: {
    domainId: v.id("organizationCustomDomains"),
    actorUserKey: v.string(),
  },
  handler: async (ctx, { domainId, actorUserKey }) => {
    const row = await ctx.db.get(domainId);
    if (!row) throw new Error("Domain not found.");
    await assertOrgPermission(
      ctx,
      row.organizationId,
      actorUserKey,
      "settings.access",
    );
    await ctx.db.patch(domainId, {
      status: "disabled",
      updatedAt: Date.now(),
    });
    await ctx.db.patch(row.organizationId, { updatedAt: Date.now() });
    return { ok: true as const };
  },
});

export const getByIdInternal = internalQuery({
  args: { domainId: v.id("organizationCustomDomains") },
  handler: async (ctx, { domainId }) => {
    return await ctx.db.get(domainId);
  },
});

export const markActiveInternal = internalMutation({
  args: { domainId: v.id("organizationCustomDomains") },
  handler: async (ctx, { domainId }) => {
    const row = await ctx.db.get(domainId);
    if (!row || row.status !== "pending") return;
    const now = Date.now();
    await ctx.db.patch(domainId, {
      status: "active",
      verifiedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(row.organizationId, { updatedAt: now });
  },
});

function txtAnswerContainsToken(answerData: string, token: string): boolean {
  const raw = answerData.replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"');
  return (
    raw.includes(`lender-verify=${token}`) ||
    raw.includes(token)
  );
}

/** Optional: register hostname on the Vercel project (Convex env: VERCEL_API_TOKEN, VERCEL_PROJECT_ID). */
export const registerWithVercelProject = action({
  args: {
    domainId: v.id("organizationCustomDomains"),
    actorUserKey: v.string(),
  },
  handler: async (ctx, { domainId, actorUserKey }): Promise<
    | { ok: true; skipped: true; detail: string }
    | { ok: true; configured: true }
    | { ok: false; detail: string }
  > => {
    const row = await ctx.runQuery(internal.organizationCustomDomains.getByIdInternal, {
      domainId,
    });
    if (!row) return { ok: false, detail: "Domain not found." };
    await ctx.runQuery(api.organizationCustomDomains.assertSettingsAccessForAction, {
      organizationId: row.organizationId,
      memberUserKey: actorUserKey,
    });

    const token = process.env.VERCEL_API_TOKEN?.trim();
    const projectId = process.env.VERCEL_PROJECT_ID?.trim();
    if (!token || !projectId) {
      return {
        ok: true,
        skipped: true,
        detail:
          "Set VERCEL_API_TOKEN and VERCEL_PROJECT_ID on this Convex deployment to register domains via API. You can still add the domain manually in the Vercel dashboard.",
      };
    }

    const res = await fetch(
      `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/domains`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: row.hostname }),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        detail: text.slice(0, 400) || `Vercel API HTTP ${res.status}`,
      };
    }
    return { ok: true, configured: true };
  },
});

export const assertSettingsAccessForAction = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "settings.access",
    );
    return true;
  },
});

export const verifyTxtJob = internalAction({
  args: { domainId: v.id("organizationCustomDomains") },
  handler: async (ctx, { domainId }) => {
    const row = await ctx.runQuery(
      internal.organizationCustomDomains.getByIdInternal,
      { domainId },
    );
    if (!row || row.status !== "pending") return;

    const name = verificationTxtName(row.hostname);
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(
      name,
    )}&type=TXT`;
    let answers: { data?: string }[] = [];
    try {
      const res = await fetch(url, {
        headers: { accept: "application/dns-json" },
      });
      if (!res.ok) return;
      const json = (await res.json()) as { Answer?: { data?: string }[] };
      answers = json.Answer ?? [];
    } catch {
      return;
    }

    const ok = answers.some((a) =>
      txtAnswerContainsToken(String(a.data ?? ""), row.verificationToken),
    );
    if (!ok) return;

    await ctx.runMutation(internal.organizationCustomDomains.markActiveInternal, {
      domainId,
    });
  },
});
