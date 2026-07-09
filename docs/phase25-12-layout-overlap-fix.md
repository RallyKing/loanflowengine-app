# Phase 25.12 — File details revenue / scenario text overlap fix

**Date:** 2026-05-28  
**Scope:** UI layout only (pipeline file workspace **File details** block). No schema, ACL, or backend changes.

## Symptom

On `/pipeline/[fileId]`, under **Revenue tracking** and **Scenario**, multi-line text (LTV tiers, roll-up lines, long scenario notes such as appraisal commentary) appeared stacked on top of each other — unreadable.

## Root cause

Phase 18.5 **locked-height** inline display tokens (`OP_INLINE_DISPLAY_CLASS`: `min-h-10 h-10`) were reused for **`InlineTextarea`** read mode with `whitespace-pre-wrap`. Multi-line scenario content overflowed the fixed 40px box. Because the parent **CSS grid** row height did not grow with that overflow, following rows (property address, scenario block, roll-up copy) painted in the same vertical band — classic overlap, not absolute positioning.

No `position: absolute` or rigid `h-16`/`max-h-20` wrappers were found in the revenue block itself.

## Files changed

| File | Change |
|------|--------|
| `lender-app/lib/ui/operationalInputs.ts` | Added `OP_INLINE_TEXTAREA_DISPLAY_CLASS` — `h-auto`, `min-h-[5rem]`, `items-start`, relaxed line height (no `h-10`). |
| `lender-app/components/inline/useInlineCommit.ts` | Exported `inlineClasses.displayTextarea`. |
| `lender-app/components/inline/InlineTextarea.tsx` | Read/edit display uses `displayTextarea` + `break-words` / `[overflow-wrap:anywhere]`. |
| `lender-app/components/PipelineFileWorkspace.tsx` | Revenue tracking + roll-ups wrapped in `flex flex-col gap-y-2/3`; scenario field `gap-y-2`; scenario editor `rows={3}`. |

## CSS / layout summary

- **Removed:** Implicit `h-10` lock on multi-line inline textarea display.
- **Added:** `OP_INLINE_TEXTAREA_DISPLAY_CLASS` for growing block-level textarea chrome.
- **Structure:** `flex flex-col gap-y-*` stacks metrics → roll-ups → address → scenario sequentially inside the file-details grid.

## Verification

- `npm run build` (from `lender-app/`)
- Production deploy: `npm run deploy:prod` → https://dlcfunds.vercel.app
- Manual smoke: open any file with a long **Scenario** field; confirm lines flow vertically with spacing under **Revenue tracking** and **Organization roll-ups**.

## Out of scope

Pipeline hub filter band overlap (Phase 25.11 audit) — separate fix; not modified here.
