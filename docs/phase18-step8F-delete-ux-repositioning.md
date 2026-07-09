## Phase 18.8F — Delete UX repositioning (complete)

### Objective

Reposition destructive confirmation as a **premium, workspace-centered desktop modal** and a **separate mobile bottom sheet** — not a hybrid shell.

---

## Architecture split

| Mode | Breakpoint | Shell | Positioning |
|------|------------|-------|-------------|
| `desktop-modal` | `min-width: 768px` | `DestructiveConfirmShell` desktop branch | Fixed at **workspace main column** center (`translate(-50%, -50%)`) |
| `mobile-sheet` | `< 768px` | `DestructiveConfirmShell` sheet branch | `flex justify-end`, full-width sheet, safe-area |

Hook: `lib/ui/useDestructiveConfirmPresentation.ts`

---

## Desktop requirements (implemented)

- Width: `clamp(440px, 42vw, 620px)` with `max-width: min(620px, calc(100vw - 64px))` (32px+ margin)
- Max height: `min(82vh, 760px)`
- Workspace-centered anchor (sidebar-aware)
- Fade + subtle scale entrance (`dlc-destructive-confirm-desktop` in `globals.css`)
- Stronger scrim (`bg-black/45` + blur)
- Generous padding in header/body/footer tokens
- Footer actions **centered** (no edge-split `justify-between`)
- Error band in reserved slot (`OP_CONFIRM_ERROR_SLOT`) — no footer jump

---

## Mobile requirements (implemented)

- Bottom sheet only — no `sm:` desktop centering hacks on sheet root
- Full width, rounded top, safe-area bottom padding
- Sheet slide-up animation

---

## Files

| File | Role |
|------|------|
| `components/ui/DestructiveConfirmShell.tsx` | Split desktop vs mobile DOM |
| `lib/ui/useDestructiveConfirmPresentation.ts` | Breakpoint mode |
| `lib/ui/operationalConfirm.ts` | Spacing + centered footer tokens |
| `components/ui/OperationalConfirmDialog.tsx` | Uses `presentation` prop |
| `app/globals.css` | Desktop/sheet entrance animations |

---

## Validation

- `npm run build`
- `npm run qa:governance`
- `npm run deploy:prod`

### Manual desktop certification

- Delete client / project / file — modal centered in **content column**, not hugging right edge
- Long names + large cascade — body scrolls, footer stable
- Pending + error + cancel during pending
- Sidebar expanded vs collapsed — anchor recenters on resize

### Trace

`NEXT_PUBLIC_DLC_DELETE_TRACE=1` → `[dlc-delete]` in console.

---

## Stop line

Phase **18.8F** complete. **No 18.9** work in this pass.
