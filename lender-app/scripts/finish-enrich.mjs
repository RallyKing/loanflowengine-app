/**
 * Resumes / completes OpenAI (enrich:enrichMissing) for all "incomplete" rows.
 * Uses execFile so JSON args are not mangled on Windows.
 *
 *   node scripts/finish-enrich.mjs
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (name, argObj) => {
  const s = JSON.stringify(argObj);
  // Windows: `npx` is a .cmd shim; use shell so spawn finds it.
  return execFileSync("npx", ["convex", "run", name, s], {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });
};

const pre = run("lenders:listIncomplete", { limit: 1 }).trim();
const first = JSON.parse(pre);
console.log(`In lenders missing programs or niche: ${first.total}\n`);

const batchArgs = {
  limit: 4,
  summaryOnly: true,
  delayMs: 900,
};

let b = 0;
let totOk = 0;
let totFail = 0;
let totFields = 0;
let allFailStreak = 0;

try {
  while (true) {
    const out = run("enrich:enrichMissing", batchArgs).trim();
    const o = JSON.parse(out);
    console.log(
      `Batch ${b}  processed=${o.total}  ok=${o.succeeded}  fail=${o.failed}  field-patches=${o.filled}`
    );
    totOk += o.succeeded;
    totFail += o.failed;
    totFields += o.filled;
    if (o.total === 0) {
      allFailStreak = 0;
      break;
    }
    if (o.total > 0 && o.succeeded === 0 && o.failed === o.total) {
      allFailStreak += 1;
      if (allFailStreak >= 40) {
        console.log(
          "Stopped: 40 consecutive batches with all calls failing — check OPENAI / SERPAPI keys and convex logs."
        );
        break;
      }
    } else {
      allFailStreak = 0;
    }
    b += 1;
    if (b > 2000) {
      console.log("Stopped: safety cap (2000 batches).");
      break;
    }
  }
} catch (e) {
  console.error(e);
  process.exit(1);
}

const post = run("lenders:listIncomplete", { limit: 1 }).trim();
const last = JSON.parse(post);
console.log(
  `\nDone. Remaining incomplete: ${last.total}  (total OK=${totOk} fail=${totFail} field-writes~=${totFields})`
);
