# Phase 24.3B — Mobile Input Zoom Audit

**Status:** Complete  
**Date:** 2026-05-29

## Root cause

**iOS Safari** (and some Android WebViews) auto-zoom the layout viewport when the user focuses a text-like control whose **computed `font-size` is below 16px**.

This is not fixed by `maximum-scale=1` or `user-scalable=no` (those block accessibility). The fix is **≥16px computed font-size on mobile** for every editable control.

## Viewport configuration (verified)

| Setting | Value | File |
|---------|--------|------|
| `width` | `device-width` | `app/layout.tsx` |
| `initialScale` | `1` | `app/layout.tsx` |
| `maximumScale` | `5` (pinch zoom allowed) | `app/layout.tsx` |
| `viewportFit` | `cover` | `app/layout.tsx` |
| `interactiveWidget` | `resizes-content` | `app/layout.tsx` |

**Not used:** `user-scalable=no`, `maximum-scale=1`.

`visualViewport` listeners in `useResponsiveNavLayout.ts` and workspace dock code adjust **keyboard inset** only; they do not change document scale.

## Global fix (shipped)

### 1. Design token — `MOBILE_SAFE_FORM_FONT_CLASS`

`lender-app/lib/ui/mobileInputZoom.ts`

```ts
export const MOBILE_SAFE_FORM_FONT_CLASS = "text-base md:text-sm";
```

- Mobile (`< md`): **16px** (`text-base`)
- Desktop (`≥ md`): **14px** (`text-sm`) — unchanged density

### 2. Canonical primitives

| Component | Path | Mobile computed | Desktop computed |
|-----------|------|-----------------|------------------|
| `Input` | `components/ui/Input.tsx` | 16px | 14px |
| `Textarea` | `components/ui/Input.tsx` | 16px | 14px |
| `Select` | `components/ui/Input.tsx` | 16px | 14px |
| `opInputFieldClass` | `lib/ui/operationalInputs.ts` | 16px | 14px |
| `OP_INLINE_TEXTAREA_CLASS` | `lib/ui/operationalInputs.ts` | 16px | 14px |
| `OP_INLINE_EDIT_CLASS` | via `opInputFieldClass` | 16px | 14px |
| Inline `InlineText` / `InlineTextarea` / `InlineSelect` / `InlineDate` / `InlineNumber` | `components/inline/*` | 16px | 14px |

### 3. CSS floor (backstop for raw markup)

`app/globals.css` — `@media (max-width: 767px)`:

- `input` (except checkbox, radio, range, hidden, file, button, submit, reset, image, `.op-micro-control`)
- `textarea`
- `select`
- `[contenteditable]`

Forced to `font-size: 1rem` (16px) so one-off `className="… text-sm …"` cannot regress zoom.

### 4. High-traffic overrides

| Component | Path | Before | After |
|-----------|------|--------|-------|
| Global search field | `components/GlobalSearchPalette.tsx` | `text-sm` | `text-base md:text-sm` |

## Static scan — controls near sub-16px classes

Automated scan (`node scripts/audit-mobile-input-font.mjs`) found **139** TSX lines where a native control appears within 8 lines of `text-xs` / `text-sm` / `text-[10–15px]`. These are **mitigated on mobile** by the globals.css floor.

Representative paths (not exhaustive):

| Area | Example paths | Control types |
|------|---------------|---------------|
| Pipeline | `PipelinePageClient.tsx`, `PipelineFileWorkspace.tsx`, `FileTaskTriageComposer.tsx` | `select`, `input`, `textarea` |
| Tasks | `app/tasks/page.tsx`, `components/TaskDrawer.tsx` | `input`, `select` |
| Notes | `components/pipeline/notes/NoteComposer.tsx` | `textarea` (via `OP_INLINE_TEXTAREA_CLASS`) |
| Settings | `components/settings/PipelineStagesManager.tsx`, `OrganizationSettingsPanel.tsx` | `input` |
| Events / contacts / ledger | `EventDetailClient.tsx`, `contacts/page.tsx`, `ledger/page.tsx` | mixed |
| Dialogs | `NewPipelineFileDialog.tsx`, `NewPipelineHierarchyCreateDialog.tsx` | `select` |
| Auth | `app/login/page.tsx`, `forgot-password/page.tsx` | `input` |

**Excluded from zoom risk (by design):** checkbox, radio, hidden file pickers, range sliders.

## Controls *not* triggering zoom

| Pattern | Reason |
|---------|--------|
| `InlineSelect` badge button (`asBadge`) | Button, not `<select>` until edit mode |
| Display-only inline buttons | Not inputs |
| `text-sm` on labels beside inputs | Labels are not focused for typing |

## Validation

### Automated (prod E2E when `PW_BASE_URL` set)

`tests/e2e/phase24-3B-mobile-input-zoom.spec.ts`

- Viewport meta allows pinch zoom
- `/tasks` search: `font-size ≥ 16`, `visualViewport.scale ≈ 1` on focus/blur
- Global search palette: same checks

### Manual (required per `docs/mobile-testing-rules.md`)

On **iPhone Safari**, **iPhone PWA**, **Android Chrome**, **Android PWA**:

1. Focus inputs on pipeline, tasks, notes, settings, dialogs
2. Confirm **no layout zoom**
3. Blur — viewport returns without reload
4. Navigate — repeat

## Files changed (implementation)

- `lib/ui/mobileInputZoom.ts` (new)
- `lib/ui/operationalInputs.ts`
- `components/ui/Input.tsx`
- `components/GlobalSearchPalette.tsx`
- `app/globals.css`
- `scripts/audit-mobile-input-font.mjs` (new)
- `tests/e2e/phase24-3B-mobile-input-zoom.spec.ts` (new)
