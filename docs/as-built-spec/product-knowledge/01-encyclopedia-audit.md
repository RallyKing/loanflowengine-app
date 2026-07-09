# Phase 1 — Encyclopedia audit

**Date:** 2026-06-22  
**Precedes:** Help mount fixes, content expansion, structured panel UI

---

## Scope

- `lender-app/lib/helpCenterContent.ts` — articles, categories, route tips
- `lender-app/lib/searchHelpArticles.ts`
- `lender-app/components/HelpCenterPanel.tsx`
- `lender-app/components/ContextualQuickTip.tsx`, `HelpHubTrigger.tsx`, `HelpSupportSettingsPanel.tsx`
- `lender-app/components/AppChrome.tsx` — mount points + Classic trigger
- `lender-app/app/settings/SettingsPageClient.tsx` — `helpSupport` section
- `lender-app/lib/product-knowledge/censusArticleMap.ts` — coverage gaps

---

## Current behavior (pre-Phase 1)

| Item | State |
|------|--------|
| Static articles | 12, plain `body: string[]`, 7 categories |
| Help panel | Implemented, **not mounted** |
| Contextual tips | 8 routes, **not mounted** |
| `?` shortcut | Works (opens state only) |
| Help trigger | SaaS `sm+` only; absent Classic |
| Settings `helpSupport` | Registry only; panel not on page |
| Structured sections | None |
| Founder glossary | None |
| Search index | title, summary, body, keywords, category |

---

## Gaps vs target

| Gap | Phase 1 action |
|-----|----------------|
| Panel/tips not mounted | `HelpKnowledgeShellMount` at AppChrome root |
| Classic / mobile help button | Add trigger to Classic header; show on all breakpoints in SaaS |
| Missing settings section | Insert `helpSupport` after getting started |
| Census coverage | Add hub, file workspace, sharing, events, operations articles |
| Structured encyclopedia | Optional `purpose`, `whatYouCanDo`, etc. on articles |
| Founder glossary | `developerGlossary` + admin-only toggle in panel |
| Registry slugs | 13 blocks + 14 nav targets still uncovered (tracked in censusArticleMap) |

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Help overlay on pipeline file route | Fixed `position: fixed`; internal panel scroll only |
| Glossary leaks to users | Render only when `isGlobalAdmin` |
| Breaking `articleById` / tips | Keep existing article IDs; additive fields only |

---

## Audit sign-off

- **Ready to implement:** yes
- **Files read:** helpCenterContent, HelpCenterPanel, AppChrome, SettingsPageClient, censusArticleMap, 00-baseline-audit.md
