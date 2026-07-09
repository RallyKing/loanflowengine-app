# Executive summary — system architecture & data posture

**Scope:** Application under `lender-app/` (Next.js + Convex), as traced in [system-data-mindmap.md](./system-data-mindmap.md) and the interactive [system-data-mindmap.html](./system-data-mindmap.html).

**Date note:** Scores are qualitative engineering judgments based on schema and auth/org resolution code—not a formal audit against production metrics.

---

## Scores (0–10)

| Dimension | Score | Rationale |
|-----------|------:|-----------|
| **Overall architecture** | **7** | Clear split: Next.js for session gate + Convex for data. Modular Convex modules; some legacy dual-paths remain (`accountId` vs `userKey`, optional org scope). |
| **Data integrity** | **6** | Many FKs are explicit in Convex schema; optional `organizationId` and legacy global rows increase risk of tenant ambiguity; `intakeSheets` lacks direct org key. |
| **Auth isolation** | **6** | Native auth tables (`authUsers`, `authSessions`) are clear; Convex identity falls back to `memberUserKey` or deployment env when JWT absent—correct for current design but easy to misconfigure across environments. |
| **Migration readiness** | **6** | Consolidation tooling exists (`mergeAuthUsersByEmail`, `finalizePrimaryNativeOwnership`, `dataMigration.*`); string-scoped preference rows and duplicate identity keys still require discipline during migrations. |
| **Scalability** | **7** | Convex indexes and search indexes on hot paths (`lenders`, `pipeline`, CRM); large list pages need continued virtualization/lazy patterns (already a product concern in rules). |
| **Technical debt** | **5** | Legacy Clerk field on `organizations`, string `assigneeId` / `sharedWithIds`, `ownerName` on intake vs org ids, parallel onboarding on `userOnboarding` + `userPreferences`. |

---

## Critical structural weaknesses

1. **Two parallel “user keys”** — Browser `localStorage` account UUID vs authenticated `userKey` from session; `useActorUserKey` bridges them. Misalignment after auth changes can orphan preferences or membership checks.
2. **Optional organization scope on core entities** — Intentional for legacy migration, but increases complexity in every guard (`organizationAccess` default for unset org).
3. **Intake sheets not org-scoped in schema** — Tenant boundary for legacy intake-only flows depends on `pipeline` linkage.
4. **Environment-coupled Convex identity** — `APP_AUTH_USER_KEY` / org on Convex must stay aligned with real login users for any tooling that relies on `platformUserKeyFallback()`.

---

## Recommended refactor priorities (ordered)

1. **Canonical identity policy** — Document and enforce one string id for `userKey`, `accountId`, and `organizationMembers.userKey` for all signed-in users; migrate stray UUID preference rows when needed.
2. **Org scoping decision for `intakeSheets`** — Add optional `organizationId` + backfill from pipeline, or explicitly mark all intake as global/legacy-only.
3. **Schema deprecation passes** — Remove `clerkOrganizationId` and other vendor artifacts after data validation.
4. **Formalize assignment IDs** — Replace free-form strings on `pipeline` / `tasks` with `authUsers` ids (or a typed union) once multi-user UX is stable.

---

## Suggested “healthy system” checks

- `npm run build` in `lender-app/`
- Convex: spot-check `dataMigration.integrityAudit` / org integrity helpers after structural changes
- Manual: login, switch org (if applicable), pipeline + tasks + contacts + lenders load without permission errors

---

_Detail: [system-data-mindmap.md](./system-data-mindmap.md) · Visual: [system-data-mindmap.html](./system-data-mindmap.html)_
