# Phase 35.1 — Universal search bar optimization audit (read-only)

**Date:** 2026-05-28  
**Status:** Forensic audit + styling blueprint only — **no code changes**  
**Goal:** Make every platform **search/filter text** field high-contrast (light grey fill, bold value + bold placeholder) without restyling ordinary form inputs.

---

## Executive summary

| Question | Answer |
|----------|--------|
| Single centralized search component? | **No.** There is no `SearchBar.tsx`, `Search.tsx`, or `variant="search"` on `components/ui/Input.tsx`. |
| Default text field styling? | **`Input`** → `opInputFieldClass()` in `lib/ui/operationalInputs.ts`: `bg-background`, normal weight, `placeholder:text-muted-foreground/60`. |
| How many search UX patterns? | **Three:** (1) `Input` + Lucide `Search` icon + `pl-9`, (2) bare `Input` / height overrides, (3) **raw** `<input>` in overlays. |
| Second input stack? | **Intake** uses `TextInput` from `components/intake/ui/Field.tsx` (`bg-background`, normal placeholder) — separate from main app `Input`. |
| Global command search? | **`GlobalSearchPalette`** in `AppChrome` — modal + chrome trigger; **not** wired through `Input`. |
| Recommended approach | **Hybrid:** add shared `opSearchFieldClass()` + thin **`SearchField`** wrapper (icon, clear, `className` merge); migrate **~20 call sites** file-by-file; **do not** change default `Input` for all fields. |

**Inventory:** **20 user-facing search/filter text fields** across **15 files** (plus 1 non-input global search **trigger** button).

---

## 1. Shared component discovery

### 1.1 `components/ui/Input.tsx`

- Wraps native `<input>` with `opInputFieldClass({ className })`.
- **No `variant` prop** — search fields today pass extra `className` (e.g. `pl-9`, `h-8`) only.
- Changing `Input` globally would affect **every** form control site-wide — **not acceptable** for this initiative.

### 1.2 `lib/ui/operationalInputs.ts` — `opInputFieldClass()`

Current baseline (lines 26–43):

| Token | Value |
|-------|--------|
| Background | `bg-background` |
| Border | `border-border/40` |
| Text | inherits normal weight via `MOBILE_SAFE_FORM_FONT_CLASS` (`text-base md:text-sm`) |
| Placeholder | `placeholder:text-muted-foreground/60` |
| Height | `OP_CONTROL_HEIGHT_CLASS` (`min-h-10 h-10`) |

**Conclusion:** Search needs a **parallel** helper, e.g. `opSearchFieldClass()`, not a change to `opInputFieldClass()`.

### 1.3 Related files (not a shared search bar)

| File | Role |
|------|------|
| `components/GlobalSearchPalette.tsx` | Sitewide ⌘K palette; raw `<input>` inside dialog |
| `components/ScenarioSearch.tsx` | Lender **scenario matcher** form (criteria fields), not a list search bar |
| `convex/globalSearch.ts` | Backend search index API — out of UI scope |
| `lib/globalSearchText.ts` | Denormalized blobs for Convex — out of UI scope |

### 1.4 `components/intake/ui/Field.tsx` — `TextInput`

Separate stack for intake routes:

```ts
bg-background … text-sm … placeholder:text-muted-foreground
```

Only **one** intake search field today (`Dashboard.tsx` line ~710).

---

## 2. Global inventory — search & filter text fields

Line numbers refer to **`lender-app/`** at audit time; may shift slightly after edits.

### 2.1 Primary workspace pages (`app/`)

| # | File | Lines | Context | Component | Current extra classes / notes |
|---|------|-------|---------|-----------|------------------------------|
| 1 | `app/pipeline/PipelinePageClient.tsx` | 1616–1626 | Hub toolbar (sticky) | `Input` + `Search` icon | `className="pl-9"`; clear button overlay |
| 2 | `app/pipeline/PipelinePageClient.tsx` | 2492–2502 | Projection views (capital/events/referral) | `Input` + icon | `className="h-9 pl-8"`; `data-testid="pipeline-projection-search"` |
| 3 | `app/tasks/page.tsx` | 2327–2333 | Pinned toolbar | `Input` | `className="h-8 min-w-[9rem] flex-1 shrink-0 sm:max-w-[16rem]"` |
| 4 | `app/tasks/page.tsx` | 3441–3447 | Today plan — pin task | `Input` | `className="min-w-[14rem] flex-1 bg-background"` |
| 5 | `app/ledger/page.tsx` | 706–715 | Ledger sticky toolbar | `Input` + icon | `className="pl-9"` |
| 6 | `app/ledger/page.tsx` | 1394–1400 | Add-to-ledger file picker | `Input` | `className="h-8"`; `autoFocus` |
| 7 | `app/contacts/page.tsx` | 622–635 | Contacts list header | `Input` + icon | `className="pl-9"`; debounced search |
| 8 | `app/lenders/LendersWorkspaceClient.tsx` | 206–217 | Quick search (table mode) | `Input` + icon | `className="pl-9"`; id `lenders-quick-search` |

### 2.2 Drawers, sheets, and file workspace (`components/`)

| # | File | Lines | Context | Component | Current extra classes / notes |
|---|------|-------|---------|-----------|------------------------------|
| 9 | `components/TaskDrawer.tsx` | 1891–1902 | Link related tasks | `Input` + icon | `className="pl-9"`; in drawer |
| 10 | `components/TaskDrawer.tsx` | 2573–2584 | Link pipeline file | `Input` + icon | `className="pl-9"` |
| 11 | `components/PipelineFileWorkspace.tsx` | 3914–3924 | Attach lender search | `Input` + icon | `className="pl-9"`; `enterKeyHint="search"` |
| 12 | `components/LenderTable.tsx` | 336–342 | Lenders table quick search | `Input` + icon | `className="pl-9"`; may be hidden via `hideQuickSearchField` |
| 13 | `components/LenderDrawer.tsx` | 730–740 | Merge duplicate lender | `Input` | `className="text-sm"`; min 2 chars |
| 14 | `components/PipelineHubMobileFilterSheet.tsx` | 176–182 | Mobile filter **drawer** | `Input` | `className="w-full"`; placeholder `File, stage, address…` |
| 15 | `components/PipelineFileSharingSection.tsx` | 250–256 | Share — find team member | `Input` | `className="mt-1 h-9"`; label “Search team members” |
| 16 | `components/events/EventsWorkspaceClient.tsx` | 184–189 | Events list | `Input` | `className="min-h-10 min-w-0 flex-1"`; no search icon |

### 2.3 Overlays & help (raw `<input>`)

| # | File | Lines | Context | Component | Current classes |
|---|------|-------|---------|-----------|-----------------|
| 17 | `components/GlobalSearchPalette.tsx` | 348–356 | ⌘K dialog query | Raw `<input>` | `bg-transparent … placeholder:text-muted-foreground md:text-sm` |
| 18 | `components/HelpCenterPanel.tsx` | 147–152 | Help article filter | Raw `<input>` in `bg-muted/30` wrapper | `bg-transparent py-2 text-sm placeholder:text-muted-foreground` |

### 2.4 Global search chrome trigger (not a text field)

| # | File | Lines | Notes |
|---|------|-------|-------|
| — | `components/GlobalSearchPalette.tsx` | 262–304 | **Button** mimicking search (`bg-muted/25`, `text-muted-foreground`) — optional **visual** alignment in 35.2, separate from field styling |

### 2.5 Intake module (separate design stack)

| # | File | Lines | Context | Component |
|---|------|-------|---------|-----------|
| 19 | `components/intake/Dashboard.tsx` | 706–715 | Intake sheet list filter | `TextInput` + inline SVG icon, `className="pl-9"` |

### 2.6 Explicitly out of scope (not list/search bars)

| Area | Reason |
|------|--------|
| `app/portal/*`, `app/shared/page.tsx` | No text search inputs found |
| `app/activity`, `app/documents`, `app/settings`, `app/analytics` | No `placeholder="Search…"` fields |
| `app/print/ledger` | Print view — no interactive search |
| `components/ScenarioSearch.tsx` | Deal-criteria form, not filter-as-you-type |
| Contacts role `<select>` (`app/contacts/page.tsx` ~666) | Filter dropdown, not search text |
| Pipeline client/project `<select>` filters | Entity filters, not search text |

---

## 3. Style property analysis

### 3.1 Dominant pattern today

Most search fields:

1. Use **`Input`** → looks like every other operational field (`bg-background`, subtle border).
2. Add **`pl-9`** when a `Search` icon is absolutely positioned at `left-2.5`.
3. Use **muted placeholder** at 60% opacity — low contrast vs desired “impossible to miss” spec.
4. Occasionally override height (`h-8`, `h-9`, `min-h-10`) — **inconsistent** density.

### 3.2 Overlay inputs

`GlobalSearchPalette` and `HelpCenterPanel` use **transparent** inputs inside bordered containers — styling is split between **wrapper** and **input**, so a single `Input` variant would not apply cleanly without refactoring the wrapper.

### 3.3 Dark mode

Platform uses semantic tokens (`bg-background`, `bg-muted`, `text-foreground`, `dlc-surface-*`). Blueprint should use **token-based** greys, not hard-coded `gray-100` only, e.g.:

- Light: `bg-dlc-surface-low` or `bg-muted/50`
- Dark: `dark:bg-dlc-surface-low` or `dark:bg-muted/40`

Per `.cursor/rules/material-design-rules.mdc`, prefer **`rounded-dlc-sm`**, `duration-dlc-*`, and existing focus rings over one-off stacks.

---

## 4. Proposed uniform search field styling

### 4.1 New helper — `opSearchFieldClass()` (recommended location: `lib/ui/operationalInputs.ts`)

Draft class string (DLC-aligned; satisfies bold text + bold placeholder + grey fill):

```ts
export function opSearchFieldClass(options?: { className?: string }): string {
  return cn(
    OP_CONTROL_HEIGHT_CLASS,
    "w-full rounded-dlc-sm border border-border/60",
    "bg-dlc-surface-low font-bold text-foreground",
    "dark:bg-dlc-surface-low/80",
    MOBILE_SAFE_FORM_FONT_CLASS,
    "leading-normal shadow-none",
    opMotionFastTransition,
    "placeholder:font-bold placeholder:text-foreground/70",
    "dark:placeholder:text-foreground/60",
    OP_INPUT_HOVER_CLASS,
    OP_INPUT_FOCUS_CLASS,
    "disabled:cursor-not-allowed disabled:opacity-[0.48]",
    options?.className,
  );
}
```

**User spec mapping:**

| Request | Proposal |
|---------|----------|
| Light grey background | `bg-dlc-surface-low` (+ dark variant) |
| Bold text | `font-bold text-foreground` |
| Bold placeholder | `placeholder:font-bold placeholder:text-foreground/70` |
| Do not affect normal inputs | Separate helper only used by search call sites |

### 4.2 Optional wrapper — `components/ui/SearchField.tsx`

Thin presentational component to **deduplicate** the repeated pattern:

- Left `Search` icon (consistent offset)
- `Input` or native input using `opSearchFieldClass()`
- Optional clear button (pipeline/ledger already implement ad hoc)
- Props: `value`, `onChange`, `placeholder`, `aria-label`, `className`, `disabled`, `data-testid`

**Benefits:** One place for padding (`pl-9`), bold styling, and future a11y (`type="search"` if desired).

### 4.3 Overlay / raw input variant — `opSearchOverlayInputClass()`

For `GlobalSearchPalette` + `HelpCenterPanel` inner inputs:

```ts
// Applied to the <input> itself inside an existing bordered row
"min-w-0 flex-1 bg-transparent py-2 font-bold text-foreground outline-none placeholder:font-bold placeholder:text-foreground/70"
```

Wrapper rows should use `bg-dlc-surface-low` (or keep `bg-muted/30` but increase contrast) so the **grey fill** is visible even when the input is `bg-transparent`.

### 4.4 Intake `TextInput` (one field)

Either:

- Add optional `variant="search"` to intake `TextInput` that merges `opSearchFieldClass`, or
- Pass a one-off `className` on `Dashboard.tsx` only.

Prefer **not** changing default intake `TextInput` for all intake forms.

---

## 5. Implementation blueprint (Phase 35.2+)

### 5.1 Strategy decision

| Approach | Verdict |
|----------|---------|
| **A. Global `Input` rewrite** | **Reject** — breaks non-search fields. |
| **B. `opSearchFieldClass` + migrate call sites** | **Recommended** — predictable, grep-verifiable. |
| **C. `SearchField` component only** | **Combine with B** — reduces copy-paste icon/clear markup. |
| **D. CSS attribute selector `[aria-label*="Search"]`** | **Reject** — fragile, misses unlabeled fields. |

### 5.2 Suggested execution order

1. **Add** `opSearchFieldClass()` (+ optional `opSearchOverlayInputClass()`) in `lib/ui/operationalInputs.ts`.
2. **Add** `components/ui/SearchField.tsx` using the helper (optional clear slot).
3. **Migrate high-traffic pages** (batch 1): Pipeline hub, Tasks toolbar, Ledger, Contacts, Lenders quick search.
4. **Migrate drawers/sheets** (batch 2): `TaskDrawer`, `PipelineFileWorkspace`, `LenderTable`, `LenderDrawer`, mobile filter sheet, sharing section, events.
5. **Migrate overlays** (batch 3): `GlobalSearchPalette`, `HelpCenterPanel` (+ optional trigger button contrast).
6. **Intake** (batch 4): `Dashboard.tsx` search `TextInput`.
7. **QA:** `docs/mobile-testing-rules.md` — verify search fields on iPhone/Android (bold 16px mobile font already via `MOBILE_SAFE_FORM_FONT_CLASS`), dark mode, drawer keyboard overlap.
8. **Deploy** per `docs/deployment-rules.md` when shipping UI.

### 5.3 Per-file change type (quick reference)

| File | Change type |
|------|-------------|
| `PipelinePageClient.tsx` | Replace 2 `Input` search blocks with `SearchField` or `className={cn(opSearchFieldClass(), "pl-9")}` |
| `tasks/page.tsx` | 2 inputs — toolbar + plan pin |
| `ledger/page.tsx` | 2 inputs |
| `contacts/page.tsx` | 1 input |
| `LendersWorkspaceClient.tsx` | 1 input |
| `TaskDrawer.tsx` | 2 inputs |
| `PipelineFileWorkspace.tsx` | 1 input |
| `LenderTable.tsx` | 1 input |
| `LenderDrawer.tsx` | 1 input |
| `PipelineHubMobileFilterSheet.tsx` | 1 input |
| `PipelineFileSharingSection.tsx` | 1 filter input (include in search styling — user-facing “find member”) |
| `EventsWorkspaceClient.tsx` | 1 input — add icon for parity? |
| `GlobalSearchPalette.tsx` | Wrapper + inner input classes |
| `HelpCenterPanel.tsx` | Wrapper + inner input classes |
| `intake/Dashboard.tsx` | `TextInput` class merge |

### 5.4 Verification grep (post-implementation)

Run from `lender-app/`:

```bash
# Should return only SearchField / opSearchFieldClass definitions and tests
rg 'placeholder=.*[Ss]earch' app components --glob '*.tsx'

# Ensure no stale search Input without opSearchFieldClass
rg 'placeholder=.*[Ss]earch' -A2 --glob '*.tsx' | rg 'Input'
```

Manual: open Pipeline, Tasks, Ledger, Contacts, Lenders, ⌘K palette, Help panel, one drawer search.

---

## 6. Risks & constraints

- **Height overrides** (`h-8` on Tasks/Ledger picker) may fight `OP_CONTROL_HEIGHT_CLASS` — allow `compact` prop on `SearchField` that uses `h-8 min-h-8` for dense toolbars only.
- **Bold placeholders** in nested drawers on dark `bg-muted/20` rows — test contrast ratio (WCAG) per `docs/governance/accessibility-policy.md`.
- **E2E tests** referencing search fields by placeholder (`phase13-step5-hierarchy-hard-certification.spec.ts` uses `name: /search query/i` for **global** palette) — update only if aria/roles change.
- **Do not** style `Filter by name` differently from other search fields if product wants one visual language for all “type to filter list” controls.

---

## 7. Summary

There is **no** single search component to upgrade today. Search UX is **distributed** across ~20 fields using **`Input` + local `className`**, plus **2 raw overlay inputs** and **1 intake `TextInput`**. The correct Phase 35.2 path is a **new search-specific token/helper** and systematic migration — **not** a global `Input` change.

---

**Audit constraint honored:** No application code modified in Phase 35.1.
