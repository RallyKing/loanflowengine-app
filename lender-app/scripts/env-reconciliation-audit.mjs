/**
 * Phase-1 env reconciliation: URLs, Convex slug, secret presence + SHA-256 prefix (8 hex chars).
 * Does not print raw secrets. Run from lender-app/: node scripts/env-reconciliation-audit.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fp(s) {
  if (!s || typeof s !== "string") return null;
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 8);
}

function hostFromConvexUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    return new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function slugFromCloudHostname(host) {
  if (!host || !host.endsWith(".convex.cloud")) return null;
  return host.slice(0, -".convex.cloud".length);
}

function parseEnvFile(absPath) {
  if (!existsSync(absPath)) return {};
  const o = {};
  for (const line of readFileSync(absPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    o[k] = v;
  }
  return o;
}

const paths = {
  envLocal: join(root, ".env.local"),
  convexProd: join(root, ".env.convex.prod"),
  vercelPull: join(root, ".env.vercel.production.pull"),
};

const report = { sources: {}, derived: {} };

for (const [name, abs] of Object.entries(paths)) {
  const e = parseEnvFile(abs);
  report.sources[name] = {
    path: abs.replace(/\\/g, "/"),
    exists: existsSync(abs),
    NEXT_PUBLIC_CONVEX_URL: e.NEXT_PUBLIC_CONVEX_URL ?? null,
    CONVEX_DEPLOYMENT: e.CONVEX_DEPLOYMENT ?? null,
    AUTH_BRIDGE_SECRET: {
      present: Boolean(e.AUTH_BRIDGE_SECRET?.length),
      length: e.AUTH_BRIDGE_SECRET?.length ?? 0,
      sha256_prefix_8: fp(e.AUTH_BRIDGE_SECRET),
    },
    DATA_MIGRATION_ADMIN_SECRET_present: Boolean(
      e.DATA_MIGRATION_ADMIN_SECRET?.length,
    ),
    ORG_INTEGRITY_ADMIN_SECRET_present: Boolean(
      e.ORG_INTEGRITY_ADMIN_SECRET?.length,
    ),
    APP_AUTH_variables: Object.keys(e).filter((k) => k.startsWith("APP_AUTH_")),
    VERCEL_ENV: e.VERCEL_ENV ?? null,
  };
}

const vercel = parseEnvFile(paths.vercelPull);
const convexProd = parseEnvFile(paths.convexProd);
const local = parseEnvFile(paths.envLocal);

report.derived.frontend_production_bundle_target = {
  hostname: hostFromConvexUrl(vercel.NEXT_PUBLIC_CONVEX_URL),
  slug: slugFromCloudHostname(hostFromConvexUrl(vercel.NEXT_PUBLIC_CONVEX_URL)),
  url: vercel.NEXT_PUBLIC_CONVEX_URL ?? null,
  source: existsSync(paths.vercelPull) ? "vercel_env_pull" : null,
};

if (
  !report.derived.frontend_production_bundle_target.url &&
  convexProd.NEXT_PUBLIC_CONVEX_URL
) {
  report.derived.frontend_production_bundle_target = {
    hostname: hostFromConvexUrl(convexProd.NEXT_PUBLIC_CONVEX_URL),
    slug: slugFromCloudHostname(
      hostFromConvexUrl(convexProd.NEXT_PUBLIC_CONVEX_URL),
    ),
    url: convexProd.NEXT_PUBLIC_CONVEX_URL ?? null,
    source: ".env.convex.prod_fallback_no_vercel_pull",
  };
}

report.derived.operator_template_convex_prod = {
  hostname: hostFromConvexUrl(convexProd.NEXT_PUBLIC_CONVEX_URL),
  slug:
    convexProd.CONVEX_DEPLOYMENT?.trim() ||
    slugFromCloudHostname(hostFromConvexUrl(convexProd.NEXT_PUBLIC_CONVEX_URL)),
  CONVEX_DEPLOYMENT: convexProd.CONVEX_DEPLOYMENT ?? null,
  url: convexProd.NEXT_PUBLIC_CONVEX_URL ?? null,
};

report.derived.local_dev_next_public = {
  hostname: hostFromConvexUrl(local.NEXT_PUBLIC_CONVEX_URL),
  slug: slugFromCloudHostname(hostFromConvexUrl(local.NEXT_PUBLIC_CONVEX_URL)),
  url: local.NEXT_PUBLIC_CONVEX_URL ?? null,
};

report.derived.slug_alignment = {
  vercel_pull_vs_convex_prod:
    report.derived.frontend_production_bundle_target.slug ===
    report.derived.operator_template_convex_prod.slug,
  vercel_pull_vs_local_env_local:
    report.derived.frontend_production_bundle_target.slug ===
    report.derived.local_dev_next_public.slug,
};

report.notes = {
  vercel_env_pull_sensitive:
    "vercel env pull writes empty strings for encrypted/sensitive vars — do not use pull files to fingerprint AUTH_BRIDGE_SECRET or APP_AUTH_*.",
  local_vs_prod:
    ".env.local intentionally targets local Convex (127.0.0.1) while Vercel production targets basic-anaconda-984; this is not a production mismatch.",
};

console.log(JSON.stringify(report, null, 2));
