# Material Design 3 — Full System Map (Direct Lending Connection)

**Legend — disposition:** **KEEP** (aligned, invest), **MODIFY** (extend tokens/patterns), **REPLACE** (different pattern), **REMOVE** (deprecate usage).  
**Scores:** 1–10 (higher = better for that dimension). **Perf/Mobile/Trust** = impact if modernized.

---

## Legend for scores

| Column | Meaning |
|--------|---------|
| **Cx** | Complexity to reach MD3-native (10 = very hard) |
| **UXv** | UX value of doing so |
| **Perf** | Performance sensitivity |
| **Mob** | Mobile operational impact |
| **Trust** | Fintech trust impact |

---

## Core tokens (`app/globals.css`, `tailwind.config.ts`)

| System | Current implementation | Behavior | MD3 / Material You equivalent | Gap | Disp | Cx | UXv | Perf | Mob | Trust |
|--------|-------------------------|----------|------------------------------|-----|-----|----|----|------|-----|-------|
| **Shape** | `--dlc-shape-corner-*` | Corner radii | MD3 shape system | Partially mapped; not all components use tokens | MODIFY | 3 | 7 | 8 | 8 | 8 |
| **Color (brand)** | `--brand`, `--primary`, SaaS vs classic | Dual schemes | MD3 color roles need **semantic** separation from brand | Material You dynamic color not implemented | MODIFY | 6 | 9 | 9 | 9 | 10 |
| **Surface** | `--dlc-surface-container-*`, `--bg`, `--muted` | Layered backgrounds | MD3 surface container lowest→highest | Tokens exist; JSX often uses shortcuts | MODIFY | 5 | 8 | 8 | 8 | 9 |
| **Elevation** | `--dlc-elevation-1`…`5`, shadows | Card lift | MD3 elevation tiers | Not centrally enforced; z-index not mapped | MODIFY | 4 | 7 | 7 | 7 | 8 |
| **Motion** | `--dlc-motion-duration-*`, easing | Transitions | MD3 duration/emphasis | Vaul + custom not fully token-governed | MODIFY | 4 | 7 | 8 | 8 | 9 |
| **Typography** | `--dlc-type-*` + Noto | Type scale | MD3 type roles | Ad hoc `text-sm` still common | MODIFY | 5 | 8 | 9 | 9 | 9 |
| **Density** | `--dlc-density-*` | Spacing presets | MD3 density | Not user-facing toggle | MODIFY | 5 | 7 | 7 | 8 | 6 |

---

## Navigation

| System | Current | Behavior | MD3 equivalent | Gap | Disp | Cx | UXv | Perf | Mob | Trust |
|--------|---------|----------|----------------|-----|-----|----|-----|------|-----|-------|
| **Top app bar** | `AppChrome` header | Brand + actions | MD3 small/large top app bar | Compact mode via scroll/snap — good; not formalized as MD3 states | MODIFY | 5 | 8 | 8 | 9 | 8 |
| **Navigation rail** | `SaasCollapsedNavRail` | Collapsed SaaS | MD3 NavigationRail | Behavior close; specs (width, item shape) informal | MODIFY | 4 | 7 | 9 | 6 | 8 |
| **Sidebar** | `SaasSidebar` | Expanded nav | MD3 ModalDrawer / DismissibleDrawer | Desktop pattern OK | KEEP | 3 | 7 | 8 | 5 | 8 |
| **Bottom nav** | `MobileBottomNav` | Route switching | MD3 NavigationBar | Focus mode hides — ergonomic tradeoff | MODIFY | 4 | 8 | 8 | 10 | 7 |
| **MainNav** | Classic desktop links | Horizontal | MD3 top tabs / bar destinations | Acceptable | KEEP | 2 | 6 | 9 | 4 | 8 |
| **FAB opportunities** | Sparse | — | MD3 FAB | Quick task / note FAB not strategized | REPLACE | 5 | 7 | 8 | 9 | 6 |

---

## Sheets & overlays

| System | Current | Behavior | MD3 equivalent | Gap | Disp | Cx | UXv | Perf | Mob | Trust |
|--------|---------|----------|----------------|-----|-----|----|-----|------|-----|-------|
| **File workspace sheet** | Vaul top + snap (`PipelineWorkspaceMobileVaulFrame`) | Delegated scroll + snap | MD3 bottom/top sheet (behavioral) | Leading edge for CRM | KEEP | 6 | 10 | 7 | 10 | 9 |
| **Task drawer** | `TaskDrawer.tsx` | Overlay aside scroll | MD3 **standard side sheet** | Structure bespoke | REPLACE | 7 | 9 | 6 | 9 | 8 |
| **Lender drawer** | `LenderDrawer.tsx` | Overlay aside | MD3 side sheet | Same | REPLACE | 7 | 9 | 6 | 9 | 8 |
| **Modal dialogs** | Various Radix/shadcn patterns | Blocking confirm | MD3 Dialog | Needs decision matrix vs sheet | MODIFY | 4 | 8 | 8 | 8 | 10 |
| **Bottom sheet (tool)** | Limited | — | MD3 bottom sheet | Hub filters, etc. — opportunity | REPLACE | 6 | 8 | 7 | 10 | 7 |
| **Scrim** | `--dlc-scrim` | Dim | MD3 scrim | Tie to z-index registry | MODIFY | 3 | 6 | 8 | 8 | 8 |

---

## Content components

| System | Current | MD3 equivalent | Gap | Disp | Cx | UXv | Perf | Mob | Trust |
|--------|---------|----------------|-----|-----|----|-----|------|-----|-------|
| **Cards** | Tailwind + borders + `dlc-surface` | MD3 Elevated/Filled/Outlined | Mixed patterns | MODIFY | 4 | 8 | 8 | 8 | 8 |
| **Tables** | Hub, lenders, contacts | MD3 data tables | Virtualization + density | MODIFY | 7 | 9 | 6 | 7 | 8 |
| **Chips / badges** | Stage pills, tags | MD3 Assist / Filter chips | Assist for AI/suggestions missing | MODIFY | 5 | 8 | 8 | 8 | 8 |
| **Tabs** | Some routes | MD3 Primary tabs | Utilities could use secondary tabs | MODIFY | 4 | 7 | 8 | 8 | 7 |
| **Lists** | Mixed | MD3 list items | Three-line spec informal | MODIFY | 4 | 7 | 8 | 8 | 7 |
| **Menus** | Dropdowns | MD3 Menus | OK | KEEP | 3 | 6 | 8 | 7 | 7 |

---

## Inputs & forms

| System | Current | MD3 equivalent | Gap | Disp | Cx | UXv | Perf | Mob | Trust |
|--------|---------|----------------|-----|-----|----|-----|------|-----|-------|
| **Inline edit** | `inline/*` | MD3 Text field filled/outlined | Finance-specific support text thin | MODIFY | 6 | 10 | 8 | 9 | 10 |
| **Settings forms** | `SettingsPageClient` etc. | MD3 form fields | Large page — sectioning OK | MODIFY | 5 | 7 | 6 | 7 | 8 |
| **Validation** | Convex errors + inline | MD3 error text | Copy consistency | MODIFY | 4 | 9 | 8 | 9 | 10 |

---

## Search & command

| System | Current | MD3 equivalent | Gap | Disp | Cx | UXv | Perf | Mob | Trust |
|--------|---------|----------------|-----|-----|----|-----|------|-----|-------|
| **Global search** | `GlobalSearchPalette` | MD3 Search | Action breadth limited | MODIFY | 5 | 8 | 7 | 7 | 8 |
| **In-page filters** | Hub, lenders | MD3 Search + filter chips | Mobile snap opportunity | MODIFY | 6 | 8 | 7 | 9 | 7 |

---

## Adaptive layouts

| System | Current | MD3 window size classes | Gap | Disp | Cx | UXv | Perf | Mob | Trust |
|--------|---------|-------------------------|-----|-----|----|-----|------|-----|-------|
| **Breakpoints** | Tailwind `sm`/`md` | MD3 compact/medium/expanded | Informal mapping | MODIFY | 5 | 8 | 8 | 9 | 7 |
| **File workspace** | Responsive stack + optional parallel blocks | MD3 pane layouts | Tablet under-powered | MODIFY | 7 | 9 | 7 | 9 | 8 |
| **Pipeline hub** | Table-forward | MD3 responsive data table | Card mode missing | MODIFY | 6 | 9 | 6 | 9 | 7 |

---

## App bars & toolbars

| System | Current | MD3 | Disp |
|--------|---------|-----|------|
| **File chrome** | Snap header surface + transforms | MD3 large/small top region | MODIFY |
| **Master chrome** | `AppChrome` | MD3 app bars + navigation | MODIFY |

---

## Summary disposition counts

- **KEEP:** Convex model, block registry, workspace sheet scroll, `WorkspaceContentContainer`, core tokens (as foundation).  
- **MODIFY:** Most surfaces — align to MD3 **behavior** + token enforcement.  
- **REPLACE:** Task/Lender overlay internals → unified inspector; several mobile modals → snap sheets.  
- **REMOVE:** Ad hoc shadow/motion; obsolete doc claims; duplicate inspector UIs (after migration).

---

*See: `master-enterprise-modernization-report.md`, `side-sheet-master-plan.md`, `snap-sheet-master-plan.md`.*
