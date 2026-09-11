/**
 * Client-only dismiss window for the on-open Web Push enable prompt.
 * Uses localStorage only — no Convex polling / no server round-trip.
 */

export const WEB_PUSH_PROMPT_DISMISS_KEY = "dlc.webPush.enablePrompt.dismissUntil";

/** Seven days in milliseconds. */
export const WEB_PUSH_PROMPT_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export function readWebPushPromptDismissedUntil(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WEB_PUSH_PROMPT_DISMISS_KEY);
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  } catch {
    return null;
  }
}

export function isWebPushPromptDismissed(now = Date.now()): boolean {
  const until = readWebPushPromptDismissedUntil();
  return until != null && until > now;
}

export function dismissWebPushPromptForSevenDays(now = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WEB_PUSH_PROMPT_DISMISS_KEY,
      String(now + WEB_PUSH_PROMPT_DISMISS_MS),
    );
  } catch {
    /* private mode */
  }
}

/** Clear dismiss after a successful enable so a future revoke can re-prompt. */
export function clearWebPushPromptDismiss(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(WEB_PUSH_PROMPT_DISMISS_KEY);
  } catch {
    /* private mode */
  }
}
