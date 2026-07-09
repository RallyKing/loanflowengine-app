# Mobile testing rules (mandatory)

**Status:** Permanent QA policy. **No user-facing feature or UI change is complete without mobile validation.**  
**Implementation paths:** `lender-app/playwright.config.cjs`, `lender-app/tests/mobile/**`, `lender-app/tests/helpers/mobile/**`.

---

## Universal requirement

The following **always** require mobile QA **before** marking work complete:

- Every **feature**
- Every **UI** change
- Every **layout** change
- Every **animation**
- Every **sticky** component
- Every **overlay**
- Every **drawer**
- Every **responsive** change
- Every **deployment** that ships those changes

**Manual** sign-off (physical or browser devtools device mode) may supplement but **does not replace** automated baselines where they exist.

---

## Required device classes

| Class | Automation | Manual |
|-------|------------|--------|
| **iPhone Safari** | Playwright **Mobile Safari** (iPhone 14 Pro), **Mobile Safari SE** | Physical iPhone when possible |
| **Android Chrome** | Playwright **Mobile Chrome** (Pixel 7), **Mobile Chrome Galaxy** | Physical Android when possible |
| **Tablet** | Playwright **iPad** / **tablet** project | Landscape + portrait spot-check |
| **Desktop** | Playwright **chromium** (smoke/regression) | Sanity check |

---

## Required validation dimensions

- **Scrolling** — End-to-end vertical scroll without traps; momentum on iOS surfaces.
- **Sticky behavior** — File chrome / headers stable; no height thrash during scroll.
- **Touch interactions** — Tap targets, swipe drawers, no broken `touch-action`.
- **Viewport stability** — No CLS storms from chrome toggles; safe areas respected.
- **Overlays / drawers** — Open/close without locking main scroll incorrectly.
- **Forms** — Inputs focus, keyboard overlap, submit flows.
- **Navigation** — Bottom nav, route transitions, back behavior.
- **Responsive layout** — At least narrow phone + default mobile + tablet width.
- **Performance** — No obvious jank during scroll bursts; optional `PERF_SCROLL_MS` gates.

---

## Commands (`cwd: lender-app/`)

| Command | Purpose |
|---------|---------|
| `npm run test:mobile` | `tests/mobile` on **Mobile Chrome** + **Mobile Safari** (core gate) |
| `npm run test:mobile:matrix` | Full touch matrix (Pixel, Galaxy, iPhone Pro, SE, iPad) |
| `npm run test:e2e:mobile-pipeline-scroll` | Pipeline scroll depth (core mobile projects) |
| `npm run test:visual` | Visual regression (desktop + Pixel + iPhone + iPad profiles) |
| `npm run qa:governance` | **Mandatory pre-complete gate**: one `build` + mobile core + desktop Chromium smoke |
| `node scripts/run-mobile-prod-playwright.mjs https://<host>` | Post-deploy prod smoke |

**Tracing:** `PW_TRACE=on npm run test:mobile` for full traces (heavy).

**WebKit on Windows:** Often flaky against `localhost`; prefer macOS/Linux CI or `PW_BASE_URL` pointing at a deployed preview/production host.

---

## Layout shift (CLS)

- `tests/mobile/scroll/scroll-stability-cls.spec.ts` — regression tripwire (not a Lighthouse substitute).
- Tune thresholds as surfaces stabilize.

---

## Visual regression

- `tests/visual/mobile-shell.spec.ts` — authenticated shell; update snapshots intentionally:  
  `npx playwright test tests/visual/mobile-shell.spec.ts --project visual-mobile-pixel -u`

---

## CI core pair

`tests/mobile/scroll/ci-mobile-scroll.spec.ts` targets **Mobile Chrome + Mobile Safari** only for a fast gate. Extended devices use `test:mobile:matrix`.

---

## Merge / completion policy

- **Do not** merge user-facing UI without documented mobile verification (`test:mobile` minimum, matrix for sticky/scroll/drawer work).
- **Production:** run automated mobile smoke against prod URL after deploy + manual spot-check.

---

## Debugging

- `node scripts/mobile-scroll-diagnostics.mjs` — console snippet for nested scrollports.
- `lender-app/tests/helpers/mobile/diagnostics.ts` — programmatic dumps in specs.

---

## References

- Scroll contract: `lender-app/AGENTS.md`, `docs/scroll-architecture-rules.md`
- Deployment: `docs/deployment-rules.md`
- Global standards: `docs/ai-development-rules.md`
- Human checklist: `docs/testing/governance-qa-checklist.md`

---

*This file is the **canonical** mobile testing policy for the repository (root `docs/`).*
