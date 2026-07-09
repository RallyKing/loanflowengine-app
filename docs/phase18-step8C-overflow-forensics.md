## Phase 18.8C — Overflow forensics (pipeline workspace containment)

**Goal:** Identify overflow-hidden/clipping traps and fix containment without changing routing or the scroll-ownership architecture.

**Scroll ownership (authoritative)**
- **Default routes:** `AppChrome` `<main data-app-main-scroll>` owns vertical scroll.
- **Pipeline file route (`/pipeline/[fileId]`):** `<main>` is `overflow-y-hidden`; **`[data-pipeline-workspace-scroll]`** owns vertical scroll.
- **Board (pipeline hub board view):** vertical scroll stays on `<main>`; board needs **horizontal** scroll within the hub content region.

---

## Findings (high-signal)

### 1) Pipeline hub content wrapper uses `overflow-x-hidden` (clips “wide” children)
- **Offending component:** `lender-app/app/pipeline/PipelinePageClient.tsx`
- **Overflow direction:** `overflow-x-hidden` on the hub content reveal container.
- **Why clipping occurs:** board view (`PipelineBoardView`) relies on horizontal scrolling; ancestor `overflow-x-hidden` can visually clip scroll shadows and makes wide surfaces feel “trapped”.
- **Containment fix (planned/implemented in 18.8C):**
  - ensure board view’s own horizontal scroller remains the only x-scroll owner (already `overflow-x-auto` + `min-w-max` inside `PipelineBoardView`)
  - remove/relax x-clipping on the hub reveal wrapper when board is active (or scope x-clipping to table view only)

### 2) File workspace shell uses `overflow-x-hidden` and `overflow-x-clip` broadly (OK for x, risky for nested panels)
- **Offending components:**
  - `lender-app/components/PipelineFileWorkspace.tsx`
  - `lender-app/components/PipelineFileWorkspaceShell.tsx`
  - `lender-app/components/AppChrome.tsx`
- **Overflow direction:** x hidden/clip on multiple wrappers.
- **Why clipping occurs:** nested “cards” or disclosure content can be visually clipped when they rely on box shadows or extend beyond the content container.
- **Containment fix (planned/implemented in 18.8C):**
  - prefer `overflow-x-clip` (not `hidden`) where we need to prevent sideways scroll but avoid clipping focus rings/shadows
  - ensure structural containers have `min-w-0` and children that must not shrink use `shrink-0`

### 3) Sticky header masking and z-index interplay (not a redesign)
- **Offending surfaces:** sticky strips and docked chrome that use ad-hoc `z-*` values.
- **Why clipping occurs:** nested stacking contexts can place header chrome above modal surfaces or clip overlays.
- **Containment fix (implemented in 18.8C):**
  - standardize modals/scrims on `layerZIndexStyle("MODAL")` (example: intake dashboard modal)
  - provide a single operational layer map in `lender-app/lib/ui/operationalLayers.ts` to avoid “invented z”

---

## Scroll ownership map (current, unchanged)
- **`/pipeline` hub table:** vertical scroll = `<main>`; horizontal scroll only for table lanes where explicitly required.
- **`/pipeline` hub board:** vertical scroll = `<main>`; horizontal scroll = board scroller (`PipelineBoardView`).
- **`/pipeline/[fileId]` file workspace:** vertical scroll = `[data-pipeline-workspace-scroll]`; `<main>` is a non-scrolling flex shell.
- **Overlays (dialogs/sheets/inspectors):** bounded internal scroll only; do not replace route scroll owners.

