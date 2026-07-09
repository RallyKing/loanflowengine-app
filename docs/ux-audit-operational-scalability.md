# UX Audit — Operational Scalability (Phase 17.5)

**Mode:** READ-ONLY simulation (UX architecture, not load testing)

## Simulated scale scenarios

| Scenario | UX breakdown | Severity |
|----------|--------------|----------|
| **100 clients** | Hierarchy expansion state huge; client filter dropdown long | Medium |
| **1000 projects** | Project filter + projection lists; scroll fatigue | High |
| **10k loan files** | Virtualized lists help **performance**; filters/chips still human-limited | **Critical** UX |
| **Heavy sharing** | Sharing panels linear lists; no pagination pattern | High |
| **Large event systems** | Events list linear; inbox tabs OK | Medium |
| **Many lenders/referrals** | Projection indexes + `/lenders` search — search-dependent | High |
| **Large task surfaces** | `/tasks` matrix + grouping — filter drawer essential | High |

---

## Visual scaling failures

- **Stage chip row** — does not scale to 20+ custom stages; wraps infinitely.
- **Badge stacks** on hub rows — linear horizontal growth.
- **Board columns** — one column per stage; horizontal scroll exhaustion.
- **Breadcrumb** — truncates OK; deep links break when names collide.

---

## Filtering overload

- Hub: 6+ independent filter dimensions — **combinatorial explosion** without saved views UX (settings exist but not prominent).
- Projection search + global search + hub search — three search fields conceptually.

---

## Navigation collapse

- Sidebar does not scale — scroll inside nav eventually.
- Mobile bottom nav cannot grow — **forces** search/overflow for rare modules.
- Projection switcher as `<select>` — OK at 8 modes; breaks at 12+ without grouping.

---

## Search dependence

At scale, users **must** use:

- ⌘K global search
- Hub search + projection search
- Lender directory search

**Gap:** Search results do not always show **full hierarchy path** or **projection context** for re-entry.

---

## Hierarchy fatigue

- Expanding full client tree with 10k files — virtualization prevents jank, not overwhelm.
- **Task projection** at scale duplicates `/tasks` — mental duplicate system.

---

## Scrolling exhaustion

- File workspace: many blocks + nested scroll panels — long operational sessions tiring.
- Activity feeds unbounded — need “load more” / date grouping (partial in collaboration timeline).

---

## Modal overload

- Create flows: file, client, project, hierarchy delete — modal chains.
- Settings deep links from hub — context switch to settings app.

---

## Performance-risk surfaces (UX-triggered)

| Surface | UX trigger | Tech note |
|---------|------------|-----------|
| Hub virtualization | Scroll speed | OK if data bounded |
| Table 14-col | Re-render on hover edit | Hot path |
| Global search | Large index | Debounced |
| File workspace monolith | Many blocks open | User opens all utilities |

---

## Breakdown summary

**UX architecture breaks first at:** pipeline hub (filters + table + hierarchy), then contacts/tasks tables, then sharing lists.

**Does not break soon:** file workspace single-file focus, event detail, shared row cards (with pagination gap).

---

## Phase 18 scalability UX (no backend required)

1. Saved views / filter presets prominent on hub.
2. Pagination or virtualized sharing lists.
3. Stage chip → dropdown when > N stages.
4. Mandatory parent path on all list rows at scale.
5. Default collapsed hierarchy; search-first onboarding for large orgs.
