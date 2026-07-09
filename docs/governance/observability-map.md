# Observability map

**Where we expect visibility today vs roadmap.**

---

## Client

| System | Logs / diagnostics | Error boundary | Notes |
|--------|-------------------|----------------|-------|
| **App shell** | Console only (dev) | `PageErrorBoundary` | No PII in logs |
| **Convex client** | Network errors surface in UI | Boundary + retry affordances | |

---

## Server (Convex / HTTP)

| System | Expected | Gap handling |
|--------|----------|--------------|
| **Webhooks outbound** | Retry + failure records | Surface operator UI as product matures |
| **Automations** | Execution trace | Expand per `automation-webhook-safety-policy.md` |
| **Auth/session** | Structured 4xx/5xx | Never log secrets |

---

## Deployments

- **Vercel** — deployment logs, runtime logs.
- **Convex** — dashboard logs for functions.

---

## Related

- `observability-policy.md`
- `production-deployment-policy.md`
