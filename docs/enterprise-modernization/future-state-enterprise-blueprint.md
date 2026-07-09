# Future-State Enterprise Platform Blueprint

**Horizon:** 12 / 24 / 36 months.  
**North star:** **Operational fintech CRM** — MD3-adaptive, **trust-forward**, **mobile-sheet-native** where appropriate, **single scroll owner** policy, **modular blocks** preserved.

---

## 1. Ideal architecture — pillars

| Pillar | Future state |
|--------|--------------|
| **Enterprise fintech UX** | Semantic colors, restrained motion, explicit money handling |
| **Operational CRM density** | Virtualized lists, saved views, inspectors, pinned summary |
| **Mobile-first operations** | Snap for contextual tools; inspectors for records; hub **cards** |
| **MD3 adaptive** | Window size classes, rail + bar composition, dynamic color optional per tenant |
| **Dynamic trust** | Automation visibility, audit trails, portal parity |
| **Unified side sheets** | RecordInspectorShell for task/lender/contact/document |
| **Unified snap sheets** | Workspace + hub filters + scenario (mobile) |
| **Phase-aware workspaces** | Template defaults per pipeline phase + org policy |
| **Modular blocks** | Registry + lazy + subscriptions scoped per block |
| **Multi-tenant branding** | Classic vs SaaS + **semantic** mapping — not double components |
| **High-scale data** | Virtualization, pagination, “load more”, narrow queries |
| **AI-assisted workflows** | Labeled proposals; human confirm; activity logged |
| **Automation transparency** | Delivery log, failures, replay |
| **Contextual productivity** | Command palette actions; keyboard map |
| **Performance-safe motion** | Token budget; reduced-motion matrix |
| **Stable scroll** | `AppChrome` main vs delegated workspace — **documented** only truth |

---

## 2. What NOT to rebuild

| Asset | Reason |
|-------|--------|
| **Convex** data model + real-time | Core moat |
| **`pipelineBlockRegistry`** philosophy | Differentiator |
| **`fileSharedState`** economics | Trust anchor |
| **Workspace sheet + delegated scroll** | Correct mobile architecture |
| **Governance docs** | Expand, don’t replace |

---

## 3. What should evolve incrementally

| System | Approach |
|--------|----------|
| **Drawers** | Strangle → inspector shell |
| **Tables** | Add virtualization without UX revolution |
| **Theme** | Layer semantic tokens under brand |
| **Contacts** | Copy + flow first; schema later if needed |
| **Docs** | Reconcile intelligence summary vs workspace sheet |

---

## 4. What becomes platform infrastructure

| Layer |
|-------|
| **Inspector** framework |
| **Overlay** coordinator (z-index, focus, stacking) |
| **Scroll** contract helpers + lint/Playwright |
| **Finance field** kit |
| **Table** kit with density |
| **Motion** class CSS |

---

## 5. Twelve-month roadmap (outcomes)

| Quarter | Outcomes |
|---------|----------|
| **Q1** | **`RecordInspectorShell`**; migrate **TaskDrawer** + **LenderDrawer**; doc reconciliation (`project-intelligence-summary` §3); semantic color spec |
| **Q2** | **Hub** virtualization + saved views v1; **FilterToolbar** primitive; hub mobile **card** mode |
| **Q3** | **PipelineFileWorkspace** decomposition; subscription audit; **automation** strip v1 |
| **Q4** | **Portal** trust pass; **command palette** actions expansion; **tablet** split experiment |

---

## 6. Twenty-four-month roadmap

- **Persistent inspector rail** option on ultra-wide (non-default).  
- **Dynamic color** optional per org (Material You).  
- **Webhook** delivery UX GA.  
- **Scenario** mobile snap fully standardized.  
- **Table** density org defaults.  
- **E2E** suite mapped to modernization pillars in CI.

---

## 7. Thirty-six-month roadmap

- **Multi-tenant** advanced branding without `cssVars` explosion — **token compiler** or design API.  
- **AI** workflow **copilot** with enterprise controls (permissions, retention).  
- **Client portal** feature parity with trust guarantees.  
- **Offline** / degraded mode UX where product requires.  
- **Operational analytics** (time-in-phase, conversion) surfaced ethically.

---

## 8. Phase-aware workspaces (detail)

| Mechanism |
|-----------|
| `pipelinePhase` → **default** block visibility + order |
| User override persisted per file (already aligned with layouts) |
| **Admin** publishes org templates |

---

## 9. AI-assisted workflows (guardrails)

| Rule |
|------|
| Every AI output **labeled** |
| **Confirm** before write to economics |
| **Activity** entry |

---

## 10. Material You (optional path)

| Tenant setting | Implication |
|----------------|-------------|
| Off | Classic/SaaS brand only |
| On | **Harmonize** accents from logo — **map** to semantic roles |

---

## 11. Contradictions to resolve (doc vs code)

| Stale doc | Authoritative |
|-----------|---------------|
| Sticky file chrome + `<main>` scroll | `docs/workspace-sheet-scroll-model.md` + `AGENTS.md` |

---

## 12. Success metrics (product)

| Metric |
|--------|
| Time-to-first-meaningful **file paint** |
| **Tasks** completed per session |
| **Mobile** session duration without error |
| **Support** tickets on “where did my number go” |
| **Portal** completion rate |

---

*See: `master-enterprise-modernization-report.md`, `final-ranked-action-matrix.md`, `material-design-3-system-map.md`.*
