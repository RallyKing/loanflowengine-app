/**
 * Phase 18.8A — stable Convex error → user-facing message mapping.
 * Keeps UI actionable without leaking stack traces.
 */

import { OFFLINE_CONFLICT_ERROR } from "@/lib/offline/conflict";

function rawConvexMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const anyErr = error as Record<string, unknown>;
    const data = anyErr.data;
    if (typeof data === "string" && data.trim()) return data.trim();
    // ConvexError often nests: { data: { message } } or plain string data.
    if (data && typeof data === "object") {
      const nested = data as Record<string, unknown>;
      if (typeof nested.message === "string" && nested.message.trim()) {
        return nested.message.trim();
      }
    }
  }
  return error instanceof Error ? error.message : String(error);
}

function extractServerDetail(raw: string): string | null {
  const patterns = [
    /Uncaught Error:\s*([^\n]+)/i,
    /ArgumentValidationError:\s*([^\n]+)/i,
    /ConvexError:\s*([^\n]+)/i,
    /Error:\s*([^\n]+)/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    const detail = m?.[1]?.trim();
    if (detail && !/^Server Error$/i.test(detail)) return detail;
  }
  // Multi-line Convex client wrapper: keep the most useful non-wrapper line.
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/^\[CONVEX [MQ]\(/i.test(line)) continue;
    if (/^Called by client$/i.test(line)) continue;
    if (/^Server Error$/i.test(line)) continue;
    if (/^Request ID:/i.test(line)) continue;
    if (line.length >= 8) return line;
  }
  return null;
}

export function convexClientErrorMessage(error: unknown): string {
  const raw = rawConvexMessage(error);
  if (
    raw.includes(OFFLINE_CONFLICT_ERROR) ||
    (error &&
      typeof error === "object" &&
      (error as { data?: { code?: unknown } }).data?.code ===
        OFFLINE_CONFLICT_ERROR)
  ) {
    return "This file was updated elsewhere. Refresh and try again.";
  }
  const detail = extractServerDetail(raw);
  if (detail) return detail;
  // Drop noisy Convex client wrappers when nothing more specific is present.
  if (/\[CONVEX [MQ]\(/.test(raw) && /Server Error/i.test(raw)) {
    return "Couldn't save — please try again.";
  }
  return raw;
}
