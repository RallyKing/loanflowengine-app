# Live runtime validation

**Date:** 2026-05-09 (stabilization pass)  
**Environment:** Windows, `lender-app/` local dev server on port **3004** (brief smoke only).

## Tooling executed

| command | result |
|---------|--------|
| `npm install` | OK (up to date) |
| `npm run lint` | OK (existing `react-hooks/exhaustive-deps` warnings only) |
| `npm run build` | OK |
| `npx tsc --noEmit` | OK (after mobile-shell import fix) |
| `npm run dev:next` | OK — Next reported Ready |
| `npx convex deploy -y --typecheck disable` | OK — push to configured deployment |

**Not left running:** `npx convex dev` (full interactive dev loop). Production backend was updated via **`convex deploy`** instead. For day-to-day local Convex, run `npm run dev` (Next + Convex) as documented in `package.json`.

## Automated HTTP smoke

| route | pass/fail | notes |
|-------|-----------|--------|
| `GET http://127.0.0.1:3004/system/health` | **Pass** | HTTP **200**; JSON `status: "ok"` |

## Authenticated UX matrix (manual / Playwright)

The following require a **running app + Convex** and a **real or E2E account**. They were **not** fully executed in this headless agent session (no browser session with your production credentials). Use this table as the **sign-off checklist**.

| Area | route / surface | pass/fail | console / network |
|------|-----------------|-----------|-------------------|
| Login | `/sign-in`, `/api/auth/login` | **Pending manual** | Expect no `[object Object] is not a functionReference` after `useQuery_experimental` fix |
| Session hydration | post-login app shell | **Pending manual** | Watch for hydration mismatch warnings |
| Organization resolution | `useOrgPermissions` consumers | **Pending manual** | `effectivePermissions` subscription should be active |
| effectivePermissions | any settings / gated UI | **Pending manual** | Prior bug was wrong hook overload — fixed in code |
| Task drawer | `/tasks`, open drawer | **Pending manual** | Attachment counts use `useQuery_experimental` |
| Task attachments | task file list | **Pending manual** | Same |
| Pipeline workspace | `/pipeline`, open file | **Pending manual** | `usePipelineFileWorkspaceData` attachment counts |
| Organization settings | `/settings` → org panel | **Pending manual** | |
| Mobile / tablet layouts | resize + visual project | **Pending manual** | See `responsive-system-validation.md` |
| Responsive navigation | sidebar / rail | **Pending manual** | |
| Auth guards | unauthenticated → gated routes | **Pending manual** | |
| Logout | `/api/auth/logout` + UI | **Pending manual** | |
| Session refresh | reload mid-session | **Pending manual** | |
| Org switching | tenant switcher / stored org id | **Pending manual** | |
| Permission boundaries | `PermissionBoundary` / RBAC | **Pending manual** | |

## Automated Playwright (HTTP integration)

Command (local `next start` on **3005** via Playwright `webServer`; **`PW_BASE_URL` unset** so `.env.local` does not point tests at a foreign host):

```bash
cd lender-app
npx playwright test tests/regression/regression-protection.spec.ts --project=chromium
npx playwright test tests/regression/regression-protection.spec.ts --project="Mobile Chrome"
```

| suite | project | result |
|-------|---------|--------|
| `regression-protection.spec.ts` | chromium | **3 passed** |
| `regression-protection.spec.ts` | Mobile Chrome | **3 passed** |

**Note:** If `PW_BASE_URL` in `.env.local` targets a host that returns HTML for `/system/health`, the health test fails with a JSON parse error. The spec now asserts **`content-type` includes `application/json`** first for a clearer failure. For default local runs, leave **`PW_BASE_URL`** empty or set it to this app’s origin only.


## Convex subscription failures

- No client subscriptions were exercised in the automated slice. Deploy logs showed schema/index updates applied successfully on the target cloud deployment.

## Hydration / auth state

- Not tested end-to-end here. Recommend one manual pass after deploy with DevTools open.

## Follow-up command (full local stack)

```bash
cd lender-app && npm run dev
```

Then complete the manual matrix above and attach screenshots or Playwright reports to this doc if needed for audit trail.
