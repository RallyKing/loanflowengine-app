# Performance & Scalability Risk Report — Direct Lending Connection

**Scope:** Frontend (Next/React) + Convex subscription patterns as visible in architecture docs and large components. **Not** a profiling run — **risk identification** for scale.

---

## 1. Rendering & bundle

| Risk | Evidence / hypothesis | Breaks when |
|------|----------------------|-------------|
| **Monolithic file workspace** | `PipelineFileWorkspace.tsx` — very large SFC orchestrating queries, layout, drawers | **Many** reactive states + block expansion → jank on mid devices |
| **Heavy client components** on file route | Multiple dynamic imports exist; not all blocks lazy | First paint / TTI suffers on 4G |
| **Duplicate Convex queries** | Same file id read in parent + blocks if not hoisted | Network + subscription waste |

**Mitigation (conceptual):** Split orchestration into **hooks + sub-layout components**; **stable memo boundaries** per block; ensure **single** `getDetail` subscription path.

---

## 2. Subscription density

| Risk | When it hurts |
|------|----------------|
| **N+1** queries from block mount | Files with **many** blocks expanded |
| **Broad** org-level queries on every file open | Large orgs |

**Mitigation:** Block-level **skip** when collapsed + lazy mount (pattern already in utilities — extend to **expensive** blocks).

---

## 3. Scroll & animation cost

| Risk | Notes |
|------|-------|
| **Layout thrash** from scroll-linked state | **Reduced** by delegated scroll + Vaul (transform-based snap) — **maintain** governance |
| **Vaul + inner lists** | `data-vaul-no-drag` on workspace scroller — **required** pattern |

---

## 4. Tables & lists

| Surface | Risk at 1k–10k rows |
|---------|---------------------|
| **Pipeline hub** | DOM size without virtualization |
| **Lenders** | Filter + sort on client if not server-paged |
| **Activity** | Infinite scroll vs capped fetch |

**Mitigation:** **Virtualization** (e.g. windowing), **server-side** filter/sort/pagination, **column projection** (don’t fetch full doc for table preview).

---

## 5. Mobile memory

| Risk | Mitigation |
|------|------------|
| Large images / PDF previews | Lazy open in side sheet; cap concurrent previews |
| **Portal** on old devices | Lightweight path; avoid heavy animations |

---

## 6. Async & latency

| Risk | UX pattern |
|------|------------|
| **Convex cold start / slow query** | Skeleton + **stale-while-revalidate** where safe; optimistic UI only with rollback |
| **Webhook / automation** | **Feedback** in activity (“Automation queued”) |

---

## 7. Large teams

| Risk | Mitigation |
|------|------------|
| **Permission checks** per UI cell | Batch entitlements; cache per session |
| **Presence / collaboration** (if added) | Dedicated subsystems — don’t piggyback on file query |

---

## Severity matrix

| Item | User impact | Technical effort |
|------|-------------|------------------|
| Hub virtualization | High | Medium |
| File workspace split + memo | High | High |
| Block lazy + skip queries | High | Medium |
| Lenders pagination | Medium | Medium |

---

*See: `docs/performance-rules.md`, `docs/project-intelligence-summary.md` Section 7, `information-density-analysis.md`.*
