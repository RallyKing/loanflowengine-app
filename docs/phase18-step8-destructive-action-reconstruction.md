# Phase 18.8 — Destructive Action Experience Reconstruction

**Status:** COMPLETE  
**Scope:** UX refinement and operational safety only — no schema, ACL, mutation, routing, or graph changes.

## Problem

Delete and high-impact actions used cramped `window.confirm` / inline danger-zone copy that felt abrupt and low-confidence, especially on mobile.

## Solution — unified destructive system

| Piece | Role |
|-------|------|
| `components/ui/OperationalConfirmDialog.tsx` | **Only** destructive confirmation UI (desktop modal + mobile bottom sheet) |
| `OperationalConfirmProvider` in `AppChrome` | Global imperative `useOperationalConfirm().confirm()` |
| `lib/ui/operationalConfirm.ts` | Tokens, variants, preview/cascade types |
| `lib/ui/confirmDestructive.ts` | `simpleDeleteConfirm`, `unlinkConfirm`, `revokeAccessConfirm` helpers |

### Information hierarchy

1. **Primary** — title + entity name  
2. **Secondary** — impact copy, entity preview block, “What will happen?” cascade disclosure  
3. **Tertiary** — optional metadata slot (`tertiary` prop)

### Variants

`delete` · `archive` · `revoke` · `unlink` · `remove_collaborator` · `transfer`

### Safety UX

- Cancel separated from destructive zone (spacing + footer layout)  
- Restrained destructive color (`destructive/8` icon chip, soft danger zone border)  
- Typed `DELETE` when cascade risk requires it (hub client/project deletes)  
- `pending` disables confirm + blocks escape close  
- Focus return via `OperationalOverlayShell` + `focusOperationalContainer`

### Migrated surfaces (representative)

- Pipeline hub: client, project, loan file deletes; bulk file delete; file workspace danger zone  
- Contacts, tasks, events (detail + workspace + sharing transfer)  
- Lenders drawer, portal invites, attachments, templates, signatures  
- Org/team settings destructive actions  
- Hierarchy settings panels (client/project)

Primitive `window.confirm` for **destructive** flows removed. Non-destructive confirms (e.g. LenderTable AI enrich) unchanged.

## Validation (2026-05-26)

From `lender-app/`:

- `npm run convex:codegen`
- `npm run build`
- `npm run convex:deploy:prod`
- `npm run qa:governance`
- `npm run deploy:prod` — https://dlcfunds.vercel.app (`dpl_8bEfR9anx4FTS5XNw35uPsbhFmSx`)

**STOP** — Phase 18.9 not started.
