# Full Fintech UX Audit — Direct Lending Connection

**Type:** Enterprise operational UX + MD3 modernization foundation document.  
**Scope:** Entire `lender-app` platform and documented Convex systems.  
**Status:** Diagnostic only — not an implementation plan.

**Companion docs (read together):**  
`material-design-3-gap-analysis.md`, `mobile-operational-workflow-audit.md`, `information-density-analysis.md`, `workspace-architecture-review.md`, `side-sheet-conversion-opportunities.md`, `snap-sheet-conversion-opportunities.md`, `common-user-flow-optimization.md`, `performance-scalability-risk-report.md`, `fintech-trust-analysis.md`, `system-redundancy-analysis.md`, `future-state-platform-vision.md`.

---

## 1. Audit philosophy (benchmark lens)

**Question:** *How would the best modern fintech / high-density CRM products structure this experience today?*

**Reference patterns (behavioral, not visual clones):** Linear (keyboard + context preservation), Ramp/Mercury/Brex (trust, balances, calm hierarchy), Stripe Dashboard (dense tables + drill-down), HubSpot/Attio (record-centric CRM with side panels), Salesforce Lightning (enterprise density + app shell), Notion (progressive disclosure), institutional mobile banking (thumb ergonomics, stable motion).

**Primary evaluation axes for DLC:**

| Axis | What “great” looks like here |
|------|------------------------------|
| Operational speed | Fewer context switches; file as hub; actions adjacent to object |
| Cognitive load | One primary story per viewport; collapsible utilities; clear “where am I” |
| Trust | Stable chrome, explicit money/stage states, no jittery motion on money paths |
| Information hierarchy | Stage, economics, chosen lender, next actions visible without hunt |
| Workflow continuity | Switching files preserves mental model; search/global nav recoverable |
| Friction | Reduce modal stacks; prefer contextual sheets on dense workflows |
| Mobile productivity | True operational modes, not shrunk desktop; snap sheet where appropriate |
| Multi-tenant | Org branding and accent tokens without breaking semantic colors (success/warn/error) |

**Codebase anchors (policy, not opinion):**  
`docs/ai-development-rules.md`, `docs/ui-ux-rules.md`, `docs/scroll-architecture-rules.md`, `docs/workspace-sheet-*.md`, `lender-app/AGENTS.md`, `docs/governance/workspace-sheet-governance.md`.

---

## 2. Full system inventory

| System | Primary implementation / docs | UX role | Audit depth |
|--------|----------------------------------|---------|-------------|
| **Pipeline** | `convex/*` pipeline APIs, `/pipeline` | Deal funnel, stages, economics shell | High |
| **Pipeline file workspace** | `PipelineFileWorkspace.tsx`, `PipelineFileWorkspaceShell.tsx`, `PipelineWorkspaceMobileVaulFrame.tsx` | Per-file operational HQ | Critical |
| **Lenders** | `/lenders`, `LenderTable.tsx`, `LenderDrawer.tsx`, scenario UIs | Directory + attach + match | High |
| **Contacts** | `/contacts`, links, activity | CRM records | High |
| **Tasks** | `/tasks`, `TaskDrawer.tsx` | Matrix + file-linked work | High |
| **Messaging** | Quick panels / file messaging | Client + internal comms | Medium |
| **Documents** | Library panels, storage | Evidence + deliverables | Medium |
| **Portal** | `/portal/*`, invite blocks | Client-facing trust surface | High (trust) |
| **Scheduling** | File workspace section | Time coordination | Medium |
| **Automation** | `userSimpleWorkflows`, webhooks | Background intelligence | Medium |
| **Notifications** | `UserNotificationsBell`, task notifications | Interrupt handling | Medium |
| **Shared data layer** | `fileSharedState`, `fileSharedFields.ts` | Single economic truth | Critical |
| **Drawer system** | Task/lender drawers, pipeline drawer blocks | Bounded overlay scroll | High |
| **Overlay system** | Modals, drawers, `GlobalSearchPalette` | Layered tasks | High |
| **Workspace shell** | `AppChrome.tsx`, `SaasSidebar`, `MobileBottomNav` | Nav + trust frame | Critical |
| **Navigation** | Classic vs `data-color-scheme="saas"` | Enterprise vs brand modes | High |
| **Search** | `GlobalSearchPalette` | Cross-entity recovery | Medium |
| **Tables** | Pipeline hub, lenders — `globals.css` table tokens | Density / scan | High |
| **Forms** | Inline components (`inline/*`), settings | Data entry stress | High |
| **CRM relationships** | `contactFileLinks`, labels, `crmRelationshipTypes` | Relationship clarity | Medium |
| **Multi-tenant** | Orgs, RBAC, plan gates | Isolation + upsell | Medium |
| **White-label** | Org `branding`, display settings tints | Tenant trust | Medium |
| **Roles** | Org permissions, gates | Safe destructive actions | High |
| **Mobile** | `MobileChromeController`, Vaul sheet, bottom nav | One-handed ops | Critical |
| **Responsive** | `WorkspaceContentContainer`, breakpoints | Density steps | High |
| **Typography** | `:root` DLC type tokens in `app/globals.css` | Readability at scale | Medium |
| **Motion** | `--dlc-motion-*`, Vaul, compact transitions | Continuity vs anxiety | Medium |
| **Empty / loading** | Per-route patterns; block lazy mount | Confidence | Medium |
| **Validation** | Convex + inline commit patterns | Finance-grade clarity | Medium |
| **Scroll** | Delegated file scroll + main scroll elsewhere | Operational stability | Critical |
| **Accessibility** | Focus rings, `sr-only`, reduced motion | Enterprise compliance | Medium |
| **Performance** | Convex subs, large `PipelineFileWorkspace` | Scale pain | High |

---

## 3. Cross-cutting strengths (honest baseline)

1. **Lego block architecture** — `pipelineBlockRegistry`, per-file layout, gates — aligns with Attio/Notion-style modularity.
2. **Shared deal “bus”** — `fileSharedState` + indicators reduce silent divergence (fintech-critical).
3. **Explicit scroll contracts** — Documented in `AGENTS.md` / scroll docs; file route uses **delegated** `[data-pipeline-workspace-scroll]` + optional Vaul snap — correct direction for mobile operational shells.
4. **Design token foundation** — `globals.css` mirrors MD3-ish shape, motion, elevation, density, semantic surfaces (`--dlc-surface-*`); classic vs SaaS scheme supports multi-mode positioning.
5. **Overlay discipline (stated)** — Task/lender drawers as bounded scroll asides matches “don’t steal main scroll” policy.

---

## 4. Cross-cutting risks (executive)

1. **Monolithic file workspace component** — `PipelineFileWorkspace.tsx` is a cognition hotspot for maintainers and likely a rerender hotspot for users at scale (see performance doc).
2. **Dual contact models** — Embedded `pipeline.contacts` vs `contacts` + links creates UX ambiguity (“which contact is canonical?”) until the product copy and default flows unify.
3. **MD3 “shape” without full MD3 “system”** — Tokens exist; **component-level** MD3 patterns (assist chips, tonal buttons, navigation rail specs, standardized side sheets) are not uniformly applied.
4. **Scheme explosion** — Classic forest/gold, SaaS green/blue, per-user display tints, stage pills — need a **semantic layer** so trust colors (success/warning/error) never compete with brand tint for meaning.
5. **Modal vs sheet inconsistency** — High-frequency record edits (lender, contact, task) mix **drawer**, **inline**, and **palette** patterns; behavioral consistency lags best-in-class CRM.

---

## 5. Prioritized findings (master backlog)

**Ranking dimensions:** (A) user impact, (B) workflow frequency, (C) mobile, (D) performance, (E) ease of implementation, (F) architectural leverage. Scores 1–5 are **severity / importance** (higher = more urgent).

| ID | Finding | Class | Notes | Owner doc |
|----|---------|-------|-------|-----------|
| P1 | Unify **record editing** (task / lender / contact / key deal fields) around **contextual side sheets** + shared footer affordances | Critical | A5 B5 C4 D3 F5 | `side-sheet-conversion-opportunities.md` |
| P2 | Reduce **PipelineFileWorkspace** complexity: extract orchestration, stabilize subscriptions, add “compact operational” layout preset | Critical | A5 B5 C4 D5 F5 | `performance-scalability-risk-report.md`, `information-density-analysis.md` |
| P3 | **Contacts duality** — product decision + UI always shows link-based truth | High | A4 B4 F4 | `system-redundancy-analysis.md` |
| P4 | **Trust semantics** — separate semantic colors from brand accents; audit destructive affordances on mobile | High | A5 C5 | `fintech-trust-analysis.md` |
| P5 | **Pipeline hub** at 1000+ rows: virtualization, saved views, column presets | High | B5 D5 | `performance-scalability-risk-report.md` |
| P6 | **MD3 motion choreography** — standardize duration/curve per surface class | Medium | C4 D3 | `material-design-3-gap-analysis.md` |
| P7 | **Snap sheet** beyond file shell — utilities focus, scenario tools on mobile | Medium | C5 | `snap-sheet-conversion-opportunities.md` |
| P8 | **Automation discoverability** — “what ran / why” near activity | Medium | B2 | `common-user-flow-optimization.md` |
| P9 | **Portal** trust parity (loading, error, identity) vs main app | Medium | A4 C4 | `fintech-trust-analysis.md` |
| P10 | **Global search** → preserve file breadcrumb context | Low | B4 | `common-user-flow-optimization.md` |

**Class definitions:** **Critical** = daily ops / trust / scale ceiling. **High** = frequent CRM/fintech gap. **Medium** = consolidation polish. **Low** = incremental.

---

## 6. AI + automation UX (Section 12 synthesis)

| Topic | Current direction (codebase) | Gap / opportunity |
|-------|------------------------------|-------------------|
| **Discoverability** | Workflows in settings/automation; discovery AI for lenders | **File-level** “Automations” or **activity** entries should answer “what ran?” without Support |
| **Workflow placement** | Triggers tied to pipeline events | Surface **suggested** playbooks when stage changes (assist chip — MD3 gap doc) |
| **Confidence signaling** | Lender discovery returns candidates for review | Always show **source** (model vs directory) and **edit before commit** |
| **Transparency** | Webhooks enqueue from mutations | Per-org **delivery log** UI (retry, payload redaction) for enterprise trust |
| **Clutter risk** | Multiple AI entry points possible | **One** primary “Assist” region per surface (file: layout strip or dedicated block) |

**Prioritization:** Medium user impact, high **enterprise** credibility — sequence after **semantic trust colors** and **side-sheet** consistency.

---

## 7. What this audit does not claim

- No pixel-perfect competitive teardown.  
- No substitute for observational studies or production analytics.  
- Implementation and A/B decisions belong to a follow-on roadmap.

---

## 8. Recommended next step (process)

1. Socialize **P1–P5** with product + engineering.  
2. Tie items to **measurable** outcomes (time-to-attach-lender, file switch time, mobile task completion, INP on file route).  
3. Sequence **architecture** (shared side-sheet framework, semantic tokens) before **surface** refactors.

---

*Governance note: `docs/project-intelligence-summary.md` §3 and **`docs/governance/runtime-workspace-scroll-authority.md`** are aligned with runtime; detail contracts also in `docs/workspace-sheet-scroll-model.md`.*
