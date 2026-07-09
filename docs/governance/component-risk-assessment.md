# Component risk assessment

**Living assessment** of high-impact components. Update after major edits.

---

## Tier A — architecture-critical

| Component | Concerns | Risk signals | Mitigation |
|-----------|----------|--------------|------------|
| **`PipelineFileWorkspace`** | Blocks, drawer, scroll/sticky, Convex hot paths | Size, rerenders, nested scroll | Extract hooks; virtualize lists; respect shell contracts |
| **`AppChrome`** | Global layout, scroll owner, SaaS vs classic | Padding/scroll regressions | Thin shell; keep policy in docs |
| **`MobileChromeController`** | Compact/focus IO + scroll coupling | Rerender storms | Narrow subscriptions (see Phase 3 external store pattern) |

---

## Tier B — review on touch

- `PipelineFileWorkspaceShell`
- Major route `page.tsx` files with data + layout mixed
- Global search / palette stacks

---

## Review triggers

- File churn > ~300 LOC in one PR without tests
- New `useEffect` chains affecting scroll or layout
- New context providers above `AppChrome`

---

## Related

- `component-architecture-policy.md`
- `performance-budget-policy.md`
