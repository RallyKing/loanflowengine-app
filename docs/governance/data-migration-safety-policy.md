# Data migration safety policy

**Binding** for schema, Convex functions, and bulk data transforms touching **contacts, lenders, pipeline/files, workflows, automations, webhooks**, or org-scoped entities.

---

## No destructive change without

1. **Migration strategy** — forward steps, batching, downtime assumptions.
2. **Rollback strategy** — how to revert or restore; feature flags if needed.
3. **Compatibility layer** — old readers still work during transition OR explicit cutover window documented.
4. **Validation scripts** — counts, checksums, spot checks, `npm`/Convex dry runs where applicable.
5. **Production safety verification** — staged deploy order (Convex vs Vercel), smoke checklist.

---

## Defaults

- Prefer **additive** columns/tables and **backfill** jobs.
- Never **silently overwrite** user-visible production fields; preserve history where the product promises it (`project-intelligence-summary.md`).
- **Idempotent** migrations: safe to re-run or resume.

---

## Related

- `tenant-isolation-policy.md`
- `automation-webhook-safety-policy.md`
- `production-deployment-policy.md`
