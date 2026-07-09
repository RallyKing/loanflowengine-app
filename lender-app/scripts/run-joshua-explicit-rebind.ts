/**
 * Run production graph rebind for joshua@directlendingconnection.com (explicit ids).
 *
 * Dry run (default):
 *   npx tsx scripts/run-joshua-explicit-rebind.ts
 *
 * Execute:
 *   npx tsx scripts/run-joshua-explicit-rebind.ts --execute
 *
 * Optional: surface pipeline rows (clear archive + snooze) in default views:
 *   npx tsx scripts/run-joshua-explicit-rebind.ts --execute --surface-pipeline
 *
 * Writes ../docs/final-convex-data-rebind-report.md (repo root docs/)
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl.js";
import {
  loadAdminSecret,
  loadConvexUrlRaw,
  lenderAppRoot,
  printMissingAdminSecretDiagnostics,
} from "./lib/migrationOperatorEnv.js";

function convexUrlPreferProdSync(): string | undefined {
  const prodPath = join(lenderAppRoot, ".env.convex.prod");
  if (existsSync(prodPath)) {
    for (const line of readFileSync(prodPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      if (t.slice(0, i).trim() !== "NEXT_PUBLIC_CONVEX_URL") continue;
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (v) return v;
    }
  }
  return loadConvexUrlRaw();
}

async function main() {
  const execute = process.argv.includes("--execute");
  const surface = process.argv.includes("--surface-pipeline");
  const secret = loadAdminSecret();
  if (!secret) {
    printMissingAdminSecretDiagnostics();
    process.exit(1);
  }

  const urlRaw = convexUrlPreferProdSync() ?? loadConvexUrlRaw();
  const parsed = parseConvexPublicUrl(urlRaw ?? "");
  if (!parsed.ok) {
    console.error("Invalid or missing NEXT_PUBLIC_CONVEX_URL");
    process.exit(1);
  }

  const client = new ConvexHttpClient(parsed.href);

  const dryResult = await client.mutation(
    api.migrations.rebindJoshuaExplicitGraph.rebindExplicitGraph,
    {
      adminSecret: secret,
      dryRun: true,
      surfacePipelineRowsInDefaultViews: surface,
    },
  );

  let execResult: typeof dryResult | null = null;
  if (execute) {
    execResult = await client.mutation(
      api.migrations.rebindJoshuaExplicitGraph.rebindExplicitGraph,
      {
        adminSecret: secret,
        dryRun: false,
        surfacePipelineRowsInDefaultViews: surface,
      },
    );
  }

  let integrityAfter: unknown = null;
  if (execute) {
    try {
      integrityAfter = await client.query(api.dataMigration.integrityAudit, {
        adminSecret: secret,
        scanLimitPerTable: 50_000,
      });
    } catch {
      integrityAfter = { note: "integrityAudit failed — check ORG_INTEGRITY / admin secret alignment." };
    }
  }

  const workspaceDocs = join(lenderAppRoot, "..", "docs");
  mkdirSync(workspaceDocs, { recursive: true });
  const outPath = join(workspaceDocs, "final-convex-data-rebind-report.md");

  const body = `# Final Convex data rebind report

_Generated: ${new Date().toISOString()}_

**Convex deployment:** \`${parsed.href}\`

## Operator actions

- **Dry run:** ${execute ? "completed then execute" : "only (no writes)"}
- **Surface pipeline (clear archive/snooze):** ${surface ? "yes" : "no"}
- **Mutation:** \`migrations/rebindJoshuaExplicitGraph:rebindExplicitGraph\`

## Schema recovery note

If \`convex/schema.ts\` was reverted from local history, this workspace may have been repaired by re-adding native \`authUsers\` / \`dataMigration*\` / \`organizationPermissions\` / nav tables required by the current codebase. **Deploy this schema** before relying on parity with production.

## dryRun: true (plan)

\`\`\`json
${JSON.stringify(dryResult, null, 2)}
\`\`\`

${
  execResult
    ? `## execute: true (applied)

\`\`\`json
${JSON.stringify(execResult, null, 2)}
\`\`\`
`
    : ""
}

${
  integrityAfter
    ? `## integrityAudit (post-execute snapshot)

\`\`\`json
${JSON.stringify(integrityAfter, null, 2)}
\`\`\`
`
    : ""
}

## Visibility rationale (code-traced)

- Pipeline list uses \`filterPipelineRowsForMember\` in \`convex/organizationAccess.ts\`: non–view-all members only see files with empty \`ownerUserKey\`, \`ownerUserKey === memberUserKey\`, or an explicit \`pipelineFileShares\` row. This migration sets \`ownerUserKey\` to the canonical \`authUsers\` id and \`organizationId\` to \`mx76bxqnc23q76cb99tvrffmy58644pf\` for the expanded graph.
- Contacts list is scoped by \`organizationId\` (\`convex/contacts.ts\`).

## Manual verification

1. Log in as \`joshua@directlendingconnection.com\` (case-insensitive).
2. Confirm pipeline files, contacts, lenders, tasks, ledger, activity, and search for the named deals.

`;

  writeFileSync(outPath, body, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify({ ok: true, execute, drySummary: dryResult.expandedCounts }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
