# Overflow & touch-scroll audit (exhaustive for pipeline-mobile path)

**Diagnostic only.** Sources: ripgrep across `lender-app/` + targeted file reads.  
**Purpose:** List overflow/touch/overscroll surfaces relevant to **pipeline file workspace on mobile** and **competing** scroll regions.

---

## 1. Global / design tokens

**File:** `lender-app/app/globals.css`

| Rule / variable | Notes |
|-----------------|--------|
| `body` | `overflow-x: clip`, **`overflow-y: hidden`** — locks document scroll. |
| `[data-app-main-scroll]` | `scroll-behavior: smooth` (reduced motion override), `-webkit-overflow-scrolling: touch`, `touch-action: pan-y`, `overscroll-behavior-y: contain`. |
| `body[data-shell="auth"]` | `overflow-y: auto`, `-webkit-overflow-scrolling: touch`, `touch-action: pan-y`. |
| `--pipeline-scroll-anchor-gap` | `12px` — used in `scroll-margin-top` for pipeline sections. |
| `.touch-scroll-y` | `-webkit-overflow-scrolling: touch`, `touch-action: pan-y`. |
| `.touch-scroll-x` | `touch-action: pan-x`. |
| `.touch-pan-xy` | Both axes — for strips that must not steal vertical from `<main>`. |

**Scroll snap:** No `scroll-snap-type` / `scroll-snap-align` found in `globals.css` or pipeline-first path.

---

## 2. App shell — `AppChrome.tsx`

| Element | Classes (overflow / touch / overscroll) | Competes with main? |
|---------|-------------------------------------------|---------------------|
| Client portal wrapper | `overflow-hidden` on outer flex column | No |
| `main` | `touch-scroll-y overflow-y-auto overflow-x-clip overscroll-contain` | **Owner** |
| SaaS outer | `overflow-hidden` | No |
| Classic outer | `overflow-hidden` | No |
| Master nav strip | `overflow-x-auto` (hidden on small, `md:block`) | Horizontal only |
| Backdrop for SaaS menu | `fixed inset-0` (no overflow) | N/A |

---

## 3. Pipeline file workspace

| Component | File | Key overflow classes | Necessary? |
|-----------|------|----------------------|------------|
| Workspace root | `PipelineFileWorkspace.tsx` | `flex-1 flex-col min-h-0` | Yes — flex discipline |
| Drawer body | `PipelineFileWorkspace.tsx` | **`overflow-x-clip`** only, `pb-[max(1.5rem,env(safe-area-inset-bottom))]` | Yes — avoids nested y-scroll per AGENTS intent |
| Loading / not-found shells | Same | Same pattern | Yes |
| `PipelineFileWorkspaceShell` | `PipelineFileWorkspaceShell.tsx` | Content sibling: `overflow-x-clip`; sentinel: `overflow-hidden` (1px) | x-clip: yes; sentinel: harmless |
| `WorkspaceContentContainer` | `WorkspaceContentContainer.tsx` | `overflow-x-clip` | Yes — clip horizontal bleed |

**Nested vertical scroll on file page:** **None** in the primary shell (by design).

---

## 4. Collapsible / animated regions (pipeline)

| Mechanism | File | Overflow / grid | Effect |
|-----------|------|-------------------|--------|
| `mobileScrollCollapseGridClass` | `lib/mobileCompactChrome.ts` | `max-md:grid max-md:overflow-hidden`, `grid-rows-[0fr]/[1fr]` | Hides chrome rows without `display:none`; **clips** inner while animating |
| `mobileScrollRevealInnerClass` | same | `min-h-0 overflow-hidden md:overflow-visible` | Inner clip for grid animation |
| `pipelineWorkspaceCollapseInner` | `lib/pipelineWorkspaceCard.ts` | `min-h-0 overflow-hidden [overflow-anchor:none]` | Block collapse animation |

**Risk flag:** Any **`overflow-hidden`** on an ancestor of `position: sticky` can **break sticky** if it becomes the scroll clip edge. Here, sticky file header is **sibling above** the `overflow-x-clip` content column (not a child of the clip in a way that traps y — x-clip is horizontal). **Worth validating in browser:** `overflow-x: clip` interaction with sticky in WebKit.

---

## 5. Quick panels / messaging / activity (embedded in file)

Representative nested scrolls **inside** `<main>` (small regions):

| Component | File | Pattern |
|-----------|------|---------|
| `PipelineFileActivityPanel` | `PipelineFileActivityPanel.tsx` | `max-h-72 … overflow-y-auto` on list |
| `FileMessagingPanel` | `FileMessagingPanel.tsx` | `max-h-48 … overflow-y-auto` |
| `OrgEmailFromFilePanel` | `OrgEmailFromFilePanel.tsx` | `max-h-40 … overflow-y-auto` |
| `ClientPortalInviteBlock` | `ClientPortalInviteBlock.tsx` | `max-h-48 … overflow-y-auto` |

These are **local** scrollports (nested). They can **compete for touch** with `<main>` when the user drags inside the list; `touch-action` on `<main>` is `pan-y`, lists often inherit — **gesture negotiation** is browser-dependent.

---

## 6. Drawers & modals (when open on top of file)

| Component | File | Scrollport |
|-----------|------|------------|
| `TaskDrawer` | `TaskDrawer.tsx` | Full: `overflow-y-auto` on inner; aside: `aside` `overflow-y-auto`, `h-dvh max-h-dvh min-h-0`, `overscroll-contain` |
| `LenderDrawer` | `LenderDrawer.tsx` | Same family of classes |
| `GlobalSearchPalette` | `GlobalSearchPalette.tsx` | Column `overflow-hidden`; results `overflow-y-auto` |
| `HelpCenterPanel` | `HelpCenterPanel.tsx` | Multiple `overflow-y-auto` |
| `NewPipelineFileDialog` | `NewPipelineFileDialog.tsx` | `max-h-[min(90dvh,640px)] overflow-y-auto` |

**When closed:** no competition.

---

## 7. SaaS sidebar (mobile)

**File:** `SaasSidebar.tsx`

- `aside`: `max-md:fixed`, `max-md:h-dvh`, `nav`: `flex-1 min-h-0 touch-scroll-y overflow-y-auto overscroll-contain`.
- **Competing scroll:** Yes when menu open — **nav** vs **main** (main still exists underneath).

---

## 8. Pipeline **list** page (context — not file workspace)

**File:** `app/pipeline/PipelinePageClient.tsx`

- `min-h-0 flex-1 overflow-y-auto overscroll-contain` on inner region.
- Table strip: `overflow-x-auto overscroll-x-contain`, `max-md:touch-pan-xy`.

This is a **different route** but shares patterns; file workspace intentionally differs (no second page `overflow-y`).

---

## 9. `min-h-0` chain health (pipeline file path)

Observed **present** on:

- `html` / `body` (globals + layout)
- `AppChrome` flex wrappers and `main`
- `PipelineFileWorkspace` root and drawer body
- `PipelineFileWorkspaceShell` root and content column

**Flag:** Any future component that inserts `flex-1` + `overflow-y-auto` **without** `min-h-0` on ancestors will recreate “unbounded flex” bugs (per `AGENTS.md`).

---

## 10. Competing scroll regions — summary table

| Scenario | Scroll regions | Severity (diag) |
|----------|----------------|------------------|
| Default pipeline file | `<main>` + small max-height lists | Low–medium (local nests) |
| Task/Lender drawer open | Drawer aside + `<main>` (inert under overlay) | Expected; main should not receive touch |
| SaaS mobile nav open | Sidebar nav + `<main>` | Medium; two vertical scroll owners visible stack |
| Product tour active | `window` scroll listener + scrollIntoView on targets | Can fight user scroll (see rerender doc) |

---

*End of overflow audit.*
