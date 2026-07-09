/**
 * Restore a completed backup snapshot into the current Convex deployment using
 * `npx convex import` (preserves `_id` / `_creationTime` when present in NDJSON).
 *
 * Prerequisites:
 * - Run from `lender-app/` with Convex CLI logged in (`npx convex dev` once).
 * - Set DATA_BACKUP_ADMIN_SECRET (same value as Convex env DATA_BACKUP_ADMIN_SECRET).
 *
 * Usage:
 *   DATA_BACKUP_ADMIN_SECRET=... npx tsx scripts/restore-data-backup.mts <snapshotId> [--prod]
 *
 * Recommended: run `requestManualBackup` first so a fresh snapshot exists before overwriting.
 */
import { spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const snapshotId = process.argv[2];
const prod = process.argv.includes("--prod");
const adminSecret = process.env.DATA_BACKUP_ADMIN_SECRET?.trim() ?? "";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function runConvex(args: string[], inherit = false): string {
  const r = spawnSync("npx", ["convex", ...args], {
    cwd: root,
    encoding: "utf-8",
    shell: true,
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (!inherit && r.status !== 0) {
    throw new Error((r.stderr || r.stdout || "convex failed").trim());
  }
  return (r.stdout ?? "").trim();
}

async function downloadToFile(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}`);
  if (!res.body) throw new Error("Download had no body");
  const body = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  await pipeline(body, createWriteStream(dest));
}

async function main() {
  if (!snapshotId || !adminSecret) {
    console.error(
      "Usage: DATA_BACKUP_ADMIN_SECRET=... npx tsx scripts/restore-data-backup.mts <snapshotId> [--prod]",
    );
    process.exit(1);
  }

  const argsJson = JSON.stringify({ adminSecret, snapshotId });
  const raw = runConvex(["run", "dataBackup:getRestorePlanJson", "--args", argsJson]);
  let plan: {
    parts: Array<{ tableName: string; sequence: number; url: string }>;
    importOrder: string[];
  };
  try {
    plan = JSON.parse(raw) as typeof plan;
  } catch {
    throw new Error(
      `Could not parse Convex output as JSON. Is the CLI logged in? Raw:\n${raw.slice(0, 500)}`,
    );
  }

  const byTable = new Map<string, Array<{ sequence: number; url: string }>>();
  for (const p of plan.parts) {
    const list = byTable.get(p.tableName) ?? [];
    list.push({ sequence: p.sequence, url: p.url });
    byTable.set(p.tableName, list);
  }

  const order = plan.importOrder.filter((t) => byTable.has(t));
  const tmp = mkdtempSync(path.join(tmpdir(), "convex-restore-"));
  mkdirSync(path.join(tmp, "parts"), { recursive: true });

  try {
    for (const tableName of order) {
      const chunks = (byTable.get(tableName) ?? []).sort(
        (a, b) => a.sequence - b.sequence,
      );
      for (let i = 0; i < chunks.length; i++) {
        const file = path.join(tmp, "parts", `${tableName}-${i}.jsonl`);
        await downloadToFile(chunks[i]!.url, file);
        const mode = i === 0 ? "--replace" : "--append";
        const importArgs = [
          "import",
          ...(prod ? ["--prod"] : []),
          "-y",
          "--format",
          "jsonLines",
          mode,
          "--table",
          tableName,
          file,
        ];
        console.error(
          `Importing ${tableName} chunk ${i + 1}/${chunks.length} (${mode})…`,
        );
        runConvex(importArgs, true);
      }
    }
    console.error("Restore finished.");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
