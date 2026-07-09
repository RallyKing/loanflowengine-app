# UX Audit — Operational Projection Modes (Phase 17.5)

**Mode:** READ-ONLY  
**Canonical modes:** `HubProjectionMode` in `graphProjection.ts`

```22:49:lender-app/lib/pipeline/graphProjection.ts
export type HubProjectionMode =
  | "client"
  | "project"
  | "file"
  | "lender"
  | "referral"
  | "team"
  | "task";

export const HUB_PROJECTION_MODE_LABELS: Record<HubProjectionMode, string> = {
  client: "Client Focus",
  project: "Project Focus",
  file: "Loan File Focus",
  lender: "Lender Focus",
  referral: "Referral Partner Focus",
  team: "Team Member Focus",
  task: "Task Focus",
};
```

**Note:** There is **no** `event` or `shared` hub projection — those are **separate routes** (`/events`, `/shared`). Audit treats them as **sibling operational modes** at platform level.

---

## Mode matrix

| Mode | Mental model clarity | Switch friction | Context continuity | Discoverability | Interruption risk | Duplicate load |
|------|---------------------|-----------------|-------------------|-----------------|-------------------|----------------|
| Client | High | Low (default) | High with hierarchy | High | Low | Baseline |
| Project | High | Low | Medium — needs client filter | Medium | Low | Medium |
| File | High | Low | High — near table | High | Low | Low |
| Lender | Medium | Medium | Low — re-roots to lender entity | Low | Medium | High vs CRM `/lenders` |
| Referral | Medium | Medium | Low | Low | Medium | High |
| Team | Medium | Medium | Low vs Shared | Low | Medium | High |
| Task | Medium | High vs `/tasks` | Low | Medium | **High** — duplicates task matrix |
| **Events (route)** | High on detail | Route change | Medium | Medium | Medium | N/A |
| **Shared (route)** | Medium | Route change | Low | Medium | Low | N/A |

---

## Orthogonal controls (hub)

Users must simultaneously reason about:

1. **Projection mode** (`PipelineHubProjectionSwitcher`)
2. **View mode** — `table` | `board` (hidden on narrow viewport → forced table)
3. **Hub mobile display** — `cards` | `table` (mobile only)
4. **Hierarchy filters** — client / project dropdowns inside table shell
5. **Global hub search** vs **projectionSearch**

**Projection logic understandability:** Power users yes; new users **no** — labels are clear but interaction between filters is not explained in UI.

---

## Switching friction

| Switch | Friction |
|--------|----------|
| Projection change | Clears `filterEntityKey` and `projectionSearch` — **intentional reset** feels like data loss |
| Table ↔ board | Preserved; board unavailable on narrow |
| Hub → file → hub | Filters mostly persisted (localStorage) — good |
| Task projection ↔ `/tasks` | Two task UIs (matrix vs hub index) — **highest duplicate cognitive load** |
| Lender projection ↔ `/lenders` | Directory vs index — different actions (drawer vs row) |

---

## Canonical file coherence across modes

**Same `pipeline` row** appears as:

- Table row (`PipelineTableRow`) — dense, inline edit
- Hub card (`PipelineHubFileRow` / mobile card) — card metaphor
- Board card (`PipelineBoardView`) — stage column
- Hierarchy loan row — tree leaf
- Projection `file` mode top-level — flat list
- File workspace — full cockpit

**Coherence score:** **2/5** — data consistent; **affordances diverge** (17.0 row audit; partial 17.2 migration).

Post–17.3 file header: **more coherent** inside workspace; hub still fragmented.

---

## Visual differentiation between modes

- Switcher is a **select-style control** — modes differ in list shape but **not** in chrome color/iconography per mode.
- No persistent “mode badge” in page title area.
- `PipelineHubProjectionView` rows use similar card/table styling across modes.

---

## Fluid vs disjoint — summary

| Question | Answer |
|----------|--------|
| Mode switching fluid? | **Moderate** — no page reload, but state resets and layout stack unchanged |
| Users understand projection logic? | **Partial** — labels yes, filter interaction no |
| Same file coherent across modes? | **No** at UX layer — table vs card vs workspace |

## Phase 18 mode strategy (doc only)

1. **Mode chrome** — tint/icon + one-sentence description per mode.
2. **Deprecate or bridge** task projection vs `/tasks` (link “open in matrix”).
3. **Preserve parent context** when switching projection (don’t clear client filter without confirm).
4. **Board** — stage mode only; disable or warn when projection ≠ `file`/`client`.
5. **Event/shared** — either add hub deep links or keep as nav siblings with cross-links from graph rows.
