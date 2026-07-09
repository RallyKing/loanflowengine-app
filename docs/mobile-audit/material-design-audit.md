# Material Design compliance audit (mobile-first)

**Audit date:** 2026-05-07  
**Reference:** `docs/material-design-system.md` (DLC adaptive MD3 — Tailwind + tokens, not MUI).

This audit scores **how consistently** the live codebase aligns with **stated** MD3-inspired tokens and **mobile ergonomics**, not whether Google’s stock apps are cloned.

---

## Scoring rubric (0–5 each)

| Criterion | Score | Notes |
|-----------|-------|-------|
| **Navigation** | **3/5** | Bottom nav + shell exist; pipeline list table nav model is **not** MD “bottom app bar + content” friendly; focus mode complexity |
| **Forms** | **3/5** | Inputs exist; density variance high; keyboard overlap risk unverified |
| **Drawers** | **4/5** | Bounded height, slide animation tokenized — strong |
| **Cards / surfaces** | **4/5** | `dlc-surface-*`, shadows documented — good direction; legacy `border` cards remain |
| **Overlays** | **3/5** | Modals use `max-h` + scroll — good; stacking/z-order risk under multi-overlay |
| **Responsiveness** | **2/5** | Wide tables, forced pipeline table on phone — **weak** responsive story vs MD “adaptive layouts” |
| **Accessibility** | **3/5** | Focus-visible + reduced motion tokens; tables/orientation need work |

**Aggregate (weighted): ~3.1 / 5** — **solid shell + surfaces**; **content layouts** often **desktop-first**.

---

## Principle checklist

| MD principle (adapted) | Status |
|------------------------|--------|
| **Touch targets 40–48dp** | **Partial** — design system says favor; tables/check icons may violate |
| **Elevation consistency** | **Good** — tokenized `shadow-dlc-*` |
| **Shape consistency** | **Good** — `rounded-dlc-*` |
| **Motion** | **Mixed** — tokenized durations; scroll-linked layout still a risk |
| **State layers** | **Partial** — hover/focus documented; dense lists may lack clear pressed states |
| **Typography scale** | **Mixed** — `text-dlc-*` migration incomplete; many `text-xs` |

---

## Per-surface notes

- **Pipeline sticky file chrome:** Strong **hierarchy**; ensure **title / stage** remain legible in compact mode.
- **Snooze / menus:** `fixed` positioning — ensure **scrim** / elevation metaphor.
- **Intake workspace:** Many panels — risk of **visual noise** vs MD “clear step progression”.

---

## Gaps to close (future)

1. **Responsive table strategies** — column prioritization, card list fallback on `max-md`.
2. **Migrate** legacy typography to `text-dlc-*` on high-traffic mobile routes.
3. **Motion audit** under `data-reduce-motion` for chrome transitions.

---

*Issues cross-tagged MD-\* in `mobile-issue-inventory.md`.*
