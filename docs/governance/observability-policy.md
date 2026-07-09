# Observability policy

**Binding** for production-critical paths: auth, payments (if any), webhooks, automation, Convex actions, and destructive mutations.

---

## MUST exist for critical systems

- **Structured logs** — actionable messages; include org/file/user identifiers where tenant-safe.
- **Error boundaries** — React boundaries on major surfaces; graceful degradation.
- **Failure visibility** — webhook/automation failures surfaced to operators (dashboard, logs, or alerts roadmap).
- **Retry metrics** — count failures/retries for outbound HTTP and scheduled jobs.
- **Deployment visibility** — Vercel/Convex deploy recorded; smoke checklist after prod (`production-deployment-policy.md`).

---

## MUST NOT

- Swallow errors silently in production handlers.
- Log **secrets** or full PII payloads.

---

## Maps & inventory

See **`observability-map.md`** for system-by-system expectations.

---

## Related

- `automation-webhook-safety-policy.md`
- `feature-completion-policy.md`
