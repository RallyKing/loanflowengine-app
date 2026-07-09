# Responsive shell audit (Phase 7)

**Scope:** Application chrome only — layouts, nav, scroll contracts, overlays touching the shell.  
**Last updated:** 2026-05-07

## 1. App layout hierarchy

| Layer | File / component | Role |
|-------|------------------|------|
| Root | `app/layout.tsx` | `body` flex column, `data-shell`, Convex + preferences providers |
| Signed-in shell | `components/AppChrome.tsx` | SaaS vs classic schemes, portal exception, single `<main>` scroll owner |
| Navigation context | `components/navigation/AdaptiveNavigationController.tsx` | Wraps `ResponsiveNavProvider` + `NavigationConfigProvider` (Convex nav prefs) |
| Mobile scroll / focus | `components/MobileChromeController.tsx` | Compact masterpage, `registerMainScrollContainer`, pipeline workspace scroll delegation |
| Responsive layout | `lib/navigation/useResponsiveNavLayout.ts` | `shell`: mobile / tablet / desktop; bottom nav vs tablet strip |
| Pipeline file | `components/PipelineFileWorkspace.tsx` | Delegated scroll `[data-pipeline-workspace-scroll]`; `<main>` `overflow-y-hidden` |

## 2. Duplicate or parallel shell systems

1. **SaaS vs classic** — Two header compositions in `AppChrome.tsx` (sidebar + compact header vs `MainNav` + `TabletContextNav`). Intentional product modes; shared tokens reduce drift.
2. **Mobile compact** — `mobileScrollCollapseGridClass` (binary row collapse) still used in `MobileTopNav` / banners **alongside** new `useMasterScrollCompression` + `MasterHeaderShell` (smooth morph on SaaS). **Residual:** classic scheme does not yet use smooth compression.
3. **Z-index** — Previously mixed `z-30`, `z-40`, `z-50`, `z-[60]`, `z-[100]`. **Normalized** toward `lib/ui/layerTokens.ts` + `lib/platform-framework/overlayStack.ts`.

## 3. Breakpoint sources (pre-unification)

| Source | Values | Usage |
|--------|--------|--------|
| `lib/navigation/responsiveNavConstants.ts` | `768`, `1280` (+ landscape/short helpers) | `deriveResponsiveNavLayout` — **now aliases `lib/ui/breakpoints.ts`** |
| Tailwind default `md` / `xl` | 768 / 1280 | Most `max-md:` / `md:` utilities |
| `TabletContextNav` | `max-lg:flex lg:hidden` | Tablet strip — overlaps “laptop” band; acceptable hybrid |
| `globals.css` | `@media (max-width: 767px)` | Pipeline workspace scroll cushion |

## 4. Spacing / header / sidebar drift risks

- **Header height:** SaaS header uses `mobileChromePaddingExpandedY` / compact grid; classic uses two stacked mobile rows — different nominal heights.
- **Sidebar:** `SaasSidebar` `md:sticky md:top-0 md:h-dvh`; collapsed rail separate column. **`UnifiedSidebarRail`** documents canonical composition.
- **Main padding:** `saasMainPad` / `classicMainPad` reserve bottom space for bottom nav — must stay in sync with `MobileBottomNav` height (~4.25rem + safe area).

## 5. Scroll container conflicts

- **Contract:** Body does not scroll; primary scroller is `[data-app-main-scroll]` except pipeline file (**workspace-delegated**).
- **Risk:** Any route adding `overflow-y-auto` on an ancestor of `<main>` breaks the single-owner rule.
- **Pipeline:** In-file `PipelineMobileWorkspaceOpsRail` was **sticky inside workspace**; **Phase 7** moves to **fixed** dock + keyboard inset — removes scroll coupling but requires bottom offset for bottom nav.

## 6. Sticky / z-index conflicts (mitigated)

| Surface | Tier (target) | Notes |
|---------|---------------|--------|
| Header | `SHELL_Z.header` (20) | SaaS header explicit style |
| Bottom nav | `SHELL_Z.bottomNav` (30) | Replaces ad-hoc `z-30` |
| Nav scrim | `SHELL_Z.navScrim` (40) | SaaS mobile menu |
| Mobile sidebar | `z-[45]` in `SaasSidebar` | Aligns with `SHELL_Z.mobileSidebar` |
| Workspace dock | `SHELL_Z.workspaceDock` (28) | Below bottom nav z; positioned with `calc` + nav reserve |
| Search overlay | `OVERLAY_Z_BASE.modal` | Replaces `z-[100]` |
| Nav auxiliary panel | `SHELL_Z.navAuxiliary` | Replaces `z-[60]` |
| Modals / inspectors | `OVERLAY_Z_BASE` | Unchanged |

## 7. Motion inconsistencies (mitigated)

- **`lib/ui/motionTokens.ts`** — Canonical durations / curves for shell work.
- **`lib/mobileCompactChrome.ts`** — Still uses fixed Tailwind durations; **follow-up:** map arbitrary classes to tokens where Tailwind allows.

## 8. Navigation persistence (Step 5)

- **Convex:** `navigationUserConfig` (order, visibility, quick actions, layout mode).
- **Local:** `LS_TABLET_BOTTOM_NAV`, nav preferences localStorage, `recordNavRoute`.
- **Dedicated route:** `/settings/navigation-manager` surfaces `NavManager` without scrolling the full settings tree.

## 9. Follow-up (non-blocking)

1. Extend **smooth header compression** to **classic** scheme.
2. Replace remaining hardcoded `z-*` in pipeline drawers with `OVERLAY_Z_BASE` when those files are touched.
3. Consider **CSS variables** for motion duration if Tailwind arbitrary values must match tokens exactly.
4. **TabletContextNav** max-lg breakpoint vs `shell === "tablet"` — align naming in code comments only (behavior OK).
