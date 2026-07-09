# Mobile issue inventory (complete categorized)

**Audit date:** 2026-05-07 · **Diagnostic only.**

Each issue uses: **severity** (Critical / High / Medium / Low), **confidence** (High / Medium / Low), **devices** (best guess until full matrix), **routes**, **components**, **repro** (steps), **evidence**, **probable root cause**, **fix complexity** (S / M / L / XL).

---

## Critical

### SCR-CRIT-001 — Single-scroll contract broken on pipeline hub (main does not scroll)

| Field | Value |
|-------|-------|
| **Severity** | **Critical** |
| **Confidence** | **High** |
| **Devices** | All mobile (`Mobile Chrome` verified); expect same on **Mobile Safari** |
| **Routes** | `/pipeline` (authenticated) |
| **Components** | `PipelinePageClient.tsx` (inner `overflow-y-auto`), `AppChrome` `<main>` |
| **Reproduction** | 1) Sign in. 2) Go to `/pipeline`. 3) Read `document.querySelector('[data-app-main-scroll]').scrollHeight` vs `clientHeight`. 4) Scroll the visible list — observe which element’s `scrollTop` changes. 5) Or run `ci-mobile-scroll` (fails). |
| **Evidence** | Playwright **`ci-mobile-scroll`** failure: `expected scrollTop to change` on `[data-app-main-scroll]`; code: table wrapper `div.min-h-0.flex-1.overflow-y-auto`. |
| **Root cause** | Vertical scrollport **nested** inside `<main>` for table mode; `<main>` may have **no overflow**. |
| **Fix complexity** | **L** — architectural choice: unify scroll owner **or** redefine contract + tests. |

### SCR-CRIT-002 — Governance / docs / tests disagree with production scroll model

| Field | Value |
|-------|-------|
| **Severity** | **Critical** (process + regression detection) |
| **Confidence** | **High** |
| **Devices** | N/A |
| **Routes** | `/pipeline` |
| **Components** | `AGENTS.md`, `PipelinePageClient`, `ci-mobile-scroll.spec.ts` |
| **Reproduction** | Read `AGENTS.md` “sole scroll container” vs `PipelinePageClient` nested `overflow-y-auto`. |
| **Evidence** | Comment at line ~1064 claims no nested `overflow-y` but block at 1127 contradicts. |
| **Root cause** | Incomplete update after table refactor. |
| **Fix complexity** | **S** for docs/comments; **M** for test alignment. |

---

## High

### UX-HIGH-001 — Mobile forced into wide pipeline table (no board)

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Confidence** | **High** |
| **Devices** | All phones (`useNarrowViewport`) |
| **Routes** | `/pipeline` |
| **Components** | `PipelinePageClient` `effectiveView` |
| **Reproduction** | Narrow viewport → board not available → always table. |
| **Evidence** | Source: `PipelinePageClient.tsx` — `effectiveView` is `"table"` whenever `useNarrowViewport()` is true (phones), regardless of saved board preference. |
| **Root cause** | Product rule: board not supported narrow. |
| **Fix complexity** | **XL** if building mobile board; **M** if alternative **card list** UX. |

### SCR-HIGH-001 — Horizontal + vertical scroll on same table (`touch-pan-xy`)

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Confidence** | **Medium** |
| **Devices** | Touch devices |
| **Routes** | `/pipeline` |
| **Components** | `data-testid="pipeline-table-scroll"` |
| **Reproduction** | Diagonal swipe on table body — browser may prefer axis ambiguously. |
| **Evidence** | `max-md:touch-pan-xy` on scroll container. |
| **Root cause** | Wide table + inner scroll + pan gestures. |
| **Fix complexity** | **M** — gesture tuning or layout (column hiding). |

### PER-HIGH-001 — Large non-virtualized pipeline table DOM

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Confidence** | **Medium** |
| **Devices** | Low-end Android, old iPhones |
| **Routes** | `/pipeline` |
| **Components** | Pipeline table rows |
| **Reproduction** | Seed many files; scroll — profile paint/JS on device. |
| **Evidence** | Static: wide table, many cells per row. |
| **Root cause** | No row virtualization. |
| **Fix complexity** | **XL** (virtualized table) or **L** (paginate / lazy). |

### SCR-HIGH-002 — Sticky stack + compact chrome (prior R1–R3)

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Confidence** | **Medium** (prior deep diagnostic) |
| **Devices** | iPhone Safari especially |
| **Routes** | `/pipeline/[fileId]` |
| **Components** | `MobileChromeController`, `PipelineFileWorkspaceShell`, `ResizeObserver` |
| **Reproduction** | Scroll file workspace rapidly — watch jumps / rubber-band / CLS (manual). |
| **Evidence** | `docs/scroll-diagnostic/root-cause-analysis.md` R1–R3. |
| **Root cause** | Scroll-linked layout + dynamic sticky height. |
| **Fix complexity** | **L** |

### RESP-HIGH-001 — Intake / settings density on SE width

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Confidence** | **Low–Medium** (needs device) |
| **Devices** | iPhone SE |
| **Routes** | `/pipeline/intake/...`, `/settings` |
| **Components** | Intake editor, settings panels |
| **Reproduction** | Walkthrough all steps on SE — note clipping. |
| **Evidence** | Many `max-h` + `overflow-y` panels. |
| **Root cause** | Desktop-first form layouts. |
| **Fix complexity** | **M–L** |

### PORT-HIGH-001 — Portal mobile parity unproven

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Confidence** | **Low** (lack of tests) |
| **Devices** | All mobile |
| **Routes** | `/portal/*` |
| **Components** | Portal pages, messaging section |
| **Reproduction** | Full client login + file view + messaging on phone. |
| **Evidence** | No `tests/mobile` coverage for portal routes in inventory. |
| **Root cause** | Test gap. |
| **Fix complexity** | **M** (tests) + **?** (bugs found) |

---

## Medium

### UX-MED-001 — Double scroll confusion (contacts, activity, tasks)

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Confidence** | **Medium** |
| **Devices** | Mobile |
| **Routes** | `/contacts`, `/activity`, `/tasks` |
| **Components** | Page-level `overflow-y-auto` regions |
| **Reproduction** | Scroll near boundary between `<main>` and inner panel. |
| **Evidence** | grep `overflow-y-auto` in pages. |
| **Root cause** | Legitimate nested regions; needs UX polish / clear scroll boundaries. |
| **Fix complexity** | **M** |

### MD-MED-001 — Typography / density inconsistent with `text-dlc-*` migration

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Confidence** | **High** |
| **Devices** | All |
| **Routes** | Global |
| **Components** | Mixed Tailwind classes |
| **Reproduction** | Visual compare tasks vs pipeline vs settings. |
| **Evidence** | `material-design-system.md` notes incremental migration. |
| **Root cause** | Legacy `text-xs` / `text-sm` stacks. |
| **Fix complexity** | **M** (incremental) |

### PER-MED-001 — Product tour / global scroll listeners (prior diagnostic)

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Confidence** | **Medium** (from prior doc, not re-verified) |
| **Devices** | All |
| **Routes** | Any with tour |
| **Components** | Tour system |
| **Reproduction** | Enable tour; scroll main content; profile. |
| **Evidence** | `final-scroll-diagnostic-summary.md` §2. |
| **Root cause** | Captured scroll / intervals. |
| **Fix complexity** | **M** |

### ACC-MED-001 — Table horizontal scroll discoverability / a11y

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Confidence** | **Medium** |
| **Devices** | Mobile |
| **Routes** | `/pipeline`, possibly `/lenders`, `/ledger` |
| **Components** | Tables |
| **Reproduction** | VoiceOver / TalkBack — scroll hint? |
| **Evidence** | Wide `min-w` tables. |
| **Root cause** | Layout pattern. |
| **Fix complexity** | **M** |

---

## Low

### LOW-001 — `AGENTS.md` pipeline file overflow description drift

| Field | Value |
|-------|-------|
| **Severity** | **Low** |
| **Confidence** | **High** |
| **Devices** | N/A |
| **Routes** | Docs |
| **Reproduction** | Compare `AGENTS.md` §3 vs `PipelineFileWorkspace.tsx` classes. |
| **Root cause** | Doc stale vs `overflow-x-clip` body. |
| **Fix complexity** | **S** |

### LOW-002 — Mix `vh` vs `dvh` in some modals

| Field | Value |
|-------|-------|
| **Severity** | **Low** |
| **Confidence** | **Medium** |
| **Devices** | iOS Safari |
| **Routes** | Various |
| **Components** | e.g. `max-h-[min(90vh,640px)]` |
| **Reproduction** | Open modal with dynamic toolbar. |
| **Root cause** | Legacy `vh`. |
| **Fix complexity** | **S** |

---

## Issue count summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 6 |
| Medium | 4+ |
| Low | 2+ |

*(Inventory can grow as portal/ledger/lenders device passes complete.)*

---

*Master context: `full-mobile-platform-audit.md`.*
