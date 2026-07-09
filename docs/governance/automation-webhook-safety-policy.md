# Automation & webhook safety policy

**Binding** for `userSimpleWorkflows`, outbound webhooks, scheduled jobs, integration workers, and HTTP actions.

---

## MUST properties

| Property | Requirement |
|----------|-------------|
| **Idempotent** | Re-delivery or double-click does not corrupt data; use idempotency keys or compare-and-set where needed. |
| **Retry-safe** | Retries backoff; failures surface in logs/metrics; poison messages don’t spin forever. |
| **Loop-safe** | Trigger graphs cannot self-trigger unbounded loops without explicit guardrails. |
| **Observable** | Structured logs + error classification; see `observability-policy.md`. |
| **Rate limited** | Protect Convex, third parties, and tenants from stampedes. |
| **Tenant-scoped** | Org/account context validated on every path; see `tenant-isolation-policy.md`. |

---

## Design checklist

- Define **event schema** and **delivery semantics** (at-least-once vs exactly once).
- Define **failure UX** — who sees errors (admin vs silent).
- Webhook payloads MUST NOT leak cross-tenant identifiers.

---

## Related

- `integration-architecture-policy.md`
- `observability-map.md`
