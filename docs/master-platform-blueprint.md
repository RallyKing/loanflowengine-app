# Master Platform Blueprint — Production Smoke & Architecture Guardrails

**Status:** Operational reference (post Phase 3/4 domain migration)  
**Production URL:** https://dlcfunds.vercel.app  
**Last locked:** 2026-07-06  
**Related:** `docs/project-intelligence-summary.md`, `docs/ai-development-rules.md`, `docs/deployment-rules.md`, `docs/governance/runtime-workspace-scroll-authority.md`

This document is the **operational reference** for verifying critical data loops, relational bindings, overlay/scroll contracts, and design conventions after the platform decoupled from a monolithic layout into a domain-driven module structure. Run the smoke protocols after any change that touches pipeline workspace, contacts/registry, task triage, loan templates, or import paths.

---

## 1. Production Smoke Test Protocols

Execute all three workflows on **production** (not local-only) before declaring user-facing work complete when those areas were touched.

### Workflow A — Deep Relational Pipeline Test

#### A1 — Notes favorites slide-over

| Step | Action |
|------|--------|
| 1 | Navigate to **Pipeline** → open any pipeline file |
| 2 | Click **Favorites Bar** → select **Notes** |

**Pass criteria**

- Notes slide-over renders **above** the main workspace (no tab labels — Deal Info, Financials, etc. — bleeding through the scrim).
- Scrim uses platform overlay tokens (`--dlc-scrim`); inspector is portaled (see `RecordInspectorShell`).
- Add a test note → saves **instantly** via Convex live sync (no full page refresh).

**Canonical surfaces:** `modules/pipeline/components/FileFavoritesBar.tsx`, `components/RecordInspectorShell.tsx`, `modules/pipeline/components/blocks/FileNotesBlock.tsx`

#### A2 — Tasks favorites slide-over & triage

| Step | Action |
|------|--------|
| 1 | From the same file, Favorites Bar → **Tasks** |
| 2 | Open triage composer; create a task |
| 3 | Assign an org-defined triage label (e.g. *Underwriter Condition*, *Portal Request*) |
| 4 | Optionally set scheduled snooze / schedule date |

**Pass criteria**

- Tasks slide-over opens smoothly (same inspector shell as Notes).
- Color-coded left border and label pill render **instantly** on the task row (`FileTaskTriageFeedRow` + `inFileTaskTriageVisualState`).
- Urgency highlight propagates to macro file chrome (`FileWorkspaceTriageHighlight`, `hubTriageHighlight` Convex queries).

**Canonical surfaces:** `modules/pipeline/components/blocks/FileTasksBlock.tsx`, `modules/pipeline/components/tasks/FileTaskTriageComposer.tsx`, `lib/inFileTaskTriageUi.ts`, `convex/tasks.ts`, `convex/taskHighlights.ts`

---

### Workflow B — Registry Scroll & Contact Command Center

| Step | Action |
|------|--------|
| 1 | Go to **Registry** (`/registry`) or **Contacts** (`/contacts`) |
| 2 | Open an existing contact in the inspector modal |
| 3 | Navigate to **Contact Command Center** (`/contacts/[id]`) |
| 4 | Scroll long profiles, relationship lists, and deal/history tabs |

**Pass criteria**

- Vertical scroll is **smooth inside the panel** — no browser `body` scroll lock, no frozen background UI, no DOM layer stutter.
- Command center tabs use scrollable panel contract (`HubDetailTabs` + `hubDetailStyles.tabPanelScrollable`).
- Single scroll owner per route preserved (see `docs/governance/runtime-workspace-scroll-authority.md`).

**Canonical surfaces:** `modules/contacts/registry/RegistryEditModal.tsx`, `modules/contacts/components/hub/HubDetailTabs.tsx`, `modules/contacts/components/hub/hubDetailStyles.ts`, `app/contacts/[id]/page.tsx`

---

### Workflow C — Custom Template Configuration Engine

| Step | Action |
|------|--------|
| 1 | **Settings → Loan Templates** (`/settings/loan-templates`) |
| 2 | Inspect built-in strategy viewer or create/edit a custom template |
| 3 | Toggle blocks (e.g. Construction Budget, Investor Experience, PFS) |
| 4 | Save template → create a **new file** using that template |

**Pass criteria**

- Micro-typography tab headers visible: **10px uppercase tracking** separating workspace tabs — **Deal Info · Financials · Portals · Progress · Documents · Settings**.
- High-contrast toggle switches; block rows aligned with brief micro-descriptions.
- Save persists to `pipelineFileUserTemplates` via Convex (`api.pipelineFileUserTemplates.create` / `update`).
- New file wizard (`NewPipelineHierarchyCreateDialog`) shows **only** blocks enabled in the saved template.

**Canonical surfaces:** `modules/settings/components/LoanTemplatesManager.tsx`, `components/NewFileDrawerTemplateBlocksEditor.tsx`, `modules/pipeline/components/TemplateBlockRegistryPicker.tsx`, `lib/pipelineBlockRegistry.ts`, `modules/pipeline/workspace/NewPipelineHierarchyCreateDialog.tsx`

---

## 2. Technical System Architecture & Rules for Future Development

All subsequent prompts to Cursor, Vercel, or Convex **must** respect these guardrails.

### Master platform directory structure

```
lender-app/
├── modules/
│   ├── pipeline/
│   │   ├── workspace/          # PipelineFileWorkspace, wizards, shell frames
│   │   ├── components/         # Blocks, tabs, tasks, hub table, favorites bar
│   │   └── lib/core/           # Domain logic (routes, triage, table commits, UI tokens)
│   ├── contacts/
│   │   ├── components/         # Command center, hub panels, entity/individual detail
│   │   └── registry/           # Registry explorer, edit modal, workspace client
│   └── settings/
│       └── components/         # Loan templates, task library, org panels
├── lib/pipeline/               # Thin re-export shims → modules/pipeline/lib/core/*
└── components/               # Shared shell only (AppChrome, ui/*, RecordInspectorShell)
```

**Target expansion (optional, not yet required):** `modules/settings/template-builder/`, `modules/contacts/relational-core/` — new relational helpers may land there; do not recreate parallel trees under global `components/`.

---

### Rule 1 — Zero-Breaking Import Layer

The system uses **`tsconfig.json` path aliases** backed by **thin re-export shims** so legacy import paths keep working:

| Legacy alias | Resolves to |
|--------------|-------------|
| `@/components/pipeline/*` | `modules/pipeline/components/*` |
| `@/components/contacts/*` | `modules/contacts/components/*` |
| `@/components/registry/*` | `modules/contacts/registry/*` |
| `@/components/settings/*` | `modules/settings/components/*` |
| `@/lib/pipeline/*` | `modules/pipeline/lib/core/*` (via `lib/pipeline/*.ts` shims for Convex relative imports) |

**Mandatory practice**

- **New domain code** → write directly under `modules/[domain]/`.
- **Do not** add new product features under the legacy global `components/` root (except shared shell, design-system `ui/*`, and cross-cutting infrastructure).
- After moving files, run `npm run build` from `lender-app/` before deploy.

---

### Rule 2 — Triage Task Data Modeling

**Do not** create separate database enums or tables for task types like *Portal Request* or *Underwriter Condition*.

| Concern | Canonical mechanism |
|---------|---------------------|
| Task identity | Unified `tasks` table — `type`, `category`, `quadrant` for matrix semantics |
| Specialized urgency | Org-defined **`organizationTriageLabels`** linked via **`triageLabelId`** |
| Color / highlight | `resolveTriageLabelHex` + `inFileTaskTriageVisualState` + `taskHighlightEngine` |
| Live sync | Convex `useQuery` on tasks + labels; mutations in `convex/tasks.ts`, playbooks in `convex/taskTemplateLibrary.ts` |
| Hub bubble | `convex/taskHighlights.ts`, `lib/pipeline/hubTriageHighlight.ts` |

Playbook apply (`applyTemplateGroupToFile`) copies template `triageLabelId` per created task — same engine, no parallel type system.

---

### Rule 3 — Apple-Minimalist Interface System

Data density and surface tokens are standardized in:

| Token source | Scope |
|--------------|-------|
| `modules/pipeline/lib/core/premiumWorkspaceUi.ts` | Pipeline file workspace cards, canvas, field labels |
| `modules/contacts/components/hub/hubDetailStyles.ts` | Contact command center, registry hub panels |

**Design spec (mandatory for pipeline/contacts/settings data surfaces)**

- Tight canvas padding; feed stacks **`space-y-1` or `space-y-2` max**.
- Uniform borders: **`border-gray-100` / `dark:border-gray-800`** (or semantic `border-border` where already mapped).
- Radii: **`rounded-dlc-*`** tokens — no one-off arbitrary radii.
- Motion: **`duration-dlc-*`**, **`ease-dlc-standard`**; respect reduced motion.
- Secondary edits: **slide-over drawers portaled to `document.body`** (`RecordInspectorShell`, Vaul workspace frame) — avoid heavy center-screen modals for in-context edits.
- Touch targets: **≥ ~40px** on mobile primary actions.

Template builder tab headers: **10px uppercase tracking (~0.14em)** per `TemplateBlockRegistryPicker`.

---

### Rule 4 — Scroll & Overlay Authority (non-negotiable)

| Route | Scroll owner |
|-------|--------------|
| Default app routes | `AppChrome` `<main>` |
| Pipeline **file** workspace | `[data-pipeline-workspace-scroll]` — `<main>` must **not** scroll |
| Registry workspace | `[data-registry-workspace-scroll]` |
| Inspectors / favorites | Portal overlay — must **not** steal file scroll or re-enable `<main>` scroll |

Full contract: **`docs/governance/runtime-workspace-scroll-authority.md`**, **`docs/scroll-architecture-rules.md`**.

---

### Rule 5 — Relational Pipeline Integrity

These bindings were locked in Phase A/B; do not regress:

| Binding | Mechanism |
|---------|-----------|
| Contact dedup on create | Lookup-before-create in `convex/pipelineHierarchyClientResolve.ts` |
| New file wizard | Contact → Project routing → Template (`NewPipelineHierarchyCreateDialog`) |
| Lender rep on file | `fileLenders.contactRepId`, `setLenderLinkRep`, rep picker in `FileLendersBlock` |
| Email uniqueness | `crmIngestionMutations.ts` dedup on contact create |

---

## 3. Pre-Ship Checklist (quick reference)

From `lender-app/`:

1. `npm run build`
2. `npm run qa:governance` (UI/layout changes)
3. `npm run deploy:prod` (user-facing)
4. Manual prod smoke — **Workflows A, B, C** above
5. Convex push when `convex/` changed — `npm run convex:deploy:prod`

---

## 4. Change log

| Date | Event |
|------|-------|
| 2026-07-06 | Phase 3 domain migration (`modules/pipeline`, `contacts`, `settings`); Phase 4 density polish; triage pathway audit; production deploy to dlcfunds.vercel.app |
