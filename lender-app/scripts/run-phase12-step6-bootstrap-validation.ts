#!/usr/bin/env npx tsx
/**
 * Phase 12.2 Step 6 — live prod disposable bootstrap validation.
 */
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../lib/security/argon2";
import { normalizeUsername } from "../lib/auth/normalizeUsername";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const reportsDir = join(root, "..", "migration-reports");
mkdirSync(reportsDir, { recursive: true });

const JOSHUA_ORG = "mx76bxqnc23q76cb99tvrffmy58644pf";

function loadEnv(): Record<string, string> {
  const raw = readFileSync(join(root, ".env.local"), "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function signBridge(suffix: string) {
  const secret = process.env.AUTH_BRIDGE_SECRET?.trim();
  if (!secret) throw new Error("AUTH_BRIDGE_SECRET missing");
  const bridgePayload = `${Date.now()}|${randomBytes(8).toString("hex")}|${suffix}`;
  const bridgeProof = createHmac("sha256", secret)
    .update(bridgePayload, "utf8")
    .digest("hex");
  return { bridgePayload, bridgeProof };
}

function convexRun(fn: string, args: Record<string, unknown>) {
  const bin = join(root, "node_modules", "convex", "bin", "main.js");
  const result = spawnSync(process.execPath, [bin, "run", "--prod", fn, JSON.stringify(args)], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "convex run failed");
  }
  const text = (result.stdout || "").trim();
  const start = text.indexOf("{") >= 0 ? text.indexOf("{") : text.indexOf("[");
  return JSON.parse(text.slice(start)) as Record<string, unknown>;
}

function joshuaOrgSnapshot() {
  const inline = `const orgId="${JOSHUA_ORG}"; const members=await ctx.db.query("organizationMembers").withIndex("by_organization",q=>q.eq("organizationId",orgId)).collect(); const pipeline=await ctx.db.query("pipeline").withIndex("by_organization_createdAt",q=>q.eq("organizationId",orgId)).collect(); const tasks=await ctx.db.query("tasks").withIndex("by_organization",q=>q.eq("organizationId",orgId)).collect(); const activity=await ctx.db.query("activityFeed").withIndex("by_scope_at",q=>q.eq("scopeKind","org").eq("scopeId",orgId)).collect(); return { members: members.length, pipelineFiles: pipeline.length, tasks: tasks.length, activityOrgScoped: activity.length };`;
  const bin = join(root, "node_modules", "convex", "bin", "main.js");
  const wrapped = `export default query({ handler: async (ctx) => { ${inline} } });`;
  const result = spawnSync(process.execPath, [bin, "run", "--prod", "--inline-query", wrapped], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const text = (result.stdout || "").trim();
  const start = text.indexOf("{");
  return JSON.parse(text.slice(start));
}

async function main() {
  const env = loadEnv();
  process.env.AUTH_BRIDGE_SECRET = env.AUTH_BRIDGE_SECRET;
  const adminSecret = env.DATA_MIGRATION_ADMIN_SECRET;
  if (!adminSecret) throw new Error("DATA_MIGRATION_ADMIN_SECRET missing");

  const ts = Date.now();
  const baseUsername = `Phase12.Disposable.${ts}@dlc.test`;
  const orgName = `Phase12 Disposable ${ts}`;
  const password = "Phase12!DisposableTest99";
  const canon = normalizeUsername(baseUsername);

  const joshuaBefore = joshuaOrgSnapshot();
  const passwordHash = await hashPassword(password);
  const bridge = signBridge(`signup:${canon}:${orgName}`);

  const signupResult = convexRun("auth/signup:signup", {
    username: baseUsername,
    passwordHash,
    organizationName: orgName,
    bridgePayload: bridge.bridgePayload,
    bridgeProof: bridge.bridgeProof,
    ipHint: "phase12-step6",
  });

  const canonicalizationProof = [];
  for (const variant of [
    baseUsername,
    baseUsername.toUpperCase(),
    ` ${baseUsername} `,
    `  ${baseUsername.toUpperCase()}  `,
  ]) {
    const lookupBridge = signBridge(`login:${normalizeUsername(variant)}`);
    const lookup = convexRun("auth/loginBridge:loginLookup", {
      username: variant,
      bridgePayload: lookupBridge.bridgePayload,
      bridgeProof: lookupBridge.bridgeProof,
    }) as { found?: boolean; userId?: string };
    canonicalizationProof.push({
      input: variant,
      normalized: normalizeUsername(variant),
      found: lookup.found === true,
      userId: lookup.found ? lookup.userId : null,
      sameUserAsSignup:
        lookup.found && signupResult.userId
          ? lookup.userId === signupResult.userId
          : false,
    });
  }

  const audit = convexRun("auth/operatorAudit:verifyCleanBootstrap", {
    adminSecret,
    loginOrEmail: baseUsername,
  });

  const purge = convexRun("auth/operatorAudit:purgeDisposableBootstrapTest", {
    adminSecret,
    loginOrEmail: baseUsername,
    dryRun: false,
  });

  const postAudit = convexRun("auth/operatorAudit:verifyCleanBootstrap", {
    adminSecret,
    loginOrEmail: baseUsername,
  });

  const joshuaAfter = joshuaOrgSnapshot();

  const report = {
    generatedAt: Date.now(),
    disposableUsername: baseUsername,
    canonicalUsername: canon,
    joshuaOrgVerification: {
      before: joshuaBefore,
      after: joshuaAfter,
      unchanged: JSON.stringify(joshuaBefore) === JSON.stringify(joshuaAfter),
    },
    signupResult,
    canonicalizationProof,
    bootstrapAudit: audit,
    purgeResult: purge,
    postPurgeAudit: postAudit,
    deletionProof: {
      userGone: (postAudit as { authUserCount?: number }).authUserCount === 0,
      auditPass: (audit as { pass?: boolean }).pass === true,
    },
  };

  writeFileSync(
    join(reportsDir, "phase12-step6-bootstrap-validation.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
