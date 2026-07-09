#!/usr/bin/env node
/**
 * Print Playwright snippet for pasting into a logged-in mobile session
 * (DevTools console) to list nested scrollports under `[data-app-main-scroll]`.
 *
 * For automated dumps, use `diagnoseMainNestedScrollports` from
 * `tests/helpers/mobile/diagnostics.ts` inside a spec.
 */
const snippet = `(() => {
  const main = document.querySelector("main[data-testid='app-main-scroll']");
  if (!main) return console.error("main missing");
  const vh = innerHeight;
  const rows = [];
  main.querySelectorAll("*").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.closest('[role="dialog"]')) return;
    const st = getComputedStyle(el);
    if (st.overflowY !== "auto" && st.overflowY !== "scroll") return;
    if (el.scrollHeight <= el.clientHeight + 4) return;
    const r = el.getBoundingClientRect();
    if (r.height < vh * 0.25) return;
    rows.push({
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute("data-testid"),
      oh: el.scrollHeight,
      ch: el.clientHeight,
    });
  });
  console.table(rows);
})();`;

console.log("Paste in DevTools console on a mobile viewport:\n");
console.log(snippet);
