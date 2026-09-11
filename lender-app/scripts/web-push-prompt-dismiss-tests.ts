/**
 * Unit checks for Web Push enable-prompt dismiss (localStorage helpers).
 * Run: npx tsx scripts/web-push-prompt-dismiss-tests.ts
 */
import assert from "node:assert/strict";
import {
  WEB_PUSH_PROMPT_DISMISS_KEY,
  WEB_PUSH_PROMPT_DISMISS_MS,
  clearWebPushPromptDismiss,
  dismissWebPushPromptForSevenDays,
  isWebPushPromptDismissed,
  readWebPushPromptDismissedUntil,
} from "../lib/webPush/promptDismiss";

const store = new Map<string, string>();

(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
  },
};

assert.equal(isWebPushPromptDismissed(1_000), false);
assert.equal(readWebPushPromptDismissedUntil(), null);

const now = 1_700_000_000_000;
dismissWebPushPromptForSevenDays(now);
const until = readWebPushPromptDismissedUntil();
assert.equal(until, now + WEB_PUSH_PROMPT_DISMISS_MS);
assert.equal(isWebPushPromptDismissed(now + 1), true);
assert.equal(isWebPushPromptDismissed(now + WEB_PUSH_PROMPT_DISMISS_MS + 1), false);
assert.equal(store.get(WEB_PUSH_PROMPT_DISMISS_KEY), String(until));

clearWebPushPromptDismiss();
assert.equal(readWebPushPromptDismissedUntil(), null);
assert.equal(isWebPushPromptDismissed(now), false);

console.log("web-push-prompt-dismiss-tests: ok");
