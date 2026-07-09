#!/usr/bin/env node
/**
 * Phase 24.3B — scan TSX for form controls with sub-16px typography hints.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const RISK_RE =
  /\b(text-xs|text-sm|text-\[(?:10|11|12|13|14|15)px)\b|text-dlc-label/;

const CONTROL_RE = /<(?:input|textarea|select)\b/i;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const findings = [];

for (const file of walk(root)) {
  const rel = path.relative(path.join(root, ".."), file).replace(/\\/g, "/");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!CONTROL_RE.test(lines[i])) continue;
    const window = lines.slice(i, Math.min(i + 8, lines.length)).join("\n");
    if (!RISK_RE.test(window)) continue;
    const typeMatch = lines[i].match(/type=["']([^"']+)["']/i);
    findings.push({
      path: rel,
      line: i + 1,
      control: typeMatch?.[1] ?? "text|textarea|select",
      snippet: lines[i].trim().slice(0, 120),
    });
  }
}

console.log(JSON.stringify({ count: findings.length, findings: findings.slice(0, 80) }, null, 2));
