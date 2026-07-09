# Viewport stability validation — Phase 3

## Strategy in this codebase

| Concern | Approach |
|---------|-----------|
| **Locked shell height** | **`html` / `body`**: `height: 100%`, **`min-height: 0`**, flex column; **`body`** overflow locked in app shell (see `globals.css` + `layout.tsx`). Primary scroll is **`AppChrome` `<main>`**, so **browser UI chrome** (address bar) affects the **layout viewport** but should not create a second vertical scroller on `document`. |
| **Dynamic viewport height** | Shell uses **`h-full`** / **`min-h-0`** chain rather than **`100dvh`** on `body` to keep **percentage heights** stable across flex (see comment in `globals.css`). **`dvh` / `min-h-dvh`** appear on **auth pages**, **portal**, **drawers** (`h-dvh max-h-dvh`) where a **full-viewport panel** is intentional. |
| **iOS safe areas** | **`viewportFit: "cover"`** in `app/layout.tsx` enables **`env(safe-area-inset-*)`**. Sticky file header uses **`max-sm:pt-[max(0.5rem,env(safe-area-inset-top))]`**. Main content bottom padding and **`MobileBottomNav`** use **`env(safe-area-inset-bottom)`**; nav adds **left/right** insets in Phase 3. |
| **Keyboard (Android)** | **`interactiveWidget: "resizes-content"`** — layout resizes with the keyboard so inputs in **`main`** stay reachable without ad-hoc `visualViewport` JS in Phase 3. |
| **iOS keyboard** | Still validate manually: focused inputs near the bottom of **`main`** should scroll into view; if gaps appear, prefer **follow-up** `visualViewport` tuning rather than blanket **`dvh`** on `body`. |

## What Phase 3 did **not** change

- No global switch of `body` to **`100dvh`** (would risk flex **`h-full`** chains and scroll ownership).
- No new **`window.innerHeight`** listeners.

## Manual matrix

- [ ] **iPhone Safari** — Show/hide address bar while scrolling **`main`**; sticky + compact should not “double jump.”
- [ ] **Android Chrome** — Same; open keyboard from a bottom-area input on a task / pipeline field.
- [ ] **Rotate** portrait ↔ landscape — bottom nav and **`main`** padding remain usable; no clipped FABs (see `UserOnboardingChecklist` / `ContextualQuickTip` offsets that already account for nav + safe area).
- [ ] **Tablet** — `md:hidden` hides bottom nav; verify **`md+`** sidebar/top chrome only.

## Related

- `mobile-chrome-remediation.md` — store + bottom nav details.
- `mobile-nav-validation.md` — Playwright + tap targets.
