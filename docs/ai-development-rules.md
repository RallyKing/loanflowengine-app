# AI & engineering development rules

**Status:** Permanent project-wide standards. **Required policy** — not optional guidance — for all contributors and AI-assisted sessions.

**Scope:** Engineering, UX, architecture, scroll/mobile contracts, testing, performance, deployment, product philosophy, long-term constraints.

---

## Canonical governance map (read order)

AI assistants and engineers MUST treat these documents as **binding instruction sources**. Read **all** relevant docs **before** generating code, refactoring architecture, or closing user-facing tasks:

| Order | Document | Purpose |
|-------|----------|---------|
| 1 | **`docs/ai-development-rules.md`** (this file) | Master policy + enforcement summary |
| 2 | **`docs/project-intelligence-summary.md`** | Architecture, terminology, systems map |
| 3 | **`docs/workspace-sheet-architecture.md`** | Pipeline file workspace sheet + Vaul snap |
| 4 | **`docs/workspace-sheet-scroll-model.md`** | Delegated workspace scroll owner |
| 5 | **`docs/governance/runtime-workspace-scroll-authority.md`** | Reconciled runtime: non-scrolling `<main>` on file route, Vaul, overlays |
| 6 | **`docs/scroll-architecture-rules.md`** | Scroll ownership, sticky, observers |
| 7 | **`docs/mobile-testing-rules.md`** | Mandatory mobile QA matrix + commands |
| 8 | **`docs/deployment-rules.md`** | Build → gate → Vercel CLI deploy → prod smoke |
| 9 | **`docs/ui-ux-rules.md`** | Mobile-first UX, Material alignment, overlays |
| 10 | **`docs/performance-rules.md`** | Rerender, virtualization, scroll perf |

### Extended enterprise governance (`docs/governance/` — binding)

All files in **`docs/governance/MANIFEST.json`** are **required** repository artifacts. Run **`npm run verify:governance:docs`** (from `lender-app/`) to verify presence. **Pipeline file UX** is governed by **`docs/governance/workspace-sheet-governance.md`** and the reconciled runtime summary **`docs/governance/runtime-workspace-scroll-authority.md`**.

**Entry points:** `docs/governance/canonical-source-rules.md` (five canonical owners), `docs/governance/platform-philosophy.md`, `docs/governance/ai-development-lifecycle.md` (AI session workflow).

Policy topics include: **no shadow systems**, **temporary code**, **migration safety**, **webhook/automation safety**, **UI/design system**, **component architecture**, **observability**, **feature completion**, **route ownership**, **AI governance**, **performance budgets**, **Convex resource & cost safety**, **Convex reactivity & React correctness**, **accessibility**, **production deployment**, **documentation sync**, **tenant isolation**, **integrations**, **state management**.

**Cursor enforcement:** `.cursor/rules/governance-hub.mdc` (**alwaysApply**), `.cursor/rules/project-rules.mdc` (**alwaysApply**), repo root `.cursorrules`, `lender-app`-scoped `.cursor/rules/mobile-qa.mdc` for UI globs.

---

## Mandatory session workflow (AI)

Every new Composer window, chat, or editing session that touches product code MUST internally:

1. **Read** the governance map above (at minimum this file + **`docs/project-intelligence-summary.md`** + relevant **`docs/governance/*.md`** for the task).
2. **Load architecture constraints** — blocks, shared state, scroll ownership (`docs/project-intelligence-summary.md`, **`docs/governance/runtime-workspace-scroll-authority.md`**, `docs/scroll-architecture-rules.md`, **`docs/workspace-sheet-scroll-model.md`** for pipeline file).
3. **Load mobile policy** — **`docs/mobile-testing-rules.md`** before any UI/layout/sticky/overlay work.
4. **Load deployment policy** — **`docs/deployment-rules.md`** before declaring shipped work complete.
5. **Acknowledge constraints** — Impact check: architecture, UX, performance, **mobile**, shared data, modularity, deployment.
6. **Then** implement — no speculative architecture that violates scroll/mobile/deploy rules.

---

## Automated QA workflow (before “done”)

For **any** user-facing task marked complete:

| Gate | Command / action |
|------|------------------|
| Build | `npm run build` in `lender-app/` |
| Mobile tests | `npm run test:mobile` (or `test:mobile:matrix` when justified) |
| Desktop smoke | Part of `npm run qa:governance` (Chromium smoke + auth paths) |
| Responsive | Covered by mobile/tablet projects + manual spot-check |
| Deploy | `npm run deploy:prod` when behavior should be live |
| Prod smoke | Login, pipeline, tasks, contacts, lenders, **mobile scroll** |

**Single command gate:** `npm run qa:governance` — required baseline before completion unless the session explicitly documents why tooling-only/docs-only work skipped testing.

---

## Architecture rules

- Never create duplicate functionality if a reusable system already exists.
- Every feature must be modular and reusable.
- Every major feature must behave like a lego block: attachable, removable, reorderable, configurable.
- Shared data must flow through a centralized shared state layer.
- No hardcoded feature dependencies between blocks.
- Blocks communicate through shared canonical data only.
- Preserve backward compatibility whenever possible.
- Never break existing production workflows while adding features.
- Never silently overwrite production data.
- Always prefer additive migrations before destructive cleanup.

Detail: **`docs/project-intelligence-summary.md`** (blocks, Convex, pipeline).

---

## UI / UX rules

Summary only — full wording: **`docs/ui-ux-rules.md`** + **`docs/scroll-architecture-rules.md`**.

- Unified platform; shared spacing/grid; **no overlapping chrome**.
- **Single vertical scroll owner** — default: `AppChrome` `<main>`; **pipeline file:** `[data-pipeline-workspace-scroll]` (see **`docs/workspace-sheet-scroll-model.md`**).
- Mobile parity; sticky chrome minimizes on scroll; **content first**; utilities never dominate.
- Sections: labels + stable IDs; avoid modal overload and layout jump; intentional motion (`transform` / `opacity` on scroll-adjacent surfaces).

---

## Pipeline workspace rules

- Pipeline file workspace is the root experience; aligned grid/width; utilities **collapsed by default**.
- **Workspace sheet:** mobile uses **Vaul** snap (`PipelineWorkspaceMobileVaulFrame`); desktop uses integrated full-width layout (no floating file drawer). Scroll isolation: **`[data-pipeline-workspace-scroll]`** — not `<main>`.
- Modular blocks: collapse, reorder, visibility control.
- Task drawer: **overlay only**; must not steal or break workspace scroll.

---

## Data rules

- Normalized relationships; many-to-many where applicable; shared fields with sync/override modes.
- Never duplicate contacts during migrations; preserve historical production data; reversible migrations.

---

## Performance rules

Summary — full wording: **`docs/performance-rules.md`**.

- Fast loads; avoid rerender storms and nested heavy queries; lazy load; virtualize large lists; memoize; **mobile first**.
- No noticeable lag while typing or scrolling shipped paths.

---

## Testing rules

- Every feature tested before completion.
- Desktop + tablet + mobile coverage; major browsers including mobile Safari/Chrome.
- Empty/loading/error/slow/large-data states.
- **Mobile testing is mandatory** for every UI/layout/sticky/overlay/drawer/responsive change — see **`docs/mobile-testing-rules.md`**.
- No production console/runtime errors on shipped paths.
- **Never** mark user-facing work complete without **`npm run qa:governance`** (or strictly documented equivalent) + **`npm run deploy:prod`** when shipping + prod smoke.

---

## Deployment rules

Summary — full wording: **`docs/deployment-rules.md`**.

- **Always** run **`npm run build`** before deploy.
- **Always** deploy frontend to **Vercel via CLI** (`npm run deploy:prod` from `lender-app/`); **do not** rely on GitHub-as-primary deploy discipline.
- **Always** run mobile tests before declaring completion (`qa:governance` baseline).
- **Always** validate production after deploy.

Docs/tooling-only: skip deploy **only** when explicitly stated.

---

## AI / automation rules

- Review AI output for duplication, architecture conflicts, performance, UX inconsistencies.
- No isolated mini-systems; integrate into existing architecture; scalable patterns only.

---

## Product & long-term rules

- Unified operational workspace; customizable; modular; multi-tenant-ready; permissions/webhooks/API-friendly; minimal vendor lock-in; centralized config/features.

---

## Enforcement (before implementing)

1. Architecture impact  
2. UX impact  
3. Performance impact  
4. **Mobile impact**  
5. Shared data impact  
6. Modularity impact  
7. Deployment impact  

---

## Enforcement (before marking complete — user-facing)

1. **`npm run qa:governance`** from `lender-app/` (or documented equivalent with mobile + desktop smoke).
2. **`npm run deploy:prod`** when the change should be live (unless docs/tooling-only — state explicitly).
3. **Manual prod verification** (login, pipeline, tasks, contacts, lenders, **mobile scroll**).

---

These rules are permanent and govern **all** future development decisions.
