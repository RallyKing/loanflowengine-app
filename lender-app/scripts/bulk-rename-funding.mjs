import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SKIP = new Set(["node_modules", ".next", "_generated"]);

const REPLACEMENTS = [
  ["loanAmountMin", "fundingAmountMin"],
  ["loanAmountMax", "fundingAmountMax"],
  ["loan_amount_min", "funding_amount_min"],
  ["loan_amount_max", "funding_amount_max"],
  ["Loan Amount - Min", "Funding amount - Min"],
  ["Loan Amount - Max", "Funding amount - Max"],
  ["loanAmountText", "fundingAmountText"],
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|cjs|md)$/.test(ent.name)) out.push(p);
  }
  return out;
}

let files = 0;
for (const f of walk(ROOT)) {
  let s = fs.readFileSync(f, "utf8");
  const orig = s;
  for (const [a, b] of REPLACEMENTS) s = s.split(a).join(b);
  if (s !== orig) {
    fs.writeFileSync(f, s);
    files += 1;
    console.log(f.slice(ROOT.length + 1));
  }
}
console.log("files updated (phase 1):", files);

/** Phase 2: word-boundary `loanAmount` → `fundingAmount` (pipeline, cover, DTI, etc.). */
const MATH_SKIP = new Set([
  path.join(ROOT, "lib", "intake", "finance.ts"),
]);
let p2 = 0;
for (const f of walk(ROOT)) {
  if (MATH_SKIP.has(f)) continue;
  let s = fs.readFileSync(f, "utf8");
  const orig = s;
  s = s.replace(/\bloanAmount\b/g, "fundingAmount");
  if (s !== orig) {
    fs.writeFileSync(f, s);
    p2 += 1;
    console.log("p2", f.slice(ROOT.length + 1));
  }
}
console.log("files updated (phase 2):", p2);
