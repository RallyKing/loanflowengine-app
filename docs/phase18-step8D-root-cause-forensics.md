## Phase 18.8D — Root cause forensics + structural repair

**Scope:** Identify true structural causes of delete modal compression, delete execution stalls, pipeline clipping, scroll ownership violations, and overlay stacking — then apply **minimum** structural fixes only.

**Explicitly not in scope:**
- No new UX systems, token layers, or abstraction chains
- No design refactor
- No schema / ACL / graph changes

---

## A — Delete modal root cause

### Offending containers (proven)

| Layer | Issue | Effect |
|-------|--------|--------|
| **`OverlayShell` `wrapPanel={false}` wrapper** | `min-h-0 w-full` with no width floor | Flex descendants could shrink vertically; panel width unconstrained on bottom sheet |
| **`OperationalConfirmDialog` footer DOM** | `OP_CONFIRM_DANGER_ZONE` nested **inside** `OP_CONFIRM_CANCEL_ZONE` | Mobile column + `sm:flex-row` fought; danger zone `mt-3` broke alignment; delete row compressed with cancel |
| **`handleClose` pending guard** | `if (pending) return` | Cancel disabled during delete → perceived deadlock |
| **In-tree modal placement (file delete)** | `OperationalConfirmDialog` rendered inside `CollapsibleSection` → drawer → `[data-pipeline-workspace-scroll]` | `position:fixed` trapped by ancestors with **`transform`** (mobile snap header `scale-*`) and **`overflow-x-clip` / `overflow-x-hidden`** → modal painted inside a small containing block → **squish** |
| **No portal** | `OverlayShell` rendered in React tree position | All of the above applied to every nested confirm, not only file delete |

### Why 18.8A–18.8C failed

- Added `shrink-0`, touch min-heights, and `operationalMutationState` — treated **symptoms** (button classes, pending state) without fixing **containing block** + **footer structure** + **portal**.
- `overflow-y-hidden` on bottom-sheet panel helped scroll bleed but did not escape transform/clip ancestors.
- Hub `overflow-x-hidden` / `overflow-x-clip` on pipeline wrappers still masked horizontal reachability at the page shell.

### Structural fixes applied

1. **`OverlayShell.tsx`** — `createPortal(..., document.body)`; custom panel wrapper uses `shrink-0` + `max-w-[min(100%,28rem)]` (removed `min-h-0`).
2. **`operationalConfirm.ts`** — `OP_CONFIRM_ACTIONS` sibling row; cancel and danger zones are **peers** (no nesting).
3. **`OperationalConfirmDialog.tsx`** — footer uses `OP_CONFIRM_ACTIONS`; cancel **always** enabled; trace hooks on confirm/close.
4. **No new abstraction** — reused existing overlay + confirm tokens only.

---

## B — Delete execution trace

### Lifecycle map

```
UI click (Delete / Open confirm)
  → delete_confirm_accepted (dialog / provider)
  → mutation_dispatched
  → Convex mutation (removePipeline | deleteHubClient | deleteHubProject)
  → mutation_resolved | mutation_rejected | timeout_triggered
  → overlay_close
  → [file only] redirect_start → router.replace(hub) → redirect_completed
  → [file only] 800ms fallback location.assign if still on deleted route
```

### Instrumentation

- `lender-app/lib/ui/deleteExecutionTrace.ts` — `[dlc-delete]` console phases (dev or `NEXT_PUBLIC_DLC_DELETE_TRACE=1`).
- Wired: `OperationalConfirmProvider`, `OperationalConfirmDialog`, `HubHierarchyRowActions` (client + project), `PipelineFileWorkspace.deleteFile`.

### Failure classification

| Symptom | Root cause class | Fix |
|---------|------------------|-----|
| Modal frozen, cannot cancel | **UI sync** — `handleClose` blocked on `pending` | Removed guard; cancel always calls `onOpenChange(false)` |
| Second delete never fires | **UI sync** — stale `state.busy` in `execute` | `busyRef` guard in `operationalMutationState` |
| Hub delete hangs forever | **No timeout** on mutation | `withOperationalTimeout` (25s) on hub client/project |
| File delete “stuck” on route | **Routing** — rare `router.replace` miss | Existing `goToPipelineHub()` + 800ms `location.assign` fallback; trace proves redirect chain |
| Squished modal during delete | **Layout / containing block** | Portal + footer structure (not mutation) |

Failures observed in code review were **UI synchronization and layout containment**, not Convex rejection loops. Convex errors surface via existing `convexClientErrorMessage` / `convexMutationErrorMessage` paths.

---

## C — Overflow hierarchy map

### Authoritative scroll owners (unchanged contract)

| Route | Vertical scroll owner | Horizontal |
|-------|----------------------|------------|
| Default app routes | `AppChrome` `<main data-app-main-scroll>` | Page-specific |
| `/pipeline` hub | `<main>` | Board: inner `overflow-x-auto touch-pan-x` |
| `/pipeline/[fileId]` | `[data-pipeline-workspace-scroll]` | Scroller `overflow-x-clip` only (per AGENTS.md) |

### Accidental clipping removed or corrected

| Container | Before | After |
|-----------|--------|-------|
| `PipelinePageClient` root column | `overflow-x-hidden` | Removed — was clipping board columns and popovers |
| `OperationalContentReveal` | `overflow-x-clip` | Removed — let board scrollport own horizontal overflow |
| Hub hierarchy shell | `overflow-x-clip` | Removed |
| `PipelineFileWorkspaceShell` sheet root | `overflow-x-hidden` | Removed — sheet flex shell no longer masks children |

### Sticky / overlay conflicts

- File workspace snap header uses `transform` on mobile → **must not** host `position:fixed` modals; portal fixes stacking above chrome (`layerZIndexStyle("MODAL")` on `document.body`).
- Sticky access banner remains inside `[data-pipeline-workspace-scroll]` (intended); not moved.

### Board horizontal scroll

- Retained: `data-testid="pipeline-board-scroll"` wrapper with `overflow-x-auto touch-pan-x`.
- Ancestors no longer apply page-level `overflow-x-hidden` / `overflow-x-clip` above the board.

---

## D — Structural fixes applied (summary)

| File | Change |
|------|--------|
| `components/ui/OverlayShell.tsx` | Portal to `document.body`; panel wrapper `shrink-0` + max width |
| `lib/ui/operationalConfirm.ts` | `OP_CONFIRM_ACTIONS`; sibling cancel/danger zones |
| `components/ui/OperationalConfirmDialog.tsx` | Footer structure; cancel always; delete trace |
| `lib/ui/operationalMutationState.ts` | `busyRef` anti-stale submit guard |
| `lib/ui/deleteExecutionTrace.ts` | Structured delete lifecycle logging |
| `components/pipeline/HubHierarchyRowActions.tsx` | 25s timeout + trace on hub deletes |
| `components/PipelineFileWorkspace.tsx` | Delete trace + existing timeout/redirect |
| `app/pipeline/PipelinePageClient.tsx` | Remove hub-level horizontal clip traps |
| `components/PipelineFileWorkspaceShell.tsx` | Remove sheet `overflow-x-hidden` |

---

## E — Prevention rules

1. **Destructive dialogs** must render through `OverlayShell` (portaled) — never rely on in-drawer `fixed` without verifying no `transform` / `filter` ancestors.
2. **Footer actions** — cancel and destructive controls are **siblings** in a dedicated `OP_CONFIRM_ACTIONS` row; never nest danger inside cancel flex.
3. **Never block cancel on `pending`** — only disable duplicate confirm submits.
4. **Single vertical scroll owner** per route — do not add competing `overflow-y-auto` bands on hub/file routes.
5. **Forbidden on pipeline hub ancestors of the board:** `overflow-x-hidden`, page-level `overflow-x-clip` (use board-local `overflow-x-auto` only).
6. **Sticky regions** must not sit inside `overflow-hidden` ancestors that clip their stickiness scope unintentionally.
7. **Action rows** — `shrink-0` on footer shell and primary buttons; no `min-h-0` on modal panel wrappers.
8. **Hub destructive mutations** — always use `withOperationalTimeout` (25s) + surface errors in-modal.

---

## Validation

### Automated (from `lender-app/`)

- `npm run build`
- `npm run qa:governance`
- `npm run deploy:prod`

### Manual smoke (required)

**Delete modals:** desktop, tablet, mobile, PWA, long entity names, nested cascade (typed `DELETE`).

**Delete execution:** client / project / file delete; blocked delete; failed delete; retry; confirm cancel during pending.

**Overflow:** hub table, board horizontal pan, file workspace scroll, mobile landscape/portrait, PWA, iOS Safari, Android Chrome.

Enable trace in prod debugging: `NEXT_PUBLIC_DLC_DELETE_TRACE=1`.

---

## Relation to 18.8C

18.8C added presentation tokens and mutation state machine polish. **18.8D** fixes the architectural mistakes those passes missed: **portal**, **footer DOM**, **cancel deadlock**, **hub timeout**, **horizontal clip traps**, and **busy ref** for imperative confirm.
