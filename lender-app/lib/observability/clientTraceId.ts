"use client";

const KEY = "dlc_client_trace_v1";

/** Per-tab stable id for linking browser → Next API → Convex structured logs. */
export function getOrCreateClientTraceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `ct-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}
