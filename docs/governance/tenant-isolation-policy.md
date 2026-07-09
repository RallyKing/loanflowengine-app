# Tenant isolation policy

**Binding.** The platform is multi-tenant oriented; data leaks are severity-zero issues.

---

## MUST

- **Scope queries & mutations** to org/account context enforced server-side (Convex validators + indexes).
- **Scope automations, webhooks, searches, notifications** the same way.
- **Validate org membership** before returning another tenant’s IDs.
- **Integration connectors** store tokens and replay requests per tenant boundary.

---

## MUST NOT

- Trust client-only filters for authorization.
- Expose internal IDs cross-tenant in logs or webhook payloads without purpose and scrubbing policy.

---

## Audits

- Add regression tests when fixing isolation bugs (`tests/regression/tenant-isolation.spec.ts` pattern).
- Review new “global admin” or “demo” paths explicitly.

---

## Related

- `data-migration-safety-policy.md`
- `automation-webhook-safety-policy.md`
- `canonical-system-map.md`
