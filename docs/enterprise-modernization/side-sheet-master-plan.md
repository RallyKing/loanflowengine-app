# Side Sheet — Master Plan (Direct Lending Connection)

**Objective:** Define the **canonical contextual inspector** pattern for DLC and map every high-frequency workflow to it — replacing modal stacks and unifying drawers.

**Constraint:** Diagnostic only; aligns with scroll governance (`AGENTS.md`, `docs/scroll-architecture-rules.md`): overlays **do not** become alternate full-page scroll owners for primary route content.

---

## 1. Canonical side-sheet architecture (target)

### 1.1 Structural contract

| Region | Responsibility |
|--------|----------------|
| **Header** | Title, optional entity badge, close, overflow menu (pin / open full page) |
| **Context subtitle** | Immutable breadcrumb when opened from file: `File name · Stage · Org` |
| **Body** | Scrollable `overflow-y-auto` with `min-h-0`; **single** vertical scroll inside sheet |
| **Footer** | Primary + secondary actions; sticky on mobile when keyboard open |
| **Scrim** | Token `--dlc-scrim`; z-index from **Overlay registry** (to be documented centrally) |

### 1.2 Shared systems

| Concern | Standard |
|---------|----------|
| **Motion** | Enter/exit uses `sheet` motion class (`--dlc-motion-duration-medium2`, `--dlc-motion-easing-standard`) |
| **Elevation** | Sheet at tier **4–5**; modal confirm at **5**; never equal to toast |
| **Responsive** | `< md`: full-bleed side sheet (MD3 full-screen modal side sheet); `≥ md`: fixed width `min(480px, 40vw)` right dock **or** overlay — product choice, but **one** chosen default |
| **Focus** | Trap inside sheet; **restore** focus to invoking element on close |
| **Scroll impl** | `h-dvh max-h-dvh min-h-0 overflow-y-auto` on body — same as current drawer discipline |

### 1.3 Context preservation gains

- Operators retain **file stage** and **identity** while editing lender/task/contact.  
- Reduces **pogo-sticking** between full pages.  
- Matches **Salesforce Lightning inspector** and **Attio** record panels behaviorally.

---

## 2. Every workflow → side sheet (conversion table)

| Workflow | Current pattern | Target | Desktop | Mobile | Scroll implication |
|----------|-----------------|--------|---------|--------|--------------------|
| **Task create/edit** | `TaskDrawer` | Unified inspector | Overlay right | Full sheet | Internal scroll only |
| **Lender view/edit** | `LenderDrawer` | Unified inspector | Same | Same | Same |
| **Contact from file** | Inline / fragments | **New** inspector | Same | Full sheet | Same |
| **Document metadata** | Scattered | Inspector + preview tab | Wide sheet | Full sheet | Preview lazy |
| **Share / team** | Panel/modal mix | Inspector | Medium width | Full sheet | — |
| **Portal invite detail** | Variable | Inspector from admin | Same | Full sheet | — |
| **Webhook delivery detail** | None / technical | Inspector list→detail | Same | Full sheet | — |
| **Generate terms review** | Inline/modal | Inspector with preview | Same | Full sheet | — |
| **Fee split editor (deep)** | In-block | Optional inspector for advanced | Same | Full sheet | — |
| **Scenario “advanced criteria”** | In-page | Desktop: inspector; mobile: **snap** (see snap plan) | Split | Snap | Handoff rules |

---

## 3. Modals to replace with side sheet

| Modal class | Why replace | Exception |
|-------------|-------------|-----------|
| **Record review** (long body) | Sheet preserves context | — |
| **Multi-field** edits | Sheet shows scroll progress | — |
| **Keep modal** | **Binary confirm**, **legal ack**, **destructive** under 3 lines | Dialog stays |

---

## 4. Drawers to unify

| Component | Action |
|-----------|--------|
| `TaskDrawer` | Migrate shell → canonical inspector API |
| `LenderDrawer` | Same |
| Future **ContactInspector** | Same shell |

**Anti-pattern:** Two different **header heights** or **close** placements between task and lender.

---

## 5. Inspector opportunities (non-drawer)

| Surface | Opportunity |
|---------|-------------|
| **Right rail** on ultra-wide | Optional persistent inspector (Lightning) — **24–36 mo** |
| **Split** from hub | File preview inspector without navigation — experiment |

---

## 6. Performance implications

- **Single** overlay at a time — avoid **drawer on drawer** (except documented nested Vaul **NestedRoot** if ever needed — prefer flat).  
- **Lazy mount** inspector body until open animation completes (optional).  
- **Code-split** heavy tabs inside inspector.

---

## 7. Scroll implications

- Inspector body is an **approved nested scrollport** (`AGENTS.md` exception class: overlay aside).  
- **Never** nest **two** `overflow-y-auto` full-height regions inside inspector without `min-h-0` chain.  
- **File route:** Opening inspector **does not** change `[data-pipeline-workspace-scroll]` ownership.

---

## 8. Focus implications

- **Tab cycle** stays in inspector until closed.  
- **Screen reader:** `aria-modal` + title + description for Radix dialog pattern if used.  
- **Initial focus** on first field **or** search within inspector — product rule per workflow.

---

## 9. Shared footer actions

- **Primary:** Save / Done (disabled until delta)  
- **Secondary:** Cancel (explicit)  
- **Tertiary:** overflow — Delete, Open full page, Copy link

---

## 10. Anti-patterns to ban

1. Side sheet **without** context subtitle when launched from file.  
2. **Two** primary buttons in footer.  
3. **Full width** sheet on desktop for simple 2-field edits (too heavy).  
4. Side sheet **containing** another route’s `<main>` content.

---

*See: `material-design-3-system-map.md`, `final-ranked-action-matrix.md`, `system-unification-report.md`.*
