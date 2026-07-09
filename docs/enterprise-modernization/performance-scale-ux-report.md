# Performance + Scale UX Report

**Scope:** How UX architecture **couples** to **render cost**, **Convex shape**, **scroll-linked behavior**, and **perceived latency** — not raw Lighthouse scores.

---

## 1. Render architecture (current posture)

| Pattern | Location / behavior | UX risk |
|---------|---------------------|---------|
| **Large route components** | `PipelineFileWorkspace` orchestrates layout + state + blocks | Single change → **wide** child rerenders |
| **Dynamic imports** | Block lazy load via registry | Good — **waterfall** if serial |
| **Context on shell** | `AppChrome`, org, theme | **Propagates** updates if unstable refs |

**Highest leverage refactor (UX-visible):** split **orchestration** (subscriptions, layout resolution) from **presentation** (region shells) so **scroll chrome** does not thrash on unrelated Convex deltas.

---

## 2. Subscription architecture (Convex)

| Risk | Symptom | Operator perception |
|------|---------|---------------------|
| **Duplicate queries** | Same `file` fields in parent + block | Janky “double flash” |
| **Broad file subscription** | All blocks refresh on any patch | **Layout jump** |
| **Unbatched mutations** | Rapid optimistic + rollback | **Flickering** numbers |

**Recommendation:** documented **“single flight”** file query per route + **narrow** block subscriptions — architecture doc already points this direction; **enforce** in code review.

---

## 3. Query duplication (detect)

| Signal | Action |
|--------|--------|
| Multiple `useQuery` same args in subtree | Lift to **route store** or shared hook |
| Block fetches entire file when only slice needed | **Slice** queries |

---

## 4. Scroll-linked rerenders

| Pattern | Safe? |
|---------|-------|
| **`IntersectionObserver`** for compact chrome | Yes — **decoupled** from scroll frame |
| **Scroll listener** updating React state every frame | **No** — causes rerenders |
| **`scroll` event** → `setState` width | Risk — throttle + rAF |

**File route:** delegated scroller + **`scroll` metadata attribute** (if used) must stay **passive** or **batched**.

---

## 5. Layout thrashing

| Source | Mitigation |
|--------|------------|
| **Measuring** DOM in resize loop | `ResizeObserver` + debounce |
| **Snap transitions** + simultaneous height reads | Batch reads/writes |
| **Table** auto column widths | Fixed or **virtual** columns |

---

## 6. Motion performance

| Principle |
|-----------|
| Prefer **transform** / **opacity** |
| Avoid **top/height** animation on **main** content |
| **`will-change`** sparingly — mobile GPU memory |

**Vaul:** sheet motion should not animate **viewport-wide** layout.

---

## 7. Table scalability

| Surface | Current risk | Target |
|---------|--------------|--------|
| **Pipeline hub** | Large DOM | **Windowing** or pagination + **saved view** |
| **Lenders** | Wide + many rows | Column virtualization or **defer** rare columns |
| **Tasks matrix** | 4 grids | **Virtual row** per quadrant |
| **Contacts** | Medium | Monitor at 500+ |

---

## 8. Memory pressure

| Source | Symptom |
|--------|---------|
| **Heavy PDF** in tab | Tab switch lag |
| **Many mounted** lazy blocks | Idle memory |
| **Chat** long threads | Scroll jank |

**UX policy:** **Unmount** off-screen heavy tabs where safe; **truncate** with “load more”.

---

## 9. Lazy-loading opportunities

| Asset | Strategy |
|-------|----------|
| **Maps / charts** | Import on tab focus |
| **Lender discovery** | Defer until panel open |
| **Admin** sections | Route-level split |

---

## 10. Bundle hotspots (qualitative — verify with analyzer)

| Candidate |
|-----------|
| **Editor** (intake / rich text) |
| **Date** libraries duplicated |
| **Icon** packs — tree-shake audit |

---

## 11. Context-provider bloat

| Risk |
|------|
| Nesting **10+** providers on shell |
| **Value** objects recreated each render |

**Symptom:** typing lag in forms on low-end Android.

---

## 12. Over-rendering risks

| Hot path |
|----------|
| **File** parent `useMemo` misses |
| **Block** receives **new** inline callbacks |
| **Theme** token object identity |

---

## 13. Expensive animations

| Anti-pattern |
|--------------|
| **Blur** backdrop on large regions |
| **Box-shadow** transition on huge cards |
| **Parallax** on main scroll |

---

## 14. GPU vs layout animations

| Use GPU | Avoid layout |
|---------|--------------|
| Translate sheet | Animate `width` of hub |

---

## 15. Virtualization needs (prioritized)

1. Pipeline hub primary table.  
2. Tasks matrix rows.  
3. Lenders directory (if org > 300).  
4. Activity feed (infinite).

---

## 16. Interaction latency risks

| Interaction | Perception threshold |
|-------------|---------------------|
| **Open drawer** | < 200ms to interactive |
| **Save** | Optimistic + rollback message |
| **Search** | Debounce + **loading** affordance |

---

## 17. Most dangerous scalability risks (ranked)

1. **Unbounded hub table** DOM.  
2. **`PipelineFileWorkspace`** rerender fan-out.  
3. **Broad file** query feeding all blocks.  
4. **Messaging** unbounded scroll + images.  
5. **Multi-overlay** stacks + focus traps.

---

## 18. Largest architecture bottlenecks

1. **Monolithic file orchestrator.**  
2. **Inconsistent subscription strategy** across blocks.  
3. **No formal perf budget** per route in CI.

---

## 19. Highest leverage refactors (UX × engineering)

1. **Route-level data shell** for file.  
2. **Virtualized hub.**  
3. **Stable memo** contracts for blocks (`pipelineBlockRegistry`).  
4. **Motion budget** in design QA.

---

## 20. Most expensive workflows (operator time × compute)

1. **Scenario** full recompute UX while typing.  
2. **Hub** scan at 500+ files without views.  
3. **Lender attach** search across full corpus.

---

## Scroll governance linkage

Violations **directly** become performance bugs: **nested** scroll fights cause **main-thread** scroll jank and **rerender** bursts from scroll listeners.

---

*See: `master-enterprise-modernization-report.md`, `snap-sheet-master-plan.md`, `system-unification-report.md`.*
