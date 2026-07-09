# Phase 24.4A — Scroll Effect Removal Plan (Do Not Implement Yet)

**Companion:** `docs/phase24-4A-scroll-audit.md`  
**Status:** Plan only — **Phase 24.4B** awaits explicit approval.  
**User intent:** Remove collapsing/minimizing top-area behavior; restore natural scrolling.

---

## Principles for 24.4B

1. **Preserve** single-scroll architecture (`[data-app-main-scroll]` hub, `[data-pipeline-workspace-scroll]` file).
2. **Remove** scroll-linked chrome motion before tuning CSS polish.
3. **Update tests** that assert compression/compact flags (`phase9-master-experience`, `pipeline-scroll` compact sections).
4. Run `npm run qa:governance` + manual iPhone/Android hub + file scroll after changes.

---

## SAFE TO REMOVE (scroll-linked chrome — matches user request)

These directly implement “collapsing / minimizing / artificial header” behavior.

| Item | Files | Components / hooks | Listeners / CSS | Pipeline routes |
|------|-------|-------------------|-----------------|-----------------|
| Master header scroll compression | `hooks/useMasterScrollCompression.ts` | `useMasterScrollCompression` | `main` `scroll` + RAF lerp | Hub tablet/desktop |
| Header transform application | `components/layout/MasterHeaderShell.tsx` | `MasterHeaderShell` | inline `transform`/`opacity` | Hub tablet/desktop |
| Compression wiring | `components/AppChrome.tsx` | `AppChromeBody` | L158-163, L179-183, L291-293, L429-431 | Hub (+ connectivity strip fade) |
| Mobile compact/focus state machine | `components/MobileChromeController.tsx` | `MobileChromeProvider` | `scroll` listener L258; IO L201-208; html attrs L277-283 | Hub mobile + file mobile |
| Hub scroll-row collapse | `app/pipeline/PipelinePageClient.tsx` | `PipelinePageClient` | `mobileScrollCollapseGridClass` / `mobileScrollRevealInnerClass` at L1479, L1588, L1910; `isMobileCompactMode` L370 | Hub mobile only |
| Hub title shrink on compact | `app/pipeline/PipelinePageClient.tsx` | same | L1454-1455 `max-md:text-base` | Hub mobile |
| Mobile compact CSS helpers | `lib/mobileCompactChrome.ts` | `mobileScrollCollapseGridClass`, `mobileScrollRevealInnerClass`, `mobileCompactTransition` (hub usage) | grid/opacity/transform classes | Hub (+ unused imports in file workspace) |
| Bottom nav hide on focus | `components/MobileBottomNav.tsx` | `MobileBottomNav` | `mobileFocusBottomNavHidden` transform | Hub mobile (when compact) |
| Focus mode subscription | `components/MobileChromeController.tsx` | `useMobileBottomNavFocusMode`, `publishMobileFocusMode` | external store | Hub mobile |
| File workspace header scale tiers | `components/PipelineFileWorkspaceShell.tsx` | snap chrome inner div | L199-206 `scale`/`opacity` by `snapAttr` | File mobile |
| File compact sentinel + IO path | `components/PipelineFileWorkspaceShell.tsx` | sentinel `data-dlc-main-compact-sentinel` | L232-237 + IO in `MobileChromeController` | File mobile |
| Phase 9 compression test | `tests/phase9-master-experience.spec.ts` | test L44-73 | asserts translate on scroll | N/A — update/remove assertion |
| Pipeline compact e2e | `tests/e2e/pipeline-scroll.spec.ts` | L570-622 | expects `data-dlc-mobile-compact` | Update to expect **no** compact |

### Removal approach (24.4B — suggested order)

1. **Disable** `useMasterScrollCompression` on pipeline paths (or globally) — pass neutral compression; delete listener in hook or gate with `enabled: false` for pipeline zone.
2. **Stop** `MobileChromeProvider` from toggling `compactChrome` on `/pipeline` and `/pipeline/*` (route guard) OR remove provider scroll effects entirely if product wants global native scroll.
3. **Strip** `mobileScrollCollapse*` wrappers from `PipelinePageClient` (keep controls always visible on mobile).
4. **Remove** file header scale/opacity snap styling (keep snap header as static `shrink-0` block).
5. **Delete** unused imports in `PipelineFileWorkspace.tsx` L172-173.
6. Fix tests/docs that certified removed behavior.

---

## SAFE TO KEEP (required architecture & non-scroll UX)

| Item | Files | Why keep |
|------|-------|----------|
| `AppChrome` `<main>` scroll owner | `components/AppChrome.tsx` | Governance single-scroll contract |
| Workspace delegated scroll | `components/PipelineFileWorkspaceShell.tsx` L216-225 | File route authority |
| `registerMainScrollContainer` / `registerPipelineWorkspaceScroll` | `MobileChromeController.tsx` | May still be needed for future; harmless refs if scroll listeners removed |
| Virtualized hub rows | `components/pipeline/PipelineHubVirtualizedLists.tsx` | Performance; `translateY` is not chrome |
| Horizontal board pan | `PipelinePageClient.tsx` L2495-2497, `PipelineBoardView.tsx` L463 | `overflow-x-auto` only |
| `ResponsiveToolbarGroup` | `components/ui/ResponsiveToolbarGroup.tsx` | Viewport breakpoints, not scroll |
| `scrollContinuity` on projection change | `lib/ui/scrollContinuity.ts`, `PipelinePageClient.tsx:1601` | Prevents filter jump when switching hub modes — **optional** to keep; not “collapse” |
| Nested scroll in drawers/sheets | triage sheet, filter sheet, etc. | Isolated; `overscroll-contain` |
| `overflow-anchor: none` on scrollports | `globals.css:674-676` | Stability choice; not collapse |
| Pipeline scroll padding/margin tokens | `globals.css:635-663` | Anchor clearance for file sections |
| `PipelineWorkspaceMobileVaulFrame` | `components/PipelineWorkspaceMobileVaulFrame.tsx` | Separate mobile sheet UX — **keep unless** user wants full-page file layout on phone |
| `PipelineMobileWorkspaceOpsRail` | `components/pipeline/PipelineMobileWorkspaceOpsRail.tsx` | Fixed shortcuts — not header collapse (review if dock shadow on scroll feels “artificial”) |
| Popover scroll listeners | triage popover, momentum stars, etc. | Positioning only |

---

## UNKNOWN / NEEDS REVIEW (decide in 24.4B planning)

| Item | Files | Question |
|------|-------|----------|
| `scroll-behavior: smooth` | `globals.css:667-669` | Remove for pipeline only or app-wide? Strong candidate for “non-native” feel. |
| `OperationalOrientationStrip` sticky | `OperationalOrientationStrip.tsx:155-157`, `PipelinePageClient.tsx:2212` | Set `sticky={false}` on hub? Reduces sticky reflow; band scrolls away. |
| Hub filter card `backdrop-blur` | `PipelinePageClient.tsx:1561` | Cosmetic; not scroll-linked — keep unless simplifying hub chrome. |
| `OperationalContentReveal` | `components/ui/OperationalContentReveal.tsx` | Mount opacity fade — minor; not scroll-driven. |
| `withOperationalScrollPreserved` | `PipelinePageClient.tsx:1601` | Keep to prevent mode-switch scroll jump, or accept jump for native behavior? |
| `scrollIntoView` hub focus | `PipelinePageClient.tsx:1068-1078` | Change to `behavior: "auto"` or remove? |
| File `scrollIntoView` / hash navigation | `PipelineFileWorkspace.tsx:1410-1420` | Needed for deep links; use `auto` not `smooth`? |
| `useMasterScrollCompression` on **non-pipeline** routes | same hook | User complaint is pipeline — disable globally or pipeline-only? |
| `MobileChromeProvider` entirely | `MobileChromeController.tsx` | If only used for compact/focus, removing scroll effects may leave dead registration API. |
| Vaul mobile file sheet | `PipelineWorkspaceMobileVaulFrame.tsx` | Large UX change if removed — not “header collapse” but affects viewport stability. |
| `PipelineMobileWorkspaceOpsRail` scroll-linked shadow | L145-177 | Cosmetic scroll coupling — easy to neutralize. |
| SaaS `max-md:max-h-14` header clip | `AppChrome.tsx:285` | Static clip, not scroll — may still feel “cramped”. |
| Certification docs | `lender-app/docs/phase9-*.md`, `responsive-shell-audit.md` | Update after removal. |

---

## Exact removal checklist (copy for 24.4B tickets)

### Hooks

- [ ] `useMasterScrollCompression` — remove or hard-disable for `/pipeline` and `/pipeline/*`

### Listeners

- [ ] `hooks/useMasterScrollCompression.ts` — `main.addEventListener("scroll", …)` L123
- [ ] `components/MobileChromeController.tsx` — scroll listener L258
- [ ] `components/MobileChromeController.tsx` — IntersectionObserver L201-208 (file sentinel)
- [ ] `components/pipeline/PipelineMobileWorkspaceOpsRail.tsx` — optional: scroll shadow L107-111

### Components (edit, not necessarily delete files)

- [ ] `components/layout/MasterHeaderShell.tsx` — stop applying scroll-driven `style.transform`
- [ ] `components/AppChrome.tsx` — stop passing live compression / strip opacity coupling
- [ ] `app/pipeline/PipelinePageClient.tsx` — remove `useMobileChrome` compact UI branches
- [ ] `components/PipelineFileWorkspaceShell.tsx` — remove scale/opacity snap inner wrapper
- [ ] `components/MobileBottomNav.tsx` — remove focus hide transform (if focus mode removed)

### CSS

- [ ] `app/globals.css` — consider `scroll-behavior: auto` for `[data-app-main-scroll]` / `[data-pipeline-workspace-scroll]`
- [ ] `lib/mobileCompactChrome.ts` — deprecate collapse helpers if no callers remain

### HTML document attributes

- [ ] Stop toggling `data-dlc-mobile-compact` / `data-dlc-mobile-focus` (`MobileChromeController.tsx:277-283`)

### Tests to update

- [ ] `tests/phase9-master-experience.spec.ts` — header compression test
- [ ] `tests/e2e/pipeline-scroll.spec.ts` — compact/focus polls L570-622
- [ ] Any snapshot tests referencing compressed header

---

## Risk matrix

| Change | Risk | Mitigation |
|--------|------|------------|
| Remove master compression | Low on file; medium on hub desktop | Visual-only; verify tablet header height |
| Remove mobile compact | Medium — more hub chrome visible on phone | Accept taller chrome; verify touch targets |
| Remove file header scale | Low | Static header may be taller |
| Remove Vaul sheet | **High** — mobile file UX paradigm shift | **Do not** bundle with chrome removal unless explicitly requested |
| `sticky={false}` orientation strip | Low | User may lose sticky context band — confirm |

---

## Expected outcome after 24.4B (if plan approved)

- Scrolling hub/file content moves **only** `scrollTop` of the canonical container — no parallel RAF header animation.
- Mobile hub toolbar rows **do not** collapse height while scrolling.
- `<html>` no longer flips compact/focus attributes during pipeline scroll.
- Header remains **fixed height** in shell (modulo static responsive CSS).
- **Data, routing, virtualization, and workspace scroll delegation unchanged.**

---

## Sign-off questions for product

1. Pipeline-only vs app-wide removal of master compression?
2. Keep mobile bottom nav always visible on hub?
3. Keep Vaul file sheet on mobile?
4. Hub `OperationalOrientationStrip`: sticky or in-flow?

---

*Phase 24.4A complete. No code removed in this phase.*
