# Phase 1 — Pre-change audit: layout-bound transitions (mobile compact)

**Date:** investigation before edits.  
**Goal:** List transitions removed or narrowed to `transform` + `opacity` only.

| Symbol / pattern | Location | Properties (before) | Action |
|------------------|----------|---------------------|--------|
| `mobileCompactTransition` | `lib/mobileCompactChrome.ts` | padding, gap, box-shadow, min-height, font-size | → **opacity, transform** only (max-md) |
| `mobileScrollCollapseGridClass` | same | `transition-[grid-template-rows]` 300ms + 0fr/1fr | → **no** grid-row transition (instant 0fr/1fr) |
| `mobileScrollRevealInnerClass` | same | opacity, transform | **keep** (already safe) |
| `mobileContentBottomPadTransition` | same | `transition-[padding]` 300ms | → **`transition-none`** on max-md |
| `mobileFocusChromeTransition` | same | transform, opacity, **padding, gap, box-shadow** | → **transform, opacity** only |
| `mobileNavTransformTransition` | same | transform, opacity | **keep** |
| `mobileWorkspaceStackClass` | same | gap classes, no transition | **keep** (instant gap swap) |
| SaaS menu button | `AppChrome.tsx` | `transition-[width,height]` | **remove** (instant) |
| `pipelineWorkspaceCollapseGrid` | `lib/pipelineWorkspaceCard.ts` | `transition-[grid-template-rows]` 300ms | **remove** (instant collapse) |
| Card frame shadow | `pipelineWorkspaceCard.ts` | box-shadow, bg, border | **unchanged** (not scroll-compact driven) |

**Consumers:** `AppChrome.tsx`, `PipelineFileWorkspaceShell.tsx`, `PipelineFileWorkspace.tsx`, `PipelinePageClient.tsx` — all pull from the libs above; no per-file transition additions required beyond AppChrome button.

---

## Post-change summary (applied)

| File | Change |
|------|--------|
| `lib/mobileCompactChrome.ts` | `mobileCompactTransition` → opacity+transform only (max-md); grid collapse **instant**; `mobileContentBottomPadTransition` → `max-md:transition-none`; `mobileFocusChromeTransition` → transform+opacity only |
| `lib/pipelineWorkspaceCard.ts` | `pipelineWorkspaceCollapseGrid` — removed `transition-[grid-template-rows]` and duration (CollapsibleSection snap) |
| `components/AppChrome.tsx` | Removed SaaS menu **width/height** transitions; pipeline back link uses **transform-only** transition (was transform+background-color) |

**Build:** `npm run build` — OK. **Deploy:** `npm run deploy:vercel` — production READY (inspect URL in Vercel output).

**Manual QA:** Confirm on physical **iPhone Safari** + **Android Chrome** (this agent did not run device passes).
