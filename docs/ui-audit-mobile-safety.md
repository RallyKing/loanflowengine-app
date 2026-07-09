# UI Audit — Mobile & Viewport Safety (Phase 17.0)

**Mode:** READ-ONLY

## Viewport meta (verified)

```49:57:lender-app/app/layout.tsx
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};
```

**Assessment:** Correct — pinch-zoom allowed (accessibility). No `user-scalable=no`. `interactiveWidget: resizes-content` helps Android keyboard resize.

## Safe-area usage

| Location | Pattern | Gap |
|----------|---------|-----|
| ShareManager | `pb-[env(safe-area-inset-bottom)]` | Good |
| RecordInspectorShell | visual viewport hook | Good |
| Mobile bottom nav | Check padding in component | Verify `pb-safe` on rail |
| Event share drawer | Full height `inset-y-0` | Bottom safe-area on footer actions? |

## Touch target sizing

| Standard | Evidence |
|----------|----------|
| Target ≥40px | `Button`/`Input` defaults; `hubIconButton` `max-md:h-11 w-11`; pipeline ops rail `min-h-[44px]` |
| Undersized | Desktop `h-8 w-8` icons visible on mobile if `max-md` not applied |
| Event item actions | `h-9 w-9` — OK |

## Pinch / zoom behavior

| Risk | Source | Severity |
|------|--------|------------|
| iOS input zoom | Inputs `<16px` font in table inline cells | **High** on `/pipeline` |
| Forced desktop | None found (`min-width: 1024` on body) | Low |
| `maximumScale: 5` | User can zoom out/in | OK |

## Overflow containment

| Container | Pattern | Risk |
|-----------|---------|------|
| AppChrome `<main>` | `overflow-y-auto overflow-x-clip` | Clips accidental overflow — table may need inner scroll |
| Pipeline workspace scroll | `[data-pipeline-workspace-scroll]` + `touch-scroll-y` | Correct delegated scroll |
| Tasks nested list | `overflow-y-auto` + `overflow-x-hidden` | OK |
| Intake dropdown | `overflow-x-hidden` on menu | OK |

## Nested scroll traps

| Surface | Nested scrollport | Policy |
|---------|-------------------|--------|
| Pipeline file workspace | Block panels `max-h-[min(50vh,22rem)]` | Allowed if inner only |
| Task drawer body | `RecordInspectorBody` single owner | OK |
| Mobile nav sheet | `max-h-[70dvh]` | OK |
| Hub filter sheet | Inner `overflow-y-auto` | OK |
| **Violation watch** | File workspace + AppChrome main on desktop file route | MobileChromeController disables main scroll — **verify** |

## Sticky header stacking (mobile)

Stack order on `/events/[id]`:

1. AppChrome header (compressed)
2. ResourceAccessBanner
3. Event sticky header (`HEADER` z=20)

Risk: triple chrome height > 40% viewport on iPhone SE.

## Drawer overflow

| Drawer | Overflow handling |
|--------|-------------------|
| RecordInspector | `max-h-dvh`, `min-h-0`, body scroll |
| Event share | `flex-1 overflow-y-auto overscroll-contain` |
| Vaul workspace | Snap heights — content clip at compact snap |

## Fixed width / min-width violations (sample)

| File | Pattern |
|------|---------|
| `PipelineTableRow.tsx` | Multiple `min-w-[*]` column constraints |
| `PipelinePageClient.tsx` | `max-w-[11rem]` select |
| `IntakeEditor.tsx` | `w-60` dropdown |
| `GlobalSearchPalette.tsx` | Dynamic width from anchor |

## Horizontal overflow risks by route

| Route | Risk level |
|-------|------------|
| `/pipeline` (table) | **Critical** |
| `/pipeline/[fileId]` | Medium (blocks) |
| `/tasks` | High |
| `/events` | Low |
| `/contacts` | High |
| `/intake/*` | Medium |

## `touch-scroll-y` utility

Used on: AppChrome main, SaasSidebar, RecordInspector body, filter sheet, HelpCenter — indicates intentional momentum scrolling on iOS.

## Recommendations for 17.1 (documentation only)

1. Enforce `text-base` min on mobile for inputs in inline table cells
2. Add safe-area padding to fixed bottom drawers (events share footer)
3. Audit file route: confirm `MobileChromeController` pipeline mode on real devices
4. Playwright: extend `phase15-step15A-mobile-viewport` to events + hub table
