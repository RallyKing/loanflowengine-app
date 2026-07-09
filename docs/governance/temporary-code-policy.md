# Temporary code policy

**Binding.** “Temporary” MUST NOT mean “untracked forever.”

---

## Forbidden

- **TODO-driven production hacks** with no owner or deadline.
- **Permanent feature flags** with no removal path.
- **Abandoned fallbacks** that mask real fixes.
- **Undocumented workarounds** in Convex or API routes.

---

## Required for every temporary path

When landing code intended to be short-lived, the PR MUST document:

1. **Expiration condition** — date, metric, or release ID.
2. **Cleanup requirement** — what files/flags remove it.
3. **Migration plan** — how users/data move to the final path.
4. **Removal criteria** — test or flag that proves it can go.

Prefer **code comments** with ticket/ADR ID + link to this policy.

---

## Half-life

If “temporary” exceeds **two release cycles** without removal, it MUST be promoted to **permanent** (with full docs/tests) or **deleted** with migration.

---

## Related

- `feature-completion-policy.md`
- `documentation-sync-policy.md`
