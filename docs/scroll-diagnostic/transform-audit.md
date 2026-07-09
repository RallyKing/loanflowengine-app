# Transform, filter & compositing audit

**Diagnostic only.** Relates **GPU layers** and **containing blocks** to sticky/scroll stability.

---

## 1. Mobile compact / focus — `translate` + `opacity`

**File:** `lender-app/lib/mobileCompactChrome.ts`

| Export | Transform / filter | When |
|--------|-------------------|------|
| `mobileScrollRevealInnerClass(collapsed)` | `max-md:-translate-y-2` vs `translate-y-0`; `opacity` | Collapsed vs expanded |
| `mobileFocusBottomNavHidden` | `max-md:translate-y-full`, `opacity-0` | Focus mode |
| `mobileFocusChromeTransition` | **Includes `transform`** in transition list | Focus chrome |
| `mobileNavTransformTransition` | `transform`, `opacity` | Bottom nav |

**Sticky interaction:** File sticky header **does not** wrap these classes; it uses padding/transition from `mobileCompactTransition` / `mobileFocusChromeTransition`. **Check:** `mobileFocusChromeTransition` lists **`transform`** — if any class applies **`transform`** to sticky header or an **ancestor** of sticky, **sticky positioning** can break (sticky ignores `transform` ancestor per spec). **Current shell:** sticky `<header>` receives transition class including transform capability — **verify computed style** on device: if **`transform` non-none** is applied to sticky header, **root cause** for sticky instability.

---

## 2. `backdrop-filter` / `blur`

| Location | Classes |
|----------|---------|
| `AppChrome` master header | `backdrop-blur`, `supports-[backdrop-filter]:bg-background/…` |
| `MobileBottomNav` | `backdrop-blur supports-[backdrop-filter]:…` |
| Drawers | `backdrop-blur-sm` on scrim |

**Effect:** Creates **stacking contexts** and **layer promotion** — can increase **memory** / **repaint** cost during scroll; generally **not** a containing-block trap for sticky unless paired with `transform`.

---

## 3. `will-change`

**Grep note:** No systematic `will-change` audit in this pass beyond implicit transitions. **Framer Motion:** Not used in `PipelineFileWorkspace.tsx` (grep empty).

---

## 4. `scale` utilities

**File:** `AppChrome.tsx`

- `max-md:scale-95` on compact icon row — **may** create transform containing context for that subtree.

---

## 5. Pipeline workspace cards

**File:** `lender-app/lib/pipelineWorkspaceCard.ts`

- `pipelineWorkspaceCardShadow` uses `transition` on `box-shadow` etc., not transform.
- `pipelineWorkspaceCollapseInner`: `overflow-hidden`, `[overflow-anchor:none]` — interacts with **scroll anchoring** (see browser compat).

---

## 6. Animations — slide drawers

**File:** `lender-app/app/globals.css`

- `@keyframes slide-in-right` — `transform: translateX(100%) → 0` on **drawer** open.

Applied to **overlays**, not sticky file header.

---

## 7. Sticky + transformed parent checklist (theory)

| If this becomes true | Result |
|----------------------|--------|
| Ancestor of sticky has `transform`, `filter`, or `perspective` (non-none) | Sticky offsets relative to that ancestor, not `main` scrollport |
| Sticky element itself has non-none transform | May create layer; sticky behavior may degrade |

**Code position today:** Sticky file header sits under `main` → `…` → `PipelineFileWorkspaceShell` root → **direct child** `<header>`. **No** `transform` on shell root in class list. **Caution:** `mobileFocusChromeTransition` on `<header>` — inspect **computed** `transform` during focus animation.

---

## 8. `overflow-anchor` opt-outs

| Location | Rule |
|----------|------|
| `AppChrome` headers | `supports-[overflow-anchor:auto]:[overflow-anchor:none]` |
| `PipelineFileWorkspaceShell` sticky header | same |
| `pipelineWorkspaceCollapseInner` | `[overflow-anchor:none]` |

**Intent:** Reduce browser scroll anchoring **jumps** when above-the-fold content height changes. **Tradeoff:** May make scroll position feel “stickier” or less auto-correcting depending on engine.

---

*End of transform audit.*
