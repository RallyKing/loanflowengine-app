# Mobile UX assessment

**Audit date:** 2026-05-07 · **Mode:** Diagnostic only · **Priority lens:** Real end-user mobile workflows (especially iPhone Safari).

---

## 1. Summary verdict

The platform implements a **sophisticated** shell (compact chrome, focus mode, sticky pipeline file header, overlay drawers) but mobile UX **consistency** is uneven: **pipeline list** pushes users into a **horizontally wide table** with a **nested vertical scroll**, while **documentation** still emphasizes a single `<main>` scroll owner. That mismatch predicts **confusion, scroll traps, and failed expectations** on phones. Dense **CRM and ledger** surfaces likely remain **desktop-first** in cognitive load even where they technically render on small screens.

**Overall mobile UX maturity:** **Medium** — core shell strong; content surfaces variable; portal and settings probably lag main pipeline investment.

---

## 2. Usability dimensions

### Readability & hierarchy

- **Strength:** Shared workspace container, section IDs, collapsible utilities (progressive disclosure).
- **Risk:** Small labels (`text-xs` heavy in tables), multi-row sticky table headers, **horizontal scroll** for pipeline table hides columns from mental model on phone.

### Touch targets

- **Automated:** Sign-in username height ≥ 36px (`tests/mobile/forms/sign-in-touch-targets.spec.ts`).
- **Gap:** Dense tables use **checkboxes** and **row actions** that may fall **below 40–48dp** MD guidance — needs spot audit per row component.

### Thumb reach & navigation clarity

- **Bottom nav** fixed — good for primary tabs; **conflicts possible** when focus mode / compact chrome hides nav — verify user can always escape.
- **Top actions** on pipeline file (stage, snooze) — high placement; **reach** concern on Max/Pro sizes (less on SE).

### Forms & keyboard

- **Risk:** Long settings/intake forms — iOS keyboard **shrinks visual viewport**, `dvh`/`fixed` bottom bars may **overlap** inputs if not using `visualViewport` patterns (not fully audited in code this pass).
- **Recommendation (future work):** Scroll focused field into view + avoid `position:fixed` footers covering inputs on portal/settings.

### Workflow friction

| Workflow | Friction hypothesis |
|----------|---------------------|
| **Find file on phone** | Pipeline table + horizontal pan — high friction |
| **Open task drawer while scrolling file** | Overlay scroll vs main — medium (known pattern) |
| **Rapid lender scenario match** | Density + filters — medium/high |
| **Client portal login** | Separate shell — **unknown** without device pass |

---

## 3. Clutter & overlapping UI

- **Sticky pipeline file chrome** intentionally overlaps scroll content — OK if stable; **bad** if combined with **jumping padding** (prior R1).
- **Snooze menu** uses `position: fixed` — z-index must beat cards (see component comment).
- **Global search palette, notifications** — second-layer overlays; risk of **focus trap** or **blocking** bottom nav.

---

## 4. Accessibility (UX-related)

- Landmarks: `AppChrome` uses `<main>` — good.
- Tables: horizontal scroll **without** always-visible scroll affordance may hurt **screen reader + sighted** users (discoverability).
- Motion: `data-reduce-motion` supported at token level — **verify** all transitions respect it (spot-check `MobileChromeController`).

---

## 5. Device-specific callouts

| Device class | UX note |
|--------------|---------|
| **iPhone SE** | Narrow width + table min-width → **heavy** pan; compact chrome essential |
| **iPhone Pro Max** | More columns visible but still table paradigm — **not** a “phone-first” list UX |
| **Galaxy S** | Similar to Pixel; gesture nav may conflict with horizontal pan |
| **iPad** | Table may shine; split detail views need verification |

---

## 6. Testing gaps for UX

- No automated coverage for **portal**, **ledger**, **documents**, **settings** mobile flows.
- **Keyboard open/close** not automated.
- **Landscape** not systematically tested.

---

*See `mobile-issue-inventory.md` for numbered issues and `mobile-scroll-audit.md` for scroll-specific UX.*
