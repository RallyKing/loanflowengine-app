# Feature completion policy

**Binding definition of “done.”** A feature is **NOT** complete until all applicable boxes below are satisfied.

---

## Product quality

| Gate | Requirement |
|------|-------------|
| Desktop | Validated on Chromium-class desktop layout |
| Mobile | **Mandatory** for UI/layout/scroll/sticky/drawer/responsive — iPhone + Android class (`docs/mobile-testing-rules.md`) |
| Tablet | iPad class or responsive manual when layout differs |
| Loading | Explicit loading UX; no blank mystery states |
| Empty | Explicit empty state or intentional omission documented |
| Error | User-safe errors; retry where appropriate |
| Permissions | Org/role gates match backend enforcement |
| Accessibility | Keyboard + focus + reduced motion (`accessibility-policy.md`) |
| Performance | No obvious jank; lists virtualized if large (`performance-budget-policy.md`) |
| Production smoke | After ship: login, pipeline, tasks, contacts, lenders, mobile scroll |

---

## Automation

- **`npm run qa:governance`** from `lender-app/` for user-facing merges unless explicitly exempt (`docs/testing/governance-qa-checklist.md`).
- **`npm run deploy:prod`** when the change should be live (CLI Vercel).

When the change reads or writes Convex: also **`resource-consumption-policy.md` §D** (load-check) and **`convex-reactivity-policy.md` §6** (architectural validation on a **dev** backend — never production).

---

## Checklist artifact

Printable / PR template: **`feature-completion-checklist.md`**.

---

## Related

- `production-deployment-policy.md`
- `ai-governance-policy.md`
- `resource-consumption-policy.md`
- `convex-reactivity-policy.md`
