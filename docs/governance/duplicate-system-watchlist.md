# Duplicate system watchlist

**Living document.** List *known* areas where duplication risk is high. Update when adding adjacent features.

---

## Watchlist (do not fork without ADR)

| Area | Why it’s sensitive | Before adding parallel code |
|------|-------------------|------------------------------|
| **Contacts** | Legacy embedded vs link table | Read `contacts` + pipeline joins; extend `contactFileLinks` |
| **Lenders** | Org vs global catalog | Use existing org scoping patterns |
| **Pipeline blocks** | Second drawer system | Extend `pipelineBlockRegistry` |
| **Scroll containers** | CLS + mobile break | Reuse `<main>`; documented exceptions only |
| **Task UI** | Second task backend | Extend tasks schema/mutations |
| **Webhooks / automations** | Double delivery paths | Reuse enqueue + idempotent handlers |
| **Shared deal fields** | Numeric drift across blocks | Use `fileSharedState` / normalization helpers |
| **AI lender discovery** | Second crawl stack | Extend `convex/discovery.ts` with flags |

---

## Process

1. Search codebase + this list.
2. If duplication is unavoidable, add a row with **rationale** and **convergence plan**.

---

## Related

- `no-shadow-systems-policy.md`
- `canonical-system-map.md`
