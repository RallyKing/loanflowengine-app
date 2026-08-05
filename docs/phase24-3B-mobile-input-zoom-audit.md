# Phase 24.3B — Mobile Input Zoom Audit

**Status:** Fixed (2026-08-04 re-ship)  
**Original date:** 2026-05-29  
**Re-fix:** 2026-08-04 — prior floor was ineffective on iPhone Safari

## Root cause

**iOS Safari** (and some Android WebViews) auto-zoom the layout viewport when the user focuses a text-like control whose **computed `font-size` is below 16px**.

This is not fixed by `maximum-scale=1` or `user-scalable=no` (those block accessibility). The fix is **≥16px computed font-size on mobile** for every editable control.

## Why the first ship still zoomed

The Phase 24.3B CSS floor lived in `@layer components` and used `:where(...)` (specificity **0**). Tailwind utilities (`text-xs`, `text-sm`, `text-[11px]`) live in `@layer utilities` and **always won**, so pipeline hub filters (`text-xs` on `<select>`), vault rename fields, and any one-off `className` override stayed at 12–14px → iOS zoom with no way to pinch back out cleanly.

## Viewport configuration (verified)

| Setting | Value | File |
|---------|--------|------|
| `width` | `device-width` | `app/layout.tsx` |
| `initialScale` | `1` | `app/layout.tsx` |
| `maximumScale` | `5` (pinch zoom allowed) | `app/layout.tsx` |
| `viewportFit` | `cover` | `app/layout.tsx` |
| `interactiveWidget` | `resizes-content` | `app/layout.tsx` |

**Not used:** `user-scalable=no`, `maximum-scale=1`.

## Permanent fix (2026-08-04)

### 1. Unlayered CSS floor (authoritative)

`app/globals.css` — **outside** `@layer`, after components:

```css
@media (max-width: 767px), ((hover: none) and (pointer: coarse)) {
  input:not([type=checkbox|radio|range|hidden|file|button|submit|reset|image]):not(.op-micro-control),
  textarea,
  select,
  [contenteditable] {
    font-size: 16px !important;
    line-height: 1.5 !important;
  }
}
```

Unlayered + `!important` beats Tailwind utilities. Coarse-pointer media covers large phones / tablets that still auto-zoom.

### 2. Design token — `MOBILE_SAFE_FORM_FONT_CLASS`

`lender-app/lib/ui/mobileInputZoom.ts` → `"text-base md:text-sm"`

Applied **last** in `cn()` inside `opInputFieldClass` / `opSearchFieldClass` / `opSearchOverlayInputClass` / `SearchField` so `twMerge` cannot keep a caller’s `text-xs`.

### 3. High-traffic markup

Pipeline hub filter `<select>`s, file switcher, vault rename / extract / merge controls bumped to `text-base md:text-xs|sm`.

## Validation

### Automated

`tests/e2e/phase24-3B-mobile-input-zoom.spec.ts`

- Viewport meta allows pinch zoom
- **Adversarial** injected `<select class="text-xs">` still computes ≥16px
- Pipeline hub search + client filter + projection search
- Tasks search, global palette, login fields
- `visualViewport.scale ≈ 1` on focus/blur

### Manual (required)

On **iPhone Safari**: focus Pipeline search, Client filter, Deal Info text field, login — **no auto zoom**; pinch-zoom still works.

## Files

- `app/globals.css` (unlayered floor)
- `lib/ui/mobileInputZoom.ts`
- `lib/ui/operationalInputs.ts`
- `components/ui/SearchField.tsx`
- `app/pipeline/PipelinePageClient.tsx`
- pipeline Settings / Document Vault / workspace selects
- `tests/e2e/phase24-3B-mobile-input-zoom.spec.ts`
