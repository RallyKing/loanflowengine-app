## Phase 18.8E — Delete modal reconstruction (complete)

### Objective

Rebuild destructive confirmation as an **isolated overlay system** — not another token/class patch on `OverlayShell` + `wrapPanel={false}`.

---

## Architecture

```
document.body
└─ DestructiveConfirmShell [data-destructive-confirm-root]  (fixed, isolate, z-modal)
   ├─ scrim
   └─ [data-destructive-confirm-host]  ← SINGLE width + max-height owner
      └─ OP_CONFIRM_PANEL (flex column, h-full, no max-width)
         ├─ header (shrink-0)
         ├─ body (flex-1 min-h-0 overflow-y-auto)  ← only scroll
         └─ footer (shrink-0 min-h-[4.75rem])
            ├─ error band (if any)
            └─ actions (flex, nowrap on md+, all shrink-0 zones)
```

### Width rules

| Breakpoint | Host width |
|------------|------------|
| Desktop / tablet (center) | `w-[min(560px,calc(100vw-32px))] min-w-[420px] max-w-[560px]` |
| Mobile sheet | `w-full` + safe-area bottom padding; `sm:` restores desktop widths when centered |

### Execution trace

`lib/ui/deleteExecutionTrace.ts` phases: `modal_open`, `mutation_start`, `mutation_dispatched`, `mutation_success` / `mutation_failure`, `timeout_triggered`, `cancel_pressed`, `overlay_dismissed`, redirect phases (file).

Enable in production: `NEXT_PUBLIC_DLC_DELETE_TRACE=1`.

### Files changed

- **New:** `components/ui/DestructiveConfirmShell.tsx`
- **Rebuilt:** `lib/ui/operationalConfirm.ts`, `components/ui/OperationalConfirmDialog.tsx`
- **Trace:** `lib/ui/deleteExecutionTrace.ts`, hub/file delete handlers
- **Overflow:** `PipelineHubHierarchyView.tsx`, `PipelinePageClient.tsx` (toolbar clip)

`OperationalConfirmDialog` no longer uses `OperationalOverlayShell` / `OverlayShell` `wrapPanel={false}`.

---

## Validation

| Command | Status |
|---------|--------|
| `npm run build` | Required |
| `npm run qa:governance` | Required |
| `npm run deploy:prod` | Required |

### Manual certification checklist

- Desktop / laptop: modal 420–560px wide; footer buttons full size; long entity names wrap
- Tablet: centered modal, touch targets
- Mobile / PWA: bottom sheet, safe-area, full-width actions
- Cancel during pending (always)
- Failed delete → error in footer, retry works
- Hub client/project delete + file delete + blocked cascade
- Board horizontal scroll on hub

---

## Stop line

Phase **18.8E** complete. **Do not** start 18.9 in this pass.
