# Test suite restoration

## Failure

`tests/visual/mobile-shell.spec.ts` imported:

```ts
from "../../helpers/workspace-auth";
```

From `tests/visual/`, `../..` resolves to `lender-app/` root, so **no** `helpers/workspace-auth` module existed → TypeScript **TS2307**.

## Fix

Use correct relative path to shared Playwright helpers:

```ts
from "../helpers/workspace-auth";
```

**File:** `lender-app/tests/visual/mobile-shell.spec.ts`

## Verification

```bash
cd lender-app && npx tsc --noEmit
```

**Result:** **exit code 0** (full project typecheck).

## Assertions / skips

- **No** `test.skip` added.
- **No** assertions disabled.
- Existing `beforeEach` still skips when `workspaceSessionReady()` is false (missing `APP_AUTH_USERNAME` / `APP_AUTH_PASSWORD`) — that is **intentional** env gating, not a disabled test.

## Regression test hardening

`tests/regression/regression-protection.spec.ts` — health check now sends **`Accept: application/json`** and asserts **`content-type`** contains **`application/json`** before `res.json()`, so a misconfigured **`PW_BASE_URL`** (returning an HTML document) surfaces as a clear assertion failure instead of `Unexpected token '<'`.

## Env note

`playwright.config.cjs` loads `.env.local`. If **`PW_BASE_URL`** points at a non–lender-app origin, offline integration tests may fail. For local **`next start`** fixtures (port **3005** default), leave **`PW_BASE_URL`** unset unless intentionally testing a remote deployment.

