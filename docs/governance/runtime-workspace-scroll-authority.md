# Runtime workspace scroll — authoritative architecture

**Status:** Binding reference for **signed-in** Direct Lending Connection. Reconciles documentation with **current** runtime (`AppChrome`, `PipelineFileWorkspaceShell`, `PipelineWorkspaceMobileVaulFrame`, `MobileChromeProvider`).

**Purpose:** One mental model for humans, AI sessions, and reviews — eliminating “`<main>` owns file scroll” drift.

**Related (detail):** `docs/workspace-sheet-scroll-model.md`, `docs/workspace-sheet-architecture.md`, `docs/governance/workspace-sheet-governance.md`, `docs/scroll-architecture-rules.md`, `lender-app/AGENTS.md`.

---

## 1. Authoritative runtime summary

| Layer | Default routes (hub, lists, settings, …) | Pipeline **file** route (`/pipeline/[convexFileId]`) |
|-------|------------------------------------------|-----------------------------------------------------|
| **`html` / `body`** | Locked — no document vertical scroll | Same |
| **`AppChrome` `<main>`** | **`data-app-main-scroll`**, `overflow-y-auto`, **primary** vertical scroll owner | **`data-main-scroll-mode="workspace-delegated"`**, **`overflow-y-hidden`** — **does not** vertically scroll file content |
| **Workspace scrollport** | N/A | **`[data-pipeline-workspace-scroll]`** (`data-testid="pipeline-workspace-scroll"`) — **sole** vertical scroll owner for file workspace body (utilities, blocks, modular region) |
| **Mobile sheet** | N/A (hub uses `<main>`) | **`PipelineWorkspaceMobileVaulFrame`** — Vaul **snap** embed; scroll **handoff** stays on `[data-pipeline-workspace-scroll]` inside the sheet (`data-vaul-no-drag` on scroller) |
| **Compact / IO sentinel** | Anchored to `<main>` | `MobileChromeProvider` uses **`registerPipelineWorkspaceScroll`** — effective scroll element is workspace scroller when set |

**Implementations (code pointers):** `PipelineFileWorkspaceShell`, `PipelineWorkspaceMobileVaulFrame`, `AppChrome` (main scroll mode), `MobileChromeController` / provider registration.

---

## 2. Single scroll-owner discipline

At any moment, **primary authenticated content** uses **exactly one** vertical scroll owner:

1. **`<main>`** — for all routes **except** the pipeline file workspace route.
2. **`[data-pipeline-workspace-scroll]`** — **only** on the pipeline file workspace route (inside the shell / Vaul sheet tree).

**Forbidden:** A second full-height **`overflow-y-auto`** band that competes with the **active** owner (e.g. making `<main>` scroll **and** an inner wrapper scroll for the same vertical pan on file content).

**Approved nested scrolls** are **bounded** — drawers, modals, `max-h-*` lists — see §5.

---

## 3. Workspace-sheet + Vaul coordination (mobile)

- **Vaul** owns **sheet snap motion** and **drag affordance**, not the **deal content** scroll ownership contract.
- **Delegated scroll** remains on `[data-pipeline-workspace-scroll]`; the scroller carries **`data-vaul-no-drag`** where required so vertical pans scroll content, not drag the sheet.
- **Desktop (`md+`):** integrated layout — no Vaul frame; same **`[data-pipeline-workspace-scroll]`** owner inside `PipelineFileWorkspaceShell`.
- Do **not** replace snap with ad hoc **`scrollTop`-driven** layout / **`ResizeObserver`** feedback loops on the file chrome (see `workspace-sheet-governance.md`).

---

## 4. Deprecated patterns (do not reintroduce)

| Deprecated mental model / pattern | Why | Use instead |
|-----------------------------------|-----|-------------|
| **“File workspace scrolls with `<main>`”** | Stale — causes double-scroll and mobile regressions | Delegated **`[data-pipeline-workspace-scroll]`** + non-scrolling `<main>` |
| **Sticky file chrome anchored to `<main>` scroll** | Retired on file route | **`shrink-0`** snap header **above** workspace scroller inside sheet |
| **Route-level `overflow-y-auto` around full file workspace body** | Competes with delegated owner | **`overflow-x-clip`** on wrappers; vertical scroll **only** on `[data-pipeline-workspace-scroll]` |
| **Assuming Playwright always `scrollTop` on `app-main-scroll` for file deep links** | Wrong owner on file route | Use **`pipeline-workspace-scroll`** (or helpers that resolve **effective** scroll root per route) |
| **Overlay aside that becomes a third vertical scroll owner for route chrome** | Breaks focus / chrome contracts | **`RecordInspectorShell`** (task/lender): bounded aside only; does not change workspace scroller |

---

## 5. Overlay governance (inspectors, modals)

| Surface | Scroll | Interaction with owners |
|---------|--------|-------------------------|
| **Task / lender inspector** | `RecordInspectorShell` — docked **`<aside>`** or full-screen panel, **`h-dvh max-h-dvh min-h-0 overflow-y-auto`** | **Overlay only** — must not reparent or replace `<main>` / `[data-pipeline-workspace-scroll]` |
| **Modals / dialogs** | Internal **`max-h-*`** + **`overflow-y-auto`** on dialog body | Same — no route-level scroll theft |
| **Scrim** | Non-scrolling hit target | Uses design token **`--dlc-scrim`** (see `RecordInspectorShell`) |

**Rule:** Opening an overlay **does not** change which element **owns** route/workspace vertical scroll; overlays are **siblings** in the stacking context, not alternate `<main>` replacements.

---

## 6. Modernization implementation guardrails

When changing file workspace, mobile shell, or chrome:

1. **Read** this doc + `docs/governance/workspace-sheet-governance.md` **before** merging.
2. **Do not** “fix” layout by re-enabling **`<main>` vertical scroll** on the file route without **explicit** architecture sign-off and test updates.
3. **Do not** add **nested** full-viewport vertical scrollports inside `[data-pipeline-workspace-scroll]` except documented **`max-h-*`** regions.
4. **Update** `docs/governance/route-ownership-map.md` and **`canonical-system-map.md`** if ownership changes — **same PR**.
5. **Extend** `tests/mobile/workspace-sheet/` when scroll registration, snap, or **`data-main-scroll-mode`** behavior changes.
6. **Run** `npm run verify:governance:docs` and `npm run qa:governance` (from `lender-app/`) for user-facing scroll/sheet changes.

---

## 7. Onboarding / AI session checkpoint

Before implementing pipeline file UI, scroll, or overlays, confirm:

- [ ] I am not treating **`<main>`** as the file body scroller.
- [ ] I know **`[data-pipeline-workspace-scroll]`** is registered for mobile chrome when present.
- [ ] I am not adding competing **`overflow-y-auto`** wrappers around the whole workspace.
- [ ] Inspector/modal work uses **bounded** scroll only.

---

## Related governance & specs

- `workspace-sheet-governance.md`
- `canonical-system-map.md` — scroll owner column
- `route-ownership-map.md` — `/pipeline/[convexFileId]` row
- `canonical-source-rules.md` — scroll owner row
- `no-shadow-systems-policy.md` — shadow scroll
- `state-ownership-map.md` — drawer / scroll lock
- `ui-consistency-policy.md` — overlays
- `../scroll-architecture-rules.md`
- `../workspace-sheet-architecture.md`
- `../workspace-sheet-scroll-model.md`
- `../mobile-regression/final-scroll-validation.md` — test assumptions

---

*Reconciliation pass: modernization governance — stale `<main>`-as-file-owner language is **void** where this doc conflicts.*
