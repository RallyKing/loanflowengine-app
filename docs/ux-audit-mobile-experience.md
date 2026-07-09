# UX Audit — Responsive & Mobile Experience (Phase 17.5)

**Mode:** READ-ONLY  
**Builds on:** `docs/ui-audit-responsive-map.md`, `docs/ui-audit-mobile-safety.md`, Phase **17.4** mobile safety deploy

## Evaluation axes

| Axis | Score (1–5) | Notes |
|------|-------------|-------|
| Operationally safe | **4** | Scroll contract stable; nested scroll marked |
| Mobile-native | **3** | Vaul + bottom nav; hub still desktop-shaped |
| Touch-friendly | **4** | Post-17.4 `touchTargetIconClass` on key actions |
| Context-preserving | **3** | Filters persist; projection resets hurt |

---

## Viewport & safe area

- `layout.tsx` viewport: `maximumScale: 5`, `viewportFit: cover` — **good** (a11y zoom).
- `globals.css` — `[data-app-shell-root]` `overflow-x: hidden` (17.4).
- Inspector sheet safe-area padding — **added 17.4**.
- Bottom nav — verify env(safe-area-inset-bottom) on all states.

---

## Touch targets

| Area | Status |
|------|--------|
| ActionSuite / header overflow | 44px `max-md` — **17.4** |
| `PipelineTableRow` inline controls | **Risk** — not all cells migrated |
| Events list actions | `h-9` — borderline |
| Hub stage chips | Wrap OK; tap targets vary |
| `hubRowActionPrimitives` legacy | May still expose `h-8` on unmigrated rows |

---

## Mobile hierarchy readability

- **Hierarchy tree** on narrow: indent + truncated labels — OK.
- **Projection lists**: flat cards — parent path often missing — **fail**.
- **14-column table** on mobile table mode — **critical readability failure**; cards mode mitigates.
- **File workspace**: Vaul snap — hierarchy readable in chrome; utilities collapsed — **good**.

---

## Overlays & drawers

| Surface | Mobile pattern | Issue |
|---------|----------------|-------|
| `RecordInspectorShell` | Bottom sheet | OK with nested scroll body |
| Task/lender drawer | Same | Content height |
| Event share panel | `fixed` right | OK full-width |
| Global search | Centered | Keyboard overlap handled |
| Hub filter sheet | `md:hidden` | OK |
| Vaul file workspace | Snap fractions | CLS on snap change — monitor |

---

## Sticky collisions

- File sticky header + Vaul handle — tested in governance docs; maintain.
- Event sticky `-mx-3` — can clip under AppChrome banner — low frequency.
- Hub stage strip sticky — competes with compressed mobile header.

---

## Nested scrolling

**Policy:** single owner per route; inner `[data-nested-scroll]` only.

| Surface | Post-17.4 |
|---------|-----------|
| Inspector body | Marked |
| File activity | Marked |
| Lender search list | Marked |
| Event panel | Marked |
| Block panels `max-h-[min(50vh,22rem)]` | Still **trap risk** if user expects page scroll |

---

## Desktop assumptions remaining

- `PipelineTableRow` min-width grid — forced on mobile table display.
- Board horizontal columns — weak on phone (board hidden narrow).
- `max-w-[11rem]` sort select — desktop remnant on `sm+`.
- Contacts/ledger tables — full desktop tables.
- Intake 14 overflow hits — unchanged in 17.x.

---

## Text squeezing & overflow

- `min-w-0` propagated on AppChrome, hub shells (17.4) — **improved**.
- Long lender/program names in drawer — truncate OK.
- Hub toolbar flex-wrap — reduces squeeze but **increases vertical consumption**.

---

## Responsive failures (remaining)

**Counted failures / risks:** **23** (down from 34 in 17.0 — 11 mitigated in 17.4, 8 partial, 14 open).

| ID | Surface | Severity |
|----|---------|----------|
| R1 | Pipeline table on mobile | Critical |
| R2 | Hub toolbar height stack | High |
| R3 | Board horizontal scroll | Medium |
| R4 | Contacts page tables | High |
| R5 | Intake dropdown overflow | Medium |
| R6 | Tasks page filter + table | High |
| R7 | Table inline input zoom | Medium (Input 16px helps new fields) |
| R8 | Event sticky margin | Low |
| R9 | Analytics dashboards | Medium |
| R10 | Ledger sticky + wide table | Medium |

---

## Phase 18 mobile order

1. Hub default to **cards** on `max-md` with parent path metadata.
2. Retire mobile **table** mode for pipeline or gate behind “analyst”.
3. Contacts responsive card rows.
4. Tasks filter sheet + row shell.
5. Intake overflow pass (island).
