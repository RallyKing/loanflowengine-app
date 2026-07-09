#!/usr/bin/env node
/**
 * Fail if any Convex source uses a raw args field in
 * `q.eq("normalizedUsername", …)` — index keys must come only from
 * normalizeUsername() (e.g. `usernameLower` locals or literals).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const convexRoot = path.resolve(__dirname, "../convex");

const SKIP_DIRS = new Set(["_generated", "node_modules"]);

const BAD = /\beq\s*\(\s*["']normalizedUsername["']\s*,\s*args\./;

function* walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      yield* walk(p);
    } else if (ent.name.endsWith(".ts")) {
      yield p;
    }
  }
}

function main() {
  const problems = [];
  for (const file of walk(convexRoot)) {
    const text = fs.readFileSync(file, "utf8");
    if (!BAD.test(text)) continue;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (BAD.test(lines[i])) {
        problems.push(
          `${path.relative(path.resolve(__dirname, ".."), file)}:${i + 1} — never eq("normalizedUsername", args.*); use normalizeUsername() first.`,
        );
      }
    }
  }
  if (problems.length) {
    console.error(
      "[verify-auth-username-index] FAILED:\n- " + problems.join("\n- "),
    );
    process.exit(1);
  }
  console.log("[verify-auth-username-index] OK — no raw username index args.");
}

main();
