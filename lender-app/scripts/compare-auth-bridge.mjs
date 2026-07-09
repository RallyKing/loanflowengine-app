import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const convex = execSync("npx convex env get AUTH_BRIDGE_SECRET", {
  cwd: root,
  encoding: "utf8",
})
  .replace(/\r/g, "")
  .trim();
const raw = readFileSync(join(root, ".env.local"), "utf8");
const m = raw.match(/^AUTH_BRIDGE_SECRET=(.*)$/m);
let local = m?.[1]?.trim() ?? "";
if (
  (local.startsWith('"') && local.endsWith('"')) ||
  (local.startsWith("'") && local.endsWith("'"))
) {
  local = local.slice(1, -1);
}
console.log(
  JSON.stringify({
    equal: convex === local,
    lenConvex: convex.length,
    lenLocal: local.length,
  }),
);
