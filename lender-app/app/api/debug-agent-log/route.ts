import { appendFile } from "fs/promises";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";

/** Session NDJSON — workspace root (preferred) and fallbacks for dev servers / OS. */
const LOG_BASENAME = "debug-f25461.log";

function candidateLogPaths(): string[] {
  const cwd = process.cwd();
  const envRaw = process.env.DEBUG_AGENT_LOG_PATH?.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (p: string) => {
    const abs = path.resolve(p);
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push(abs);
  };

  /**
   * 1) `next dev` cwd is usually `lender-app/` — write here first so the log stays
   * inside the opened project even when env/workspace-root resolution differs.
   */
  push(path.join(cwd, LOG_BASENAME));

  if (envRaw && envRaw.length > 0) {
    const envPath = path.isAbsolute(envRaw)
      ? envRaw
      : path.normalize(path.join(cwd, envRaw));
    push(envPath);
  }

  let dir = path.resolve(cwd);
  for (let i = 0; i < 16; i++) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
    push(path.join(dir, LOG_BASENAME));
  }
  push(path.join(os.tmpdir(), LOG_BASENAME));
  return out;
}
/** Hard cap for one NDJSON line (component stacks + `data.stack`). */
const MAX_PAYLOAD_BYTES = 64_000;

async function appendSessionLogLine(
  rawTrimmed: string,
): Promise<{ ok: true; path: string; tried: string[] } | { ok: false; tried: string[] }> {
  const line = `${rawTrimmed}\n`;
  const tried: string[] = [];
  for (const logPath of candidateLogPaths()) {
    tried.push(logPath);
    try {
      await appendFile(logPath, line, "utf8");
      try {
        const mirror = path.join(process.cwd(), "debug-f25461.ndjson");
        if (path.resolve(mirror) !== path.resolve(logPath)) {
          await appendFile(mirror, line, "utf8");
        }
      } catch {
        /* best-effort: *.ndjson is not gitignored like *.log on some setups */
      }
      return { ok: true, path: logPath, tried };
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[debug-agent-log] append failed:", logPath, err);
      }
    }
  }
  return { ok: false, tried };
}

/** Dev-only: open in browser to verify the server can append `debug-f25461.log` (no client JS). */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  const payload = JSON.stringify({
    sessionId: "f25461",
    hypothesisId: "H_server_dev_ping",
    location: "debug-agent-log/route.ts:GET",
    message: "server append probe",
    data: { cwd: process.cwd() },
    timestamp: Date.now(),
  });
  const result = await appendSessionLogLine(payload);
  if (!result.ok) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[debug-agent-log] GET probe write failed; client should have localStorage mirror",
        result.tried,
      );
    }
    return NextResponse.json(
      { ok: false, tried: result.tried },
      { status: 500 },
    );
  }
  if (process.env.NODE_ENV === "development") {
    console.info("[debug-agent-log] GET probe wrote", result.path);
  }
  return NextResponse.json({
    ok: true,
    path: result.path,
    tried: result.tried,
    debug: {
      cwd: process.cwd(),
      DEBUG_AGENT_LOG_PATH: process.env.DEBUG_AGENT_LOG_PATH ?? null,
    },
  });
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  const raw = await req.text();
  if (raw.length > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "payload too large" }, { status: 413 });
  }
  const trimmed = raw.trim();

  if (process.env.NODE_ENV === "development") {
    try {
      const j = JSON.parse(trimmed) as { hypothesisId?: string; message?: string };
      console.info(
        "[debug-agent-log] ingest",
        j.hypothesisId ?? "?",
        (j.message ?? "").slice(0, 100),
      );
    } catch {
      console.info("[debug-agent-log] ingest (non-json)", trimmed.slice(0, 120));
    }
  }

  const result = await appendSessionLogLine(trimmed);
  if (!result.ok) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[debug-agent-log] write failed; client should have localStorage mirror",
        result.tried,
      );
    }
    return NextResponse.json({ ok: false, tried: result.tried }, { status: 500 });
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[debug-agent-log] wrote", result.path);
  }

  return NextResponse.json({ ok: true, path: result.path });
}
