# Mobile testing checklist

Full policy: `docs/mobile-testing-rules.md` (repository root). **Pre-complete gate:** `npm run qa:governance` in `lender-app/`. **Checklist:** `docs/testing/governance-qa-checklist.md`.

## Automated (Playwright)

- [ ] `npm run test:mobile` — `tests/mobile/**` on **Mobile Chrome** + **Mobile Safari** (core)
- [ ] `npm run test:mobile:matrix` — full touch device matrix (Pixel, Galaxy, iPhone Pro, SE, iPad)
- [ ] `npm run test:e2e:mobile-pipeline-scroll` — pipeline scroll / gesture stress (Convex + auth)
- [ ] `lender-app/tests/mobile/scroll/ci-mobile-scroll.spec.ts` — CI gate: `<main>` scroll + `touch-action`
- [ ] `lender-app/tests/mobile/scroll/phase5-mobile-native.spec.ts` — scroll geometry / overscroll / padding stability
- [ ] `npm run test:visual` — includes mobile shell screenshots (`tests/visual/mobile-shell.spec.ts`)

## Manual (release sign-off)

- [ ] Physical **Android Chrome** — pipeline file, drawers, soft keyboard
- [ ] Physical **iPhone Safari** — same + safe areas
- [ ] **No nested scroll traps** (see `lender-app/AGENTS.md`)
- [ ] Sticky / compact chrome transitions feel smooth
- [ ] Task drawer overlay scroll independent of `<main>`
- [ ] Collapsible workspace utilities do not overlap content

## Failure policy

Any regression that breaks **vertical scrolling** or introduces **non-recoverable stuck scroll** on mobile is **release-blocking**.
