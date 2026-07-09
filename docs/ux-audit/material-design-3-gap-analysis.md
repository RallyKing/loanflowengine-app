# Material Design 3 — Gap Analysis (Direct Lending Connection)

**Scope:** `lender-app` against **modern** Material Design 3 *principles* (not legacy MD2). **Baseline:** `app/globals.css` DLC tokens, `tailwind.config.ts`, `docs/material-design-system.md`, `docs/ui-ux-rules.md`.

---

## 1. Dynamic color & tonal systems

| MD3 expectation | Current state | Gap | Severity |
|-----------------|---------------|-----|----------|
| **Source → tonal palette** (primary, on-primary, primary-container, on-primary-container, …) | Brand RGB tokens (`--primary`, `--brand`, SaaS overrides) + `--dlc-surface-*` mapped from legacy `--bg`/`--muted` | **Partial.** Not a full 5-tone ramp per role; container/on-container pairs are implied, not systematically named | Medium |
| **Semantic color roles** (error, on-error, error-container) distinct from brand | `--destructive` + Tailwind `destructive` usage | **Good start**; ensure all warning/success/info flows map to tokens, not ad hoc amber/green classes scattered in JSX | Medium |
| **Per-tenant / dynamic color** from org branding | Org branding in schema; display tints via `displaySettings` | **Opportunity:** MD3-style “harmonize” from one org seed color into surfaces + primary container **without** breaking semantic error | High (multi-tenant trust) |
| **Adaptive contrast** (light/dark elevation tonal shifts) | Classic dark via `prefers-color-scheme`; SaaS forces `color-scheme: light` | SaaS mode **intentionally** ignores OS dark — document as product choice; consider **optional** SaaS dark later for power users | Low |

**Recommendation:** Introduce a documented **semantic token layer** (`--md-sys-color-error`, `--md-sys-color-surface-container`, …) aliasing to existing DLC vars so components stop using raw Tailwind greens/ambers for “success” that clash with forest/gold or SaaS blue.

---

## 2. Surface hierarchy & elevation

| MD3 expectation | Current state | Gap |
|-----------------|---------------|-----|
| **Surface containers** (low → high) for nesting | `--dlc-surface-container-*` in `globals.css` | Under-used in components vs `bg-card` / `bg-muted` / one-off `border-border/50` |
| **Elevation as state** (drag, focus) | `--dlc-elevation-1`…`5` defined | Inconsistent application — many cards use flat borders only (acceptable) but **sheet stack** (AppChrome → workspace → drawer) could use clearer **z-index + elevation contract** |
| **Sheet hierarchy** | Pipeline file: Vaul top sheet + header + scroll body (`docs/workspace-sheet-architecture.md`) | **Strong direction.** Ensure **drawer** and **modal** layers use a **single** elevation ramp so users feel one product |

**Recommendation:** Publish a **one-page “surface map”** (which elevation for: default card, sticky header, overlay scrim, drawer, modal, toast). Enforce in design-system doc + code review.

---

## 3. Navigation systems

| MD3 component | DLC equivalent | Gap |
|---------------|----------------|-----|
| **Navigation rail** (collapsed primary) | SaaS: `SaasCollapsedNavRail`; classic: bottom nav + header | Classic mobile lacks persistent **rail mental model** — acceptable; ensure **bottom nav** items map to **top tasks** (broker daily) |
| **Bottom app bar / adaptive nav** | `MobileBottomNav` + focus mode (transform off-screen) | **Review:** focus mode hides nav — correct for reading; **risk** if user needs quick task add while “deep” in file (offer **FAB or header action** parity) |
| **Standard transitions** nav → detail | Route transitions default Next | **Opportunity:** subtle **shared-axis** or fade consistent with `--dlc-motion-easing-standard` for shell stability |

---

## 4. Motion system

| MD3 expectation | Current state | Gap |
|-----------------|---------------|-----|
| **Duration tokens** short/medium/long | `--dlc-motion-duration-*` present | Good |
| **Easing** standard / emphasized | `cubic-bezier(0.2, 0, 0, 1)` | Align Vaul defaults with documented token (see `app/vaul-drawer.css` vs shell transitions) |
| **Choreography** (enter list → enter detail) | Per-component | **Risk:** block expand + drawer open + compact chrome can **stack** motion — audit **reduced motion** paths holistically |

**Recommendation:** Define **three motion classes** only: `chrome`, `sheet`, `content-reveal`. Ban one-off durations except rare marketing moments.

---

## 5. Cards & progressive disclosure

| MD3 expectation | Current state | Gap |
|-----------------|---------------|-----|
| **Filled / outlined / elevated** card roles | Pipeline blocks, `CollapsibleSection`, workspace surfaces | **Strong** progressive disclosure (`utilities collapsed by default`). **Gap:** macro-to-micro **within** dense blocks (e.g. lenders block) — consider **summary row + expand** pattern standardized |
| **Expandable sections** | Drawer layout `expanded` map | Works; ensure **keyboard** and **screen reader** state (`aria-expanded`) consistent across all collapsibles |

---

## 6. Side sheets (standard side sheet)

| MD3 expectation | Current state | Gap |
|-----------------|---------------|-----|
| **Modal side sheet** for contextual edit | `LenderDrawer`, `TaskDrawer` — fixed overlay asides | Behaviorally close; **visual** MD3 side sheet specs (16dp padding, header actions, grab handle optional) not fully unified |
| **Non-modal contextual panel** | Less common | **Opportunity** for desktop split view on ultra-wide (Lightning-style) — future |

---

## 7. Input system

| MD3 expectation | Current state | Gap |
|-----------------|---------------|-----|
| **Text field** with supporting text, error text | Inline editors, `Input`, settings | **High-value gap:** finance fields ($, %, basis points) should share **one** `MoneyInput`-style pattern with **consistent** formatting hints and error copy |
| **Assistive chips** | Partial in filters | Standardize “AI assist” / “suggested stage” as **assist chip** component, not bespoke spans |

---

## 8. Loading states

| MD3 expectation | Current state | Gap |
|-----------------|---------------|-----|
| **Skeleton placeholders** | Mix of pulse blocks and spinners | Pipeline file loading uses skeleton-like placeholders — **good.** Hub/lists: ensure **CLS** budget (policy in performance docs) |
| **Button loading** | Button variants | Audit destructive flows for **explicit** loading + disabled state |

---

## 9. Mobile adaptive behavior

| MD3 **window size classes** | Tailwind `md`/`sm` | File route: **Vaul snap** + delegated scroll — **ahead** of many CRMs. **Gap:** **density switch** (comfortable vs compact) user preference not yet first-class |

---

## Prioritized MD3 roadmap (conceptual)

1. **Critical:** Semantic color system + finance input primitives.  
2. **High:** Surface/elevation contract for overlays.  
3. **Medium:** Motion classes + reduced-motion audit.  
4. **Low:** Adaptive fold / split view experiments.

---

*See also: `full-fintech-ux-audit.md`, `fintech-trust-analysis.md`.*
