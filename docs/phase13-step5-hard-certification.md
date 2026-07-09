# Phase 13.3 Step 5 — Hard certification

**Production:** https://dlcfunds.vercel.app  
**Result:** **PASS**  
**Generated:** 2026-05-25T15:21:38.043Z

## Pass/fail matrix

| Check | Pass |
|-------|------|
| validation.codegen-build-deploy-auth | yes |
| convex.hierarchyHardCertification | yes |
| browser.playwrightJoshua | yes |
| acl.eballardConvexProof | yes |

## Convex proof (Joshua + eballard ACL)

- Hierarchy integrity: all org loans FK-linked; `project.clientId` matches; owners present; resource shares preserved.
- Joshua drift: baseline file visibility and access levels unchanged after certification mutations.
- eballard: project-share path only — view banner gray, edit green, revoke removes access; label **Inherited from Project**.

## Browser proof (Joshua @ production)

- Hub expand/collapse + localStorage persistence
- Create client + project + loan (live, no refresh)
- ⌘K grouped search + workspace breadcrumb + hub deep link
- Board columns grouped by client/project
- Hub idle 5 min: ≤2 writes
- Hub subscriptions within budget (no duplicate polling)

## Validation run (session)

`npm run convex:codegen` · `npm run build` · `npm run convex:deploy:prod` · `npm run deploy:prod` · `npm run auth:validate` — all passed.

## STOP

Certification complete. Await operator review. Do not begin Phase 14.

