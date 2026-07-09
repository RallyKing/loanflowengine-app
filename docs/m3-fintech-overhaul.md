# Material Design 3–aligned fintech UI overhaul

This document maps product requirements to the **Direct Lending Connection (DLC)** implementation: CSS design tokens, multi-tenant branding, side sheets, density modes, and migration targets. It complements `lender-app/app/globals.css`, `lender-app/lib/brandingTheme.ts`, and the **record inspector** shell contract in `lender-app/AGENTS.md`.

## Goals

| Requirement | Approach in codebase |
|-------------|---------------------|
| Dynamic tonal palettes | Org **primary/secondary** hex drives `--primary` / nav / accent via `applyBrandingThemeVars`. **Tonal containers** `--dlc-tone-primary-*` / `--dlc-tone-secondary-*` are derived from the same seeds (mixed toward white + contrast-aware on-container text). |
| Trust-based semantic color | `--dlc-semantic-*` tokens (success, warning, error, info, attention, neutral, pending, approved, declined, active, inactive, destructive). **Brand** colors stay for CTAs and navigation; semantics carry **status and validation** meaning. |
| Multi-tenant theme | `OrgBrandingProvider` → `applyBrandingThemeVars(document.documentElement, { primaryHex, secondaryHex })`. Clearing branding restores `:root` / scheme defaults. |
| Side sheets vs destructive modals | Canonical overlay: **`RecordInspectorShell`** (`SideSheet` re-export). Prefer sheets for contextual editing, confirmations, and secondary tasks. New **`ConfirmActionSheet`** composes the shell for confirm flows. |
| Snap drawers | Pipeline workspace uses `[data-pipeline-workspace-scroll]` and workspace chrome; inspectors use **bottom sheet on narrow viewports** (`max-md:rounded-t-2xl`, `animate-slide-in-up`). Align future “snap” peek states with the same z-index and scroll-owner rules. |
| Progressive disclosure | **`ProgressiveDisclosureCard`** — summary row + in-place expandable details (no route change). |
| Skeleton loading | Shared **`.dlc-surface-skeleton`** animation in `globals.css`; **`TrustListSkeleton`**, **`RecordInspectorSkeleton`**, and list row placeholders should use it for consistent, calm loading. |
| Motion reassurance | **`.dlc-motion-status-settle`** for status chip / badge transitions; respects `prefers-reduced-motion`. |
| Context-preserving workflows | Avoid full-page navigation for record edits; use inspector sheets, preserve scroll in `AppChrome` `<main>` or pipeline workspace scrollport; restore focus from inspector on close (implemented in `RecordInspectorShell`). |
| Specialized financial inputs | **`FinanceField`** — label, support text, error, merged `aria-describedby` / `aria-invalid` on child control. |
| Dense enterprise / analyst layouts | **`displaySettings.uiDensity`**: `comfortable` (default) \| `compact` \| `analyst` → `html[data-ui-density]`. Analyst tightens `--dlc-density-*` and label/body sizes. |

## Finance-safe color semantics

**Problem:** Bright red/green for numeric deltas or balances reads as “error/success” and fails WCAG **use of color** when it is the only signal.

**Tokens (RGB space-separated, Tailwind `dlc-finance-*`):**

- **`--dlc-finance-credit` / `-credit-muted`**: teal-leaning **positive momentum** (credits, inflows).
- **`--dlc-finance-debit` / `-debit-muted`**: warm rust **negative momentum** (debits, outflows) — not the same as `--dlc-semantic-error-*`.
- **`--dlc-finance-stable` / `-stable-muted`**: neutral slate for **unchanged / baseline**.

**Utility chips (globals):** `.dlc-finance-credit-chip`, `.dlc-finance-debit-chip`, `.dlc-finance-stable-chip` — always pair with **visible text or icon** and short labels.

**When to use semantic vs finance tokens**

- **Semantic** (`--dlc-semantic-*`): validation, alerts, workflow state (submitted, declined, needs review).
- **Finance momentum**: tables of amounts, deltas, rates — where “green = good” would be misleading in credit or tax contexts.

## Density modes

Persisted under **`UserPreferences.displaySettings`** (Convex) as `uiDensity`:

- `comfortable` — default spacing from `--dlc-density-comfortable` / type scale.
- `compact` — intermediate tightening.
- `analyst` — maximum row density for dashboards and grids.

Applied in **`UserPreferencesProvider`** via `applyUiDensityToElement` → `document.documentElement.dataset.uiDensity`.

**Follow-up:** expose `uiDensity` in Settings UI and QA **touch targets** (minimum `--dlc-touch-target-min`) on mobile in `analyst` mode.

## Keyboard and accessibility

- **Inspector:** `Escape` closes sheet unless focus is in a field or `consumeEscape` returns true; scrim click closes when enabled.
- **Focus:** Inspector moves focus into the panel on open and restores the opener on unmount.
- **Forms:** `FinanceField` wires `htmlFor`, `aria-describedby`, `aria-invalid`.
- **Audits:** Run axe / Lighthouse on representative routes (pipeline file, lender drawer, tasks) after migrating confirms off `window.alert` / `window.confirm`.

## Migration checklist (incremental)

1. **Confirms** — Replace `window.confirm` / `alert` with **`ConfirmActionSheet`** or inline **`RecordInspectorShell`** patterns; keep destructive actions in sheets with explicit copy and non-blocking scrim where safe.
2. **Status pills** — Swap raw `green-500` / `red-500` for **`--dlc-semantic-*`** or **`dlc-finance-*`** per meaning; add text labels.
3. **Loading** — Ensure every async section has skeleton or **`TrustListSkeleton`**; avoid layout jump (reserve min-height where needed).
4. **Modals** — Audit Radix/dialog usage; prefer side/bottom sheets for **non-modal** tasks; reserve true modals for rare, focused flows.
5. **Mobile** — Avoid shallow patterns that hide primary actions; keep **touch targets** and **single scroll owner** per `AppChrome` / pipeline contracts.
6. **Build & deploy** — After UI batches: `npm run build` in `lender-app/`, then production deploy and smoke (including mobile scroll).

## File reference

| Piece | Location |
|-------|-----------|
| M3 + semantic tokens | `lender-app/app/globals.css` |
| Tenant theme application | `lender-app/lib/brandingTheme.ts`, `lender-app/lib/orgBrandingContext.tsx` |
| Density | `lender-app/lib/m3/uiDensity.ts`, `lender-app/lib/userPreferencesContext.tsx` |
| Inspector / side sheet | `lender-app/components/RecordInspectorShell.tsx`, `lender-app/components/SideSheet.tsx` |
| Confirm sheet | `lender-app/components/m3/ConfirmActionSheet.tsx` |
| Disclosure card | `lender-app/components/m3/ProgressiveDisclosureCard.tsx` |
| Finance field | `lender-app/components/m3/FinanceField.tsx` |
| List skeleton | `lender-app/components/trust/TrustSurfaces.tsx` |
| Tailwind token colors | `lender-app/tailwind.config.ts` |

## Real-time status transitions

For Convex or WebSocket-driven updates:

- Prefer **optimistic UI** with rollback surfaced in **`TrustErrorBlock`** or inline semantic error.
- Apply **`.dlc-motion-status-settle`** when a status chip changes to reassure without flashy animation.
- Announce critical changes with **`aria-live="polite"`** on status regions where appropriate.

---

*This is a living spec; extend it as components migrate and audits complete.*
