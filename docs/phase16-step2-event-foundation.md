# Phase 16 Step 2 — Event system schema foundation

**Status:** Schema + proof harness shipped — **awaiting production deploy + cert run**  
**Date:** 2026-05-25  
**Evidence:** `migration-reports/phase16-step2-event-foundation.json`  
**Prior:** `docs/phase16-step1-event-architecture-audit.md`

---

## Summary

Additive Convex schema for the **owner-scoped Events** domain. All visibility remains **owner + explicit `resourceShares` only** — no org-wide lists, no hierarchy inheritance, no `sharedWithIds`.

### New tables

| Table | Purpose |
|-------|---------|
| `events` | Event shell (calendar, lifecycle, counts) |
| `eventSections` | Collapsible sections (`collapsedByDefault`, `iconKey`, `sortOrder`) |
| `eventSectionItems` | Normalized items (checkbox, dates, assignee, recurrence, lineage) |
| `eventIdeas` | Pre-event ideas inbox |
| `eventInvitations` | Pre-event invitations inbox |
| `eventTemplates` | Reusable templates |
| `eventTemplateSections` / `eventTemplateItems` | Template structure |
| `eventCollaborators` | Role projection keyed to `resourceShares` (not a second ACL) |
| `eventPrintProfiles` | Print preset metadata (no renderer in Step 2) |
| `eventItemAttachments` / `eventItemLinks` | Normalized attachment/link rows |
| `eventItemActivity` | Append-only item audit |
| `eventConversionHistory` | Idea/invitation/template → event lineage |
| `eventItemTaskLinks` | Future task bridge |
| `eventRelations` | Future graph links (**no visibility grant**) |

### ACL extension

`resourceShares` now supports:

- **resourceType:** `event`, `event_idea`, `event_invitation`, `event_template` (additive union)
- **collaboratorRole:** `co_owner` \| `editor` \| `viewer` (optional; canonical role — do not overload `permission` alone)

Pairing rule:

| collaboratorRole | permission |
|--------------------|------------|
| `viewer` | `view` |
| `editor` | `edit` |
| `co_owner` | `edit` |

`eventCollaborators` rows are written when sharing an **event** and always reference `resourceShareId`. Visibility checks still read **`resourceShares`**.

---

## Code map

| Path | Role |
|------|------|
| `convex/schema.ts` | Table definitions + index strategy |
| `convex/events/eventValidators.ts` | Shared validators |
| `convex/events/eventAccess.ts` | Owner-scoped filter + share upsert/remove |
| `convex/events/eventFoundationImpl.ts` | Shell/convert/clone helpers (proof + Step 4+) |
| `convex/operator/eventFoundationStep16_2.ts` | Production proof mutation |
| `convex/resourceAccess.ts` | Extended `ResourceType` + `collaboratorRole` on upsert |
| `scripts/run-phase16-step2-event-foundation.ts` | Cert runner |

---

## Proof harness

```bash
cd lender-app
npm run cert:phase16-2-event-foundation
```

Convex mutation: `operator/eventFoundationStep16_2:runEventFoundationProof`

| Step | Asserts |
|------|---------|
| Owner-only visibility | Secondary org member sees 0 events until share |
| Share + co_owner | `collaboratorRole === co_owner`, `eventCollaborators` row exists |
| Shared list visibility | Secondary sees shared event in filtered list |
| Template clone | Sections + items copied from template |
| Idea conversion | `eventConversionHistory` + stub `converted` |
| Invitation conversion | Lineage row + target event |
| Section/item integrity | Item row + `eventItemLinks` row |
| Zero org leakage | Secondary reads only explicitly shared proof event |
| Revoke | Access returns `none` after share removal |

Proof rows use title prefix `Phase16Step2 Foundation` and are **deleted** at end of run.

---

## Validation chain (operator)

From `lender-app/`:

```bash
npm run convex:codegen
npm run build
npm run convex:deploy:prod
npm run deploy:prod
npm run auth:validate
npm run cert:phase16-2-event-foundation
```

> **Note:** Automated deploy/cert could not run in the documentation session when Convex CLI reported project access denied. Run the chain locally with your linked Convex + Vercel credentials.

---

## Explicit non-goals (STOP)

- Step 3+ sharing UI / product routes
- Calendar UI
- Print rendering
- Automation
- Task promote UI

---

## STOP gate

**Do not start Step 3** until operator reviews this foundation report and production cert JSON shows `"pass": true`.
