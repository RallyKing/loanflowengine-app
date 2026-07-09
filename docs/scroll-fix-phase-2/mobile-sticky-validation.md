# Mobile sticky validation — Phase 2

## Automated (recommended)

From `lender-app/`:

```bash
npm run build
npm run test:mobile
```

Relevant suites:

- **`tests/mobile/sticky/pipeline-sticky-mobile.spec.ts`** — file workspace sticky header vs `<main>`.
- **`tests/mobile/scroll/phase5-mobile-native.spec.ts`** — overscroll contract, nested scrollports, padding stability while scrolling.
- **`tests/e2e/pipeline-file-mobile-layout.spec.ts`** — `--header-height` set after measure (when run against built app).

Ensure Playwright uses a server **matching** the build (see `docs/scroll-fix-phase-1/mobile-scroll-validation.md`).

## Manual matrix

Verify on **iPhone Safari** and **Android Chrome**:

| Scenario | Pass criteria |
|----------|----------------|
| Pipeline file — slow vertical scroll | Sticky file chrome **does not** jump in height; no **rubber-band** fight with body (body remains locked). |
| Pipeline file — momentum then reverse | Compact **masterpage** (file sentinel path) **does not** rapidly flip; no flicker at sentinel boundary. |
| Hub / tasks — scroll down then up | SaaS (or classic) top bar **does not** reflow from padding/menu size jumps; tool cluster may **scale** slightly only. |
| Address bar show/hide (mobile browser UI) | No **persistent** sticky gap; tolerate one resize-driven **header-height** update on file page. |
| Rotate portrait ↔ landscape | Sticky header **re-measures** once; no infinite layout. |
| Keyboard open (focus search / text field) | Sticky systems **no worse** than Phase 1; no Phase 2 regressions expected. |

## What Phase 2 fixed vs Phase 1

- **Phase 1**: single vertical scroll owner (`<main>`).
- **Phase 2**: **scroll-linked chrome** avoids **layout** transitions (padding, gaps, small touch targets) during compact; **IO debounce** and **stronger scroll deltas** reduce compact **toggle storms**; **RO** uses **border-box** observation with existing **gate + rAF**.

## Known residuals

- **Classic** mobile header still **switches** between two rows (expanded vs compact) via **grid** — swap is **instant** but total header height **can** differ between states; Phase 2 only removed **animated** layout props and **matched** compact row padding/controls closer to expanded.
- **Utilities** collapsible **open/close** still changes workspace height (user intent).
