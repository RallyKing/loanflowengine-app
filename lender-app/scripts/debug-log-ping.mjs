/**
 * Writes one NDJSON line to `lender-app/debug-f25461.log` (no Next.js).
 * Use when verifying the Cursor workspace can see session logs: `npm run debug:log-ping`
 */
import { appendFile } from "node:fs/promises";
import { join } from "node:path";

const logPath = join(process.cwd(), "debug-f25461.log");
const ndPath = join(process.cwd(), "debug-f25461.ndjson");
const line =
  JSON.stringify({
    sessionId: "f25461",
    hypothesisId: "H_cli_log_ping",
    location: "scripts/debug-log-ping.mjs",
    message: "CLI ping (Next /api/debug-agent-log not required)",
    data: { cwd: process.cwd() },
    timestamp: Date.now(),
  }) + "\n";

await appendFile(logPath, line, "utf8");
await appendFile(ndPath, line, "utf8");
console.log("debug-log-ping wrote:", logPath);
console.log("debug-log-ping mirror:", ndPath);
