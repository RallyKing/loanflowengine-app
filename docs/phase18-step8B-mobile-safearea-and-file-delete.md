## Phase 18.8B — Mobile PWA Navigation Safe-Zone + Pipeline File Delete Execution Repair

**Scope:** Stabilization + operational continuity only.

**Explicitly not in scope (unchanged):**
- Navigation IA / redesign
- Schema changes
- ACL changes
- Pipeline architecture rewrites
- Graph/index system redesign
- Phase 18 motion system changes
- Any Phase 18.9 work

---

## Part 1 — Mobile PWA safe-area stabilization (bottom navigation)

### What was broken
- Mobile sticky bottom navigation could feel **flush** against the viewport edge and collide with:
  - iOS Safari controls
  - Android browser chrome
  - installed PWA system bars / safe-area insets
- Result: cramped, partially hidden, harder to tap, “non-premium” feel in PWA mode.

### What changed
- **Central safe-area foundation** added in `lender-app/lib/ui/safeArea.ts`:
  - `safeAreaBottom()`, `safeAreaTop()`
  - `mobileBottomDockHeight()`
  - `readStandalonePwaSignals()`, `isStandalonePwa()`
  - `pwaBottomPadding()` and `bottomDockOffset()` helpers (CSS-string based; `env(safe-area-inset-*)` safe).

- **Bottom nav now floats**:
  - `components/MobileBottomNav.tsx` now positions the dock with a **lifted `bottom` offset**:
    - incorporates `env(safe-area-inset-bottom)`
    - adds a small “float gap”
    - adds extra padding in **standalone PWA**
    - lifts above the on-screen keyboard using `layout.keyboardInsetBottom`
  - Dock surface uses Material-aligned elevation (`shadow-dlc-*`) + rounded top shape for a native-dock feel.

- **Content padding respects the dock**:
  - `components/AppChrome.tsx` applies `pwaBottomPadding(...)` as the effective bottom padding when bottom navigation is active, preventing content collision with the floating dock.

### Touch target certification
- Nav items retain minimum height targets (existing density bucket rules preserved).
- `touch-manipulation` retained for tap reliability.

---

## Part 2 — Pipeline file delete execution repair

### What was broken
Pipeline file delete from the workspace danger-zone could deadlock or “half succeed”:
- confirm resolves but delete chain stalls / navigation race
- success path relied on unmount (no `finally` reset)
- user could remain on a deleted file route in some timing cases
- error messages could be vague / non-actionable

### What changed (UI-only hardening)
`components/PipelineFileWorkspace.tsx`
- Delete now uses `withOperationalTimeout(..., 25s)` so the UI can recover when the mutation stalls.
- Success path no longer relies on unmount:
  - clears dialog state (`setConfirmingDelete(false)`, `setDeleting(false)` in `finally`)
  - shows an operational “removed” toast via `showOperationalToastRemoved("Loan file", p.fileName)`
- Redirect is now **guaranteed**:
  - hub redirect uses `router.replace(...)` and **preserves projection context** using hub query params (`hubMode`, `hubEntity`, `hubClient`, `hubProject`)
  - includes a hard fallback: if still on the deleted file route after 800ms, `window.location.assign(href)`
- Failure path:
  - keeps the dialog usable
  - displays actionable error text via `convexClientErrorMessage(...)`

### Orphan/cleanup audit (server-side behavior unchanged)
Deletion is still executed by `convex/pipeline.ts → remove → graphCleanup.deletePipelineGraph`.
`convex/graphCleanup.ts` confirms expected cleanup / detach behavior for:
- file messages + message attachments (storage best-effort)
- contact ↔ file links
- file shares + file activity
- tasks: detaches `relatedFileId` (and refreshes task search)
- notifications / contact activity: detaches file linkage
- portal grants + related uploads/requests/updates/sessions/magic links
- library links
- indexed graph edges + resource shares
- finally deletes the pipeline row

Ledger/payments remain as historical records (existing documented behavior).

---

## Validation (this session)

**Local build:** `npm run build` ✅

**Governance QA gate:** `npm run qa:governance` ✅ (build + mobile core + desktop smoke)

**Vercel production deploy:** `npm run deploy:prod` ✅
- Production alias: `https://lender-app-zeta.vercel.app`
- Deployment id: `dpl_8FW33462hV39PmHpAL6SunrG4B1V`
- Inspect: `https://vercel.com/joshua-4539s-projects/lender-app/8FW33462hV39PmHpAL6SunrG4B1V`

**Convex codegen / deploy note**
- `npm run convex:codegen` failed locally with: “You don't have access to the selected project…”
- No backend mutations were changed in 18.8B; this phase is **UI-only**.

---

## Production smoke (recommended)
- **Mobile bottom nav**
  - iPhone Safari: dock stays above browser chrome and safe area; taps not obstructed
  - iOS installed PWA: dock feels native and not clipped
  - Android Chrome + installed PWA: dock not glued to bottom edge; no overlap with system bars
- **Pipeline file delete**
  - Delete from danger zone redirects immediately (never remains on deleted route)
  - Success toast appears
  - Failure shows actionable message; retry/cancel works

---

## Files changed
- `lender-app/lib/ui/safeArea.ts` (new)
- `lender-app/components/MobileBottomNav.tsx`
- `lender-app/components/AppChrome.tsx`
- `lender-app/components/PipelineFileWorkspace.tsx`

