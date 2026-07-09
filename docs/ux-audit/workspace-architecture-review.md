# Workspace Architecture Review — Direct Lending Connection

**Focus:** Pipeline file workspace, shell, overlays, and alignment with modern operational CRM patterns.

---

## 1. Current architecture (as implemented)

```
AppChrome (fixed shell)
├── Header (classic / SaaS variants)
├── main
│   ├── Default routes: data-app-main-scroll (vertical scroll)
│   └── File route: overflow-y hidden (workspace-delegated)
└── MobileBottomNav (classic)
```

**Inside file route (`PipelineFileWorkspace`):**

```
PipelineWorkspaceMobileVaulFrame (md: passthrough; mobile: Vaul top sheet)
└── data-pipeline-workspace-sheet
    ├── header (shrink-0 snap surface — not sticky)
    ├── utilities (CollapsibleSection, lazy)
    ├── [data-pipeline-workspace-scroll] — sole vertical scroll
    └── data-pipeline-workspace-overlay-layer (reserved)
```

**Overlays:**

- `TaskDrawer`, `LenderDrawer` — portaled/bounded scroll asides (contract: don’t break primary scroll owner).  
- `GlobalSearchPalette` — command-palette pattern.  
- Modals — settings, confirmations.

**Strengths:**

- **Single scroll owner** per surface is explicit and documented.  
- **Mobile** file experience is **sheet-native** (Vaul), not “sticky inside main” hacks.  
- **Utilities collapsed by default** matches progressive disclosure philosophy.

---

## 2. Gaps vs best-in-class workspace CRMs

| Pattern | Lightning / Attio-style | DLC gap |
|---------|-------------------------|---------|
| **Record home with pinned summary** | Pinned “highlights” rail | Blocks are flexible but **no first-class pinned summary strip** keyed off stage |
| **Contextual right rail** | Persistent optional inspector | Drawers exist but **not unified** as one “inspector” framework |
| **Split view on large screens** | List + record | Pipeline is separate route from file — **acceptable**; **optional** split when coming from hub |
| **Command palette** | Power users | `GlobalSearchPalette` present — deepen **actions** (not just nav) |

---

## 3. What should become side sheets

**High confidence:**

- **Contact** quick view + edit (when invoked from file).  
- **Lender** detail beyond list row (partially `LenderDrawer` today — **standardize** MD3 side sheet chrome).  
- **Task** full form when matrix cell isn’t enough (`TaskDrawer` evolution).

**Medium:**

- **Document** preview + metadata.  
- **Share / team** panel (if modal today).

---

## 4. What should become snap sheets (mobile)

- **File utilities** “focus” tier (collapse chrome + utilities to minimal strip) — extends current Vaul states.  
- **Scenario criteria** editor on narrow screens (dense form).  
- **Filter panels** on hub and lenders (avoid full-screen modal).

---

## 5. What should stay inline expandable cards

- **Deal blocks** in registry (macro story stays in flow).  
- **Insights** strip summaries.

---

## 6. What to remove / avoid

- **Second full-height vertical scroller** inside file flow (already prohibited — **guard in code review**).  
- **Sticky file header tied to `<main>` scroll** on file route (retired — **don’t reintroduce**).  
- **ResizeObserver–driven chrome height** on scroll path (retired pattern per workspace governance).

---

## 7. Mobile chrome interaction

**Two compacts:** App (`MobileChromeController`) vs file (`WorkspaceSheetSnapContext` / scroll sentinel).  
**Recommendation:** Product doc **“chrome state matrix”** — which combinations are supported and user-visible (reduces confusion when app is compact but file is expanded).

---

## Prioritization

| Priority | Architectural move |
|----------|----------------------|
| Critical | Unified **inspector/side sheet** framework + shared header/footer |
| High | Pinned **summary** region (stage, $, chosen lender, next task) |
| Medium | Split-view experiment from hub on desktop |
| Low | Command palette **actions** expansion |

---

*See: `full-fintech-ux-audit.md`, `side-sheet-conversion-opportunities.md`, `snap-sheet-conversion-opportunities.md`.*
