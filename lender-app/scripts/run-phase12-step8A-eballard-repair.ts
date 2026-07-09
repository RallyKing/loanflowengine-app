#!/usr/bin/env npx tsx
/**
 * Phase 12.2 Step 8A — audit, repair, validate eballard re-invite.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../lib/security/argon2";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const reportsDir = join(root, "..", "migration-reports");
mkdirSync(reportsDir, { recursive: true });

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of [".env.local", ".env.testing"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      const k = t.slice(0, i).trim();
      if (!env[k]) env[k] = v;
    }
  }
  return env;
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

async function main() {
  const env = loadEnv();
  const adminSecret = env.DATA_MIGRATION_ADMIN_SECRET;
  if (!adminSecret) throw new Error("DATA_MIGRATION_ADMIN_SECRET missing");

  const beforeAudit = convexRun("operator/auditEballardReinviteStep8A:auditEballardReinvite", {
    adminSecret,
  });

  const diagnose = convexRun("auth/operatorDiagnose:diagnoseAuthUserByLogin", {
    adminSecret,
    loginOrEmail: "joshuaeballard@gmail.com",
  });

  const repairDry = convexRun("operator/auditEballardReinviteStep8A:repairEballardMembership", {
    adminSecret,
    dryRun: true,
  });

  const repairLive = convexRun("operator/auditEballardReinviteStep8A:repairEballardMembership", {
    adminSecret,
    dryRun: false,
  });

  const testPassword =
    env.EBALLARD_TEST_PASSWORD?.trim() || "Phase12Step8A!Reinvite2026";
  const passwordHash = await hashPassword(testPassword);

  const reinviteCycle = convexRun(
    "operator/auditEballardReinviteStep8A:validateEballardReinviteCycle",
    {
      adminSecret,
      actorUserKey: "ts719yfyv2b6020avvctpw0ns586exm6",
      passwordHash,
    },
  );

  const afterAudit = convexRun("operator/auditEballardReinviteStep8A:auditEballardReinvite", {
    adminSecret,
  });

  const report = {
    generatedAt: Date.now(),
    testPasswordUsed: testPassword.replace(/./g, "*"),
    beforeAudit,
    diagnose,
    repairDry,
    repairLive,
    reinviteCycle,
    afterAudit,
  };

  writeFileSync(
    join(reportsDir, "phase12-step8A-eballard-repair.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
