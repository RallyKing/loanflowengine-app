# Integration architecture policy

**Binding** for external APIs, OAuth-like flows, file importers, and vendor webhooks.

---

## Principles

- **Tenant-scoped credentials** — never global singleton keys for customer data paths unless explicitly platform-level.
- **Clear boundaries** — integration code lives in named modules; no scatter across UI components.
- **Failure modes** — timeouts, partial success, and user-visible errors defined.
- **Backpressure** — queue or schedule heavy sync; don’t block UX.

---

## Pairing

- **`automation-webhook-safety-policy.md`** for delivery semantics.
- **`observability-policy.md`** for integration health.

---

## Related

- `no-shadow-systems-policy.md`
- `state-management-policy.md`
