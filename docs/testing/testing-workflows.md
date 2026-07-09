# Testing workflows & agent map

Each “agent” is a **persona + scenario bundle** (not a separate runtime). Implement flows in `lender-app/tests/workflows/` and drive them from specs.

| Agent | Persona(s) | Primary specs / areas |
|-------|------------|------------------------|
| Pipeline | `org_owner`, `loan_officer` | `tests/e2e/pipeline-*.spec.ts`, `workflows/pipeline-workflows.ts` |
| Contacts | `team_member`, `referral_partner` | Contacts page, `convex/testingSeed` links |
| Tasks | `processor` | `tests/e2e/tasks-drawer.spec.ts` |
| Lender | `lender_rep` | Lenders browse, scenario match (extend) |
| Client Portal | `client_portal` | `/portal/login`, grants from seed |
| Referral Partner | `referral_partner` | Shares, file visibility |
| Mobile UX | any | `tests/mobile/`, `tests/e2e/pipeline-scroll.spec.ts` |
| Automation | `org_owner` | `userSimpleWorkflows`, webhooks (extend) |

## Core flows checklist (roadmap)

The repository ships an initial subset; expand coverage incrementally:

1. Create new file — extend pipeline specs
2. Associate multiple contacts — seed + CRM specs
3. Attach referral partner — seeded `contactFileLinks`
4. Add lenders — drawer / browse specs
5. Scenario match — extend lender scenario tests
6. Create tasks — tasks drawer + task hub
7. Snooze file — pipeline table actions
8. Archive / unarchive — pipeline mutations
9. Portal invite — `clientPortalAdmin` flows
10. Open task drawer — `tasks-drawer.spec.ts`
11–14. Mobile scroll, sticky chrome, block collapse/reorder — layout specs
15–16. Shared data / overrides — funding sync spec + file shared state UI
17–18. Automation + webhooks — integrations + Convex jobs (extend)
19–20. Permissions + org isolation — `tests/regression/tenant-isolation.spec.ts`

## Running a persona

```ts
import { signInWithTestPersona } from "../helpers/workspace-auth";
await signInWithTestPersona(page, "org_owner");
```

Requires `APP_AUTH_E2E_USERS_ENABLED=true`, matching `E2E_PASS_*`, and org ids from `seed:test-data`.
