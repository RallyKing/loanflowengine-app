# Phase 15 Step 14.7 — Hub delete certification

**Date:** 2026-05-26  
**Production:** https://dlcfunds.vercel.app  
**Convex:** https://basic-anaconda-984.convex.cloud

## Executive summary

| Item | Result |
|------|--------|
| Root cause | `await import("./orgMembership")` inside `viewerIsOrgAdminOrOwner` (`resourceAccess.ts`) |
| Why 14.6 failed | Scoped audit to `hierarchyCrudMutations.ts` only; missed transitive ACL module |
| Fix | Static top-level import; zero `await import(` in `convex/` |
| Dynamic imports in delete tree | **Eliminated** (source grep proof) |
| Deploy | https://dlcfunds.vercel.app (`dpl_AnArAiD11Qx36vmzmNcrHsCBF8T8`) |

## Root cause detail

Convex server functions run in a V8 isolate that **does not support dynamic `import()`**. The only dynamic import under `convex/` was:

```typescript
// resourceAccess.ts — viewerIsOrgAdminOrOwner (BEFORE 14.7)
const { pickCanonicalOrgMember } = await import("./orgMembership");
```

Invoked from:

- `pipelineFileCanDelete` → `getHubClientDeleteStatus` / `getHubProjectDeleteStatus` (UI subscription)
- `assertCanDeletePipelineRow` → nuclear legacy file delete loop
- `assertCanDeleteOrReassignHierarchyEntity` → record cascade deletes

`orgMembership.ts` has **no** import of `resourceAccess.ts` — circular dependency was not required; static import is safe.

## Import chain (condensed)

```
UI HubHierarchyRowActions
  → getHub*DeleteStatus → pipelineFileCanDelete → viewerIsOrgAdminOrOwner → [DYNAMIC import] orgMembership
  → deleteHub* → hardWipe | nuclear | record → assertCanDelete* → viewerIsOrgAdminOrOwner → [DYNAMIC import]
```

See full trace: `docs/phase15-step14-7-delete-trace.md`.

## Proof: dynamic imports eliminated

```bash
# From lender-app/
rg "await import\(" convex/
# Post-14.7: no matches
```

## Prod delete matrix

| Entity | Mutation | Status query | Pre-14.7 error | Post-14.7 |
|--------|----------|--------------|----------------|-----------|
| rtest client | `hierarchyCrudMutations:deleteHubClient` | `getHubClientDeleteStatus` | `dynamic module import unsupported` | Expected OK |
| rtest project | `deleteHubProject` | `getHubProjectDeleteStatus` | same | Expected OK |
| Test project | `deleteHubProject` | `getHubProjectDeleteStatus` | same | Expected OK |
| Test client (if present) | `deleteHubClient` | `getHubClientDeleteStatus` | same | Expected OK |

**Note:** Convex request IDs are per-invocation in the Convex dashboard logs (filter function name `deleteHubClient` / `getHubClientDeleteStatus`). Agent session did not capture live request IDs pre-fix; post-deploy verification is manual on prod.

## Disposable probe certification (Joshua)

Create hub-visible rows (any method that produces hub keys):

| Label | Suggested display | Delete via |
|-------|-------------------|------------|
| `DELETE_PROBE_CLIENT` | DELETE_PROBE_CLIENT | Client row trash → `DELETE` |
| `DELETE_PROBE_PROJECT` | DELETE_PROBE_PROJECT | Project row trash → `DELETE` |

### Pass criteria

- [ ] Confirmation modal opens without error
- [ ] Cascade warning shows when nested loans exist
- [ ] Confirm completes without modal crash
- [ ] No browser console error
- [ ] No Convex execution error in modal
- [ ] Row disappears immediately
- [ ] Hard refresh — row stays gone
- [ ] No unintended hub drift for other clients/projects

## Joshua zero-drift proof

14.7 changes are limited to:

1. ACL helper static import (behavior-preserving)
2. Status-query early return for hard-wipe keys (permission UI only)

No schema changes. No hub tree builder changes. No unrelated route or layout changes.

## Validation commands

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | Pass |
| `npm run build` | Pass |
| `npm run convex:deploy:prod` | Pass → `basic-anaconda-984` |
| `npm run deploy:prod` | Pass → `dpl_AnArAiD11Qx36vmzmNcrHsCBF8T8` |
| `npm run auth:validate` | Pass — `ALL_CHECKS_PASSED` on https://dlcfunds.vercel.app |
| `rg "await import\\(" convex/` | **0 matches** (post-fix) |

## STOP

Do not proceed to Phase 16 until Joshua confirms prod delete on **rtest**, **Test**, and probe rows.
