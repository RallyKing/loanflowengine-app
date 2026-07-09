import { LOG_PREFIX } from "./constants";
import { redactDeep } from "./redact";

export type ObsLogLevel = "debug" | "info" | "warn" | "error";

export type ObsLogFields = Record<string, unknown>;

function line(level: ObsLogLevel, event: string, fields: ObsLogFields): string {
  return JSON.stringify({
    v: 1,
    level,
    event,
    ts: new Date().toISOString(),
    service: "lender-app",
    ...redactDeep(fields) as ObsLogFields,
  });
}

/**
 * Structured logs for Vercel / Node / Edge: one JSON object per line.
 * Never pass raw passwords, tokens, or cookie values — use `redactDeep` fields only.
 */
export function obsLog(
  level: ObsLogLevel,
  event: string,
  fields: ObsLogFields = {},
): void {
  const payload = line(level, event, fields);
  if (level === "error") {
    console.error(LOG_PREFIX, payload);
  } else if (level === "warn") {
    console.warn(LOG_PREFIX, payload);
  } else {
    console.info(LOG_PREFIX, payload);
  }
}

/** Convenience factory for scoped `requestId` / `correlationId`. */
export function obsLogWithTracing(ctx: {
  requestId?: string | null;
  correlationId?: string | null;
}) {
  const base = {
    requestId: ctx.requestId ?? undefined,
    correlationId: ctx.correlationId ?? undefined,
  };
  return {
    debug: (event: string, fields?: ObsLogFields) =>
      obsLog("debug", event, { ...base, ...fields }),
    info: (event: string, fields?: ObsLogFields) =>
      obsLog("info", event, { ...base, ...fields }),
    warn: (event: string, fields?: ObsLogFields) =>
      obsLog("warn", event, { ...base, ...fields }),
    error: (event: string, fields?: ObsLogFields) =>
      obsLog("error", event, { ...base, ...fields }),
  };
}
