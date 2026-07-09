# Governance QA checklist (mandatory)

Use this checklist for **human** verification and PR templates. AI sessions must mirror this via **`npm run qa:governance`** + documented deploy/smoke.

**Canonical policy:** `docs/deployment-rules.md`, `docs/mobile-testing-rules.md`, `docs/ai-development-rules.md`, **`docs/governance/MANIFEST.json`** (required enterprise policy docs).

---

## Governance artifact verification

Run from **`lender-app/`**:

- [ ] `npm run verify:governance:docs` — confirms every path in `docs/governance/MANIFEST.json` exists  
- [ ] For deep policy review, open `docs/governance/ai-development-lifecycle.md` (AI workflow)

---

## Before opening a PR (user-facing change)

- [ ] Read `docs/project-intelligence-summary.md` for affected systems.
- [ ] Scroll/sticky/overlays touched → read `docs/scroll-architecture-rules.md` + **`docs/governance/runtime-workspace-scroll-authority.md`** if pipeline file / workspace sheet.
- [ ] UI/layout/responsive → read `docs/ui-ux-rules.md`.
- [ ] Lists/data hot paths → read `docs/performance-rules.md`.

---

## Automated gates (must pass unless explicitly exempt)

Run from **`lender-app/`**:

- [ ] `npm run build`
- [ ] `npm run qa:governance` — single build + mobile core pair + Chromium smoke  
  - CI with required auth: set **`APP_AUTH_USERNAME`**, **`APP_AUTH_PASSWORD`**, and optionally **`REQUIRE_GOVERNANCE_AUTH=true`**

---

## Mobile validation (blocking if skipped for UI work)

- [ ] **iPhone Safari class** — Playwright Mobile Safari (and SE for narrow layouts when relevant)
- [ ] **Android Chrome class** — Mobile Chrome (+ Galaxy matrix for sticky/drawer changes)
- [ ] **Tablet** — iPad project or manual tablet width
- [ ] **Desktop** — Chromium smoke baseline

### Behavior

- [ ] Scrolling / momentum acceptable
- [ ] Sticky regions stable (no thrash)
- [ ] Touch targets and gestures
- [ ] Viewport / safe areas
- [ ] Overlays and drawers
- [ ] Forms and keyboard
- [ ] Navigation (including bottom nav where applicable)

---

## Deployment (shipping)

- [ ] `npm run deploy:prod` completed (Vercel CLI — not “GitHub only”)
- [ ] Production smoke: login, pipeline, tasks, contacts, lenders, mobile scroll
- [ ] Optional: `node scripts/run-mobile-prod-playwright.mjs https://<prod-host>`

---

## Exemptions (document in PR)

- Docs-only or local tooling-only → state **“exempt: docs/tooling”** and skip deploy/tests as appropriate.

---

## Failure = not mergeable

If mobile layouts were not validated, sticky/scroll testing was skipped for relevant changes, or deploy/smoke was skipped for shipped product work → **do not merge** until resolved.
