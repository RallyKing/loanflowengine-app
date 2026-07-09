# Observability and debugging architecture

This document describes how **Direct Lending Connection** implements structured logging, request correlation, auth/org/permission tracing, health endpoints, and production-safe debug surfaces.

## Design principles

1. **Structured logs** — One JSON object per line, prefixed with `DLC_OBS`, suitable for Vercel, CloudWatch, Datadog, or `jq` in development.
2. **Correlation** — Every browser navigation and API request gets `x-request-id` (and `x-correlation-id`, defaulting equal) from **middleware**; values are copied onto the **internal request** so Route Handlers and RSC can read them via `headers()`.
3. **Redaction by default** — Helpers in `lib/observability/redact.ts` strip passwords, tokens, and cookies from payloads before logging or storing replay rows.
4. **Safe production debug** — Extended JSON diagnostics require **`DLC_SAFE_DEBUG=1`** in production **or** the header **`x-dlc-debug-secret`** matching **`DLC_OBSERVABILITY_DEBUG_SECRET`**. Otherwise debug URLs return **404** (avoid enumeration).
5. **Convex is a separate runtime** — Server traces use `ORG_PERM_TRACE` / `ORG_PERM_FAIL` (existing). Link browser → Convex by passing optional **`clientTraceId`** on `organizations.effectivePermissions`.

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `DLC_SAFE_DEBUG` | Vercel / Node | `1` allows `/system/debug/*` and `/api/observability/*` (non-metrics) responses in **production** when combined with normal app auth where applicable. |
| `DLC_OBSERVABILITY_DEBUG_SECRET` | Vercel / Node | Shared secret; send as `x-dlc-debug-secret` to unlock debug routes in prod without `DLC_SAFE_DEBUG`. |
| `DLC_FAILURE_REPLAY` | Vercel / Node | `1` enables in-memory **failure replay** capture in production (bounded buffer); otherwise replay only in non-production. |
| `DLC_TELEMETRY_WEBHOOK_URL` | Vercel / Node | Optional POST target for `emitTelemetryHook` (future / manual calls). |
| `ORG_PERM_TELEMETRY` | **Convex** | `1` enables `ORG_PERM_TRACE` lines in Convex logs (permission resolution steps). |
| `ORG_INTEGRITY_TELEMETRY` | **Convex** | `1` enables `ORG_INTEGRITY_TRACE`. |

## HTTP headers

| Header | Set by | Meaning |
|--------|--------|---------|
| `x-request-id` | Middleware (or client/proxy) | Per-request id; echoed on responses. |
| `x-correlation-id` | Middleware | Logical trace root (defaults to request id). |
| `x-dlc-client-trace-id` | Optional (API clients) | Tab-scoped id; can align with `clientTraceId` in Convex args. |
| `x-dlc-debug-secret` | Support tooling | Unlocks production debug when env is set. |

## Code map

| Area | Location |
|------|----------|
| Structured logger | `lender-app/lib/observability/logger.ts` |
| Correlation constants | `lender-app/lib/observability/constants.ts` |
| Request context (App Router) | `lender-app/lib/observability/serverContext.ts` |
| Redaction | `lender-app/lib/observability/redact.ts` |
| Debug gating | `lender-app/lib/observability/debugGate.ts` |
| Server debug snapshot | `lender-app/lib/observability/debugSnapshot.ts` |
| Client trace id (sessionStorage) | `lender-app/lib/observability/clientTraceId.ts` |
| Failure replay buffer | `lender-app/lib/observability/failureReplayStore.ts` |
| Telemetry webhook helper | `lender-app/lib/observability/telemetryHooks.ts` |
| Middleware (auth + ids) | `lender-app/middleware.ts` |
| Process bootstrap log | `lender-app/instrumentation.ts` |

## Routes

### Public

- **`GET /system/health`** — Liveness JSON (`status`, `timestamp`, `requestId`, `build`, `uptimeSeconds`). No secrets; safe for probes.
- **`GET /api/observability/metrics`** — Minimal **Prometheus-style** text (`dlc_app_up`, `dlc_app_uptime_seconds`). No tenant data.

### Authenticated app routes + debug gate

Session is enforced by **middleware** (cookie). **`canAccessObservabilityDebug`** must also pass for JSON that goes beyond public health:

- **`GET /system/debug/auth`** — Session diagnostics (redacted viewer hints, tracing ids).
- **`GET /system/debug/orgs`** — Org resolution visible on the server (host cookie, session org); documents client-only `localStorage` step.
- **`GET|POST|DELETE /api/observability/replay`** — Bounded failure replay buffer (redacted POST bodies).
- **`POST /api/observability/snapshot`** — Merge **client-supplied** JSON (redacted) with server snapshot for support bundles.

## Auth tracing

- **Middleware** emits `DLC_OBS` lines for `auth.middleware` (`outcome`: `public` | `redirect_login` | `ok`, `pathname`, `sessionState`, no cookie contents).
- **`POST /api/auth/login`** emits `auth.login` with outcomes such as `validation`, `csrf_rejected`, `rate_limited`, `invalid_credentials`, `success_internal`, `server_error` — **never** logs passwords or raw tokens.

## Org resolution tracing

- **Server-visible**: host-mapped cookie `lender_host_org` (see `middleware.ts` + `hostOrgCookie.ts`), session viewer `organizationId` (redacted in debug JSON).
- **Client-only**: `lender.activeOrganizationId` in `localStorage` — described in `/system/debug/orgs`; use DevTools or org switcher logs.

## Permission evaluation tracing

- **Convex** `resolveEffectivePermissionStrings` already emits **`ORG_PERM_TRACE`** when `ORG_PERM_TELEMETRY=1`.
- **`assertOrgPermission`** now emits trace stages `assertOrgPermission.notMember` and `assertOrgPermission.denied` under the same flag (no-op when flag off).
- **Browser → Convex**: `useEffectivePermissionsQuery` passes **`clientTraceId`** from `getOrCreateClientTraceId()` into `effectivePermissions`; Convex echoes it on the entry trace line for cross-layer search.

## Failure replay tooling

- **POST** `/api/observability/replay` with JSON `{ "source": "...", "errorCode?", "summary?", "payload?" }` — payload passed through **`redactDeep`** before storage.
- **GET** lists recent rows; **DELETE** clears. Storage is **in-memory** (process-local); suitable for staging / short-lived debugging, not long-term audit. For durable replay, export logs to your sink or add a Convex table in a follow-up.

## Telemetry dashboard hooks

- `emitTelemetryHook(event, payload)` in `telemetryHooks.ts` logs at debug level and optionally POSTs to `DLC_TELEMETRY_WEBHOOK_URL`. Call from critical paths as you instrument further (login already uses `obsLog` directly for lower latency).

## Console stripping (Next.js)

Production builds use `compiler.removeConsole` with **`console.info` excluded** so `DLC_OBS` structured lines (`obsLog` info path) still reach stdout.

## Operational checklist

1. Confirm **`GET /system/health`** is allowed by your CDN and returns `200`.
2. Configure log drain to parse **`DLC_OBS`** JSON lines.
3. Enable **`ORG_PERM_TELEMETRY=1`** on Convex during investigations; disable after.
4. Use **`clientTraceId`** in Convex logs + **`x-request-id`** in Vercel logs to trace a single user action.
5. Never enable **`DLC_SAFE_DEBUG`** globally without restricting IP or pairing with secrets.

---

*Extend this doc as you wire third-party APM (OpenTelemetry, etc.) or durable replay stores.*
