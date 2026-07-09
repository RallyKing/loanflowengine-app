# UI Audit — Design Token Drift (Phase 17.0)

**Mode:** READ-ONLY  
**Canonical:** `docs/material-design-system.md`, `lender-app/app/globals.css`, `lender-app/tailwind.config.ts`

## Adoption snapshot (TSX grep, approximate)

| Token family | Pattern | Files with matches (indicative) | Assessment |
|--------------|---------|--------------------------------|------------|
| **DLC shadows** | `shadow-dlc-*` | ~15 files | Low adoption |
| **Legacy shadows** | `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl` | **60+** files | Dominant dialect |
| **DLC radius** | `rounded-dlc-*` | ~20 files | Low |
| **Legacy radius** | `rounded-md/lg/xl/2xl` | **90+** files | Dominant |
| **DLC typography** | `text-dlc-*` + leading/tracking | **~8 files** | Critical drift |
| **DLC surfaces** | `dlc-surface-*`, `bg-dlc-surface` | **~12 files** | Critical drift |
| **Semantic muted** | `text-muted-foreground`, `bg-muted` | Ubiquitous | OK as bridge |
| **Brand** | `text-brand-accent`, `ring-brand-accent` | Common | OK |

## Multiple visual dialects

### Dialect A — DLC Material (target)

- `rounded-dlc-md`, `shadow-dlc-1`, `text-dlc-body-md`, `.dlc-surface-card`
- Used in: UI primitives (`Button`, `Input`, `Badge`), `ProgressiveDisclosureCard`, parts of events 3A

### Dialect B — Tailwind shadcn legacy

- `rounded-lg`, `shadow-sm`, `text-sm font-semibold`, `bg-card`
- Used in: pipeline hub, hub rows, most app pages

### Dialect C — Custom one-off

- `shadow-[var(--dlc-elevation-4)]`, `z-[calc(...)]`, `bg-black/45`
- Used in: modals, mobile nav, onboarding

### Dialect D — Intake / deal workspace

- Mixed field chrome, `rounded-xl` menus, table `bg-muted/50` headers
- Partial `shadow-dlc-3` on dropdowns

## Spacing inconsistencies

| Pattern | Examples |
|---------|----------|
| Page padding | `px-3 py-4` vs `px-4 sm:px-6` vs `p-6` modals |
| Row padding | `px-3 py-2` hub card vs table cell padding |
| Section gaps | `gap-2` vs `gap-3` vs `gap-4` without density token |
| Touch gaps | `gap-1` action clusters vs `gap-1.5` events |

## Typography drift

- Page titles: `text-dlc-title-lg` (events) vs `text-2xl font-semibold` (elsewhere)
- Section labels: `text-xs uppercase tracking-wider` (consistent informally) vs `text-dlc-label-*` (rare)
- Table headers: `text-xs uppercase` vs `text-[11px]` (intake)

## Badge drift

| Style | Where |
|-------|-------|
| `components/ui/Badge.tsx` | Tokenized base |
| `EventCollaboratorRoleBadge` | Custom border/amber/sky |
| `SharedResourceRow` type badges | Inline emerald/sky |
| Pipeline status | `getPipelineStatusBadgeStyle` |
| Relationship badges | `ClientRelationshipBadge`, `PipelineHubRelationshipBadges` |

## Card / divider drift

- Cards: `border border-border/60 bg-background shadow-sm` vs `dlc-surface-card`
- Dividers: `divide-y divide-border` vs `border-t border-border/60` vs `border-border/80`

## Hover states

| Style | Where |
|-------|-------|
| `hover:bg-muted/40` | Event items |
| `hover:bg-muted` | Tables, menus |
| `duration-dlc-short1` | ClientMomentumStars, some pipeline |
| No transition | Many older buttons |

## Z-index drift

- Documented: `Z_LAYER`, `SHELL_Z`, `OVERLAY_Z_BASE`
- Actual: `z-10`, `z-30`, `z-50`, `z-[2]`, CSS vars — see overlay map

## Dark mode / SaaS

- `data-color-scheme="saas"` vs classic — elevation overrides in globals
- Risk: translucent `bg-background/95` without `[background-color:rgb(var(--bg))]` bridge on menus
- Role badges use explicit `dark:` pairs (events, shared) — good pattern to centralize

## Legacy styles to flag

- `shadow-card` (tailwind extend)
- `animate-slide-in-right` (drawer — OK if tokenized)
- `text-[10px]`, `text-[11px]` arbitrary sizes
- `rounded-[...]` arbitrary (forbidden by material rules — grep if any)

## Highest-impact token migration targets

1. `PipelineHubFileRow.tsx` — card shadow/radius
2. `app/pipeline/PipelinePageClient.tsx` — hub shell card
3. `PipelineTableRow.tsx` — row hover duration (careful)
4. `RecordInspectorShell.tsx` — overlay surface class
5. `components/ui/hubRowActionPrimitives.tsx` — already partial

## Forbidden patterns observed (policy violations)

| Pattern | Count | Note |
|---------|-------|------|
| `shadow-[0_` custom | Low | Check on audit |
| `z-50` ad-hoc | 3+ files | Overlay map |
| `bg-black/40` scrims | Many | Should use `--dlc-scrim` |
