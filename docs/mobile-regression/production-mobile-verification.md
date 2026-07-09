# Production mobile verification — Phase 4

**Last deploy verified in Phase 4 (automated):** Vercel production build completed successfully; deployment state **READY**.

**Example deployment URL (per CLI output):**  
`https://loanflowengine-hseakk5lu-joshua-4539s-projects.vercel.app`

**Public alias (from CLI):**  
`https://lownflowengine.com`  
(Confirm the intended production domain in the Vercel project settings if this differs from your canonical hostname.)

---

## 1. Optional: Playwright against production

The repo ships:

```bash
cd lender-app
node scripts/run-mobile-prod-playwright.mjs https://<your-production-host>
```

**Requires:** `APP_AUTH_USERNAME` / `APP_AUTH_PASSWORD` in the environment for authenticated mobile specs.

This runs `tests/mobile` with `PW_BASE_URL` set (no local `webServer`).

---

## 2. Manual smoke matrix (signed-in)

Complete on a **real phone** (iOS Safari + Android Chrome) and once on **iPad** if you ship tablet layouts.

| Area | Steps | Pass criteria |
|------|-------|----------------|
| Login | Sign in via production URL | Lands in workspace; no console errors on happy path |
| Pipeline hub | Scroll list/table vertically | Only `<main>` scrolls; **no** full-page body scrollbar |
| Pipeline file | Open a file; scroll long content; exercise sticky header | Sticky stable; no double scroll jump |
| Task drawer | Open task drawer, scroll task body, close | Overlay only; **main** scroll lock unchanged; no layout jump |
| Lender drawer | Open lender panel; scroll | Same as task drawer |
| Global search / palettes | Open search; scroll results | Focus trap acceptable; no broken scroll handoff |
| Settings | Long settings pages | Main scroll only |
| Mobile chrome | Scroll down / up | Compact + focus behavior per Phase 2–3; bottom nav does not obscure primary actions |
| Rotation | Portrait ↔ landscape | Safe areas respected; controls not clipped |
| Keyboard | Focus bottom inputs (tasks, forms) | Field remains visible; no catastrophic viewport jump |

---

## 3. Material / UX spot check (non-blocking but recommended)

| Topic | Look for |
|-------|----------|
| Motion | Transitions smooth; no jank when compact toggles |
| Spacing | Tailwind spacing consistent with pre-Phase-4 baselines |
| Touch | Tap targets ≥ 44px where spec’d; no “dead” zones under nav |

---

## 4. What Phase 4 did **not** do

- Did **not** run authenticated Playwright against production in this session.
- Did **not** exhaustively script every modal variant.

Record proof in this file’s table (copy rows and add **Tester / date / device / result**) when you complete manual verification.
