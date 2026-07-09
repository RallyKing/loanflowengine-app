"use client";

import type { SessionInvalidReason } from "@/lib/auth/authTypes";

const EVENT = "dlc:auth-session-invalid";

export function emitSessionInvalid(reason: SessionInvalidReason): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SessionInvalidReason>(EVENT, { detail: reason }),
  );
}

export function subscribeSessionInvalid(
  handler: (reason: SessionInvalidReason) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const ce = e as CustomEvent<SessionInvalidReason>;
    if (ce.detail === "expired" || ce.detail === "revoked") handler(ce.detail);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
