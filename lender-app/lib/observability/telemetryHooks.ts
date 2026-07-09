import { redactDeep } from "./redact";
import { obsLog } from "./logger";

type HookPayload = Record<string, unknown>;

/**
 * Optional outbound hooks for uptime / APM / Slack-style monitors.
 * Set `DLC_TELEMETRY_WEBHOOK_URL` to POST JSON on selected events (no secrets in body).
 */
export async function emitTelemetryHook(
  event: string,
  payload: HookPayload,
): Promise<void> {
  const url = process.env.DLC_TELEMETRY_WEBHOOK_URL?.trim();
  obsLog("debug", event, redactDeep(payload) as HookPayload);
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        v: 1,
        event,
        ts: new Date().toISOString(),
        payload: redactDeep(payload),
      }),
    });
  } catch (e) {
    obsLog("warn", "telemetry.hook_failed", {
      event,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
