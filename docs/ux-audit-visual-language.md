# UX Audit — Visual Language Cohesion (Phase 17.5)

**Mode:** READ-ONLY  
**Canonical:** `docs/material-design-system.md`, `globals.css`, `tailwind.config.ts`, Phase 17.0 `ui-audit-design-token-drift.md`

## Visual dialects (active)

| Dialect | Signals | Prevalence | Post-17 status |
|---------|---------|------------|----------------|
| **A — DLC Material** | `rounded-dlc-*`, `shadow-dlc-*`, `dlc-surface-*`, `text-dlc-*` | ~15–20% of surfaces | Target |
| **B — shadcn/Tailwind legacy** | `rounded-md`, `shadow-sm`, `bg-card`, `text-sm font-semibold` | **Dominant** | Hub, table, most pages |
| **C — Ad-hoc elevation** | `z-[calc(...)]`, `bg-black/45`, custom shadows | Modals, sticky file chrome | Documented exceptions |
| **D — Intake/deal** | `rounded-xl` menus, muted table headers | Intake only | Isolated island |
| **E — Events 3A** | Partial DLC on list/detail | Events route | Mixed with B |

**Total visual dialects:** **5** (JSON metric).

---

## Typography

| Use | DLC | Legacy |
|-----|-----|--------|
| Page title | Events `text-dlc-title-lg` | `text-2xl font-semibold` most pages |
| Section label | Rare `text-dlc-label-*` | `text-xs uppercase tracking-wider` |
| Table header | — | `text-xs uppercase` / `text-[11px]` intake |
| Row primary | `RowShell` truncate | Table cell fonts vary |

**Issue:** No enforced type ramp on pipeline hub — largest cognitive surface uses dialect B.

---

## Spacing & radius

- Row padding: `px-3 py-2` (hub card) vs table cell padding vs `RowShell` gaps — **3 scales**.
- Section gaps: `gap-2` / `gap-3` / `gap-4` without density token binding to `tableDensity` setting.
- Radius: `rounded-dlc-md` on primitives; hub uses `rounded-md` cards.

---

## Shadows & elevation

- **60+** `shadow-sm` usages vs **~15** `shadow-dlc-*`.
- Cards: hub file row `shadow-sm` border; DLC cards on shared workspace — **same semantic level, different elevation**.

---

## Badges & pills

| Source | Semantics |
|--------|-----------|
| `ui/Badge.tsx` | Tokenized |
| `EventCollaboratorRoleBadge` | Parallel palette |
| `ResourceOwnershipBadge` | Ownership |
| `PipelineHubRelationshipBadges` | Graph edge types |
| Stage/status chips | Custom colors per stage |

**Muted text:** `text-muted-foreground` universal; some headers use `foreground/80` — acceptable bridge, inconsistent emphasis hierarchy.

---

## Borders & dividers

- `border-border/60` vs `border-border/80` — informal opacity steps.
- Hub toolbar `border-t` on mobile wrap — visual noise.

---

## Sticky surfaces

- File workspace sticky uses CSS variable stack — good.
- Ledger/lenders `z-[1]`/`z-[2]` — legacy numeric, low conflict risk.

---

## Overlays & scrims

- `overlayScrimClass()` / `--dlc-scrim` on `OverlayShell` and inspector — **coherent**.
- Legacy `bg-black/45` on a few modals — **drift**.

---

## Post–Phase 17 visual wins

- Header compression reduces vertical **visual tension** on file/task/event.
- Touch targets align better with Material motion on mobile actions.
- Z-index registry reduces **stacking chaos** (dialect C shrinking).

---

## Unification sequence (Phase 18 doc)

1. **Primitives only** — Button, Input, Badge, RowShell, ActionSuite → 100% DLC tokens.
2. **Hub shell** — toolbar + stage chips + cards → dialect A without touching table cells.
3. **Shared/events rows** — already candidates; extend `dlc-surface-card`.
4. **Table** — last; map density modes to tokenized row heights.
5. **Intake island** — separate track or explicit “deal workspace” sub-theme.

**Do not** big-bang token sweep — regression surface = entire pipeline hub.
