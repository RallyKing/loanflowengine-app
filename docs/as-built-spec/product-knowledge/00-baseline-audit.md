# Phase 0B — Product Knowledge baseline audit

**Date:** 2026-06-22  
**Purpose:** Read-only inventory of the current help, onboarding, header chrome, operational notifications, registries, and governance constraints before any Product Knowledge System implementation.

---

## Scope

### In scope

| Area | Primary files |
|------|----------------|
| Help shell | `lender-app/components/HelpCenterPanel.tsx`, `lender-app/lib/helpSupportContext.tsx`, `lender-app/components/HelpHubTrigger.tsx`, `lender-app/lib/helpCenterContent.ts`, `lender-app/lib/searchHelpArticles.ts` |
| Contextual tips | `lender-app/components/ContextualQuickTip.tsx`, `QUICK_ROUTE_TIPS` in `helpCenterContent.ts` |
| Header chrome | `lender-app/components/AppChrome.tsx` |
| Operational notifications | `lender-app/components/UserNotificationsBell.tsx`, `lender-app/convex/notifications.ts`, `userNotifications` in `lender-app/convex/schema.ts` |
| Onboarding overlap | `lender-app/components/ProductTourRoot.tsx`, `lender-app/lib/productTour.ts`, `lender-app/lib/productTourContext.tsx`, `lender-app/components/GettingStartedSettingsPanel.tsx` |
| Settings help section | `lender-app/lib/settingsRegistry.ts`, `lender-app/components/HelpSupportSettingsPanel.tsx`, `lender-app/app/settings/SettingsPageClient.tsx` |
| Machine registries | `lender-app/lib/pipelineBlockRegistry.ts`, `lender-app/lib/navigation/navigationCatalog.ts` |
| Overlay / z-index | `lender-app/lib/ui/layering.ts`, `lender-app/lib/ui/layerTokens.ts` |
| Governance | `docs/scroll-architecture-rules.md`, `docs/governance/runtime-workspace-scroll-authority.md`, `docs/governance/ai-governance-policy.md` (referenced) |
| Existing census docs | `docs/as-built-spec/product-knowledge/` (this folder — created with this audit) |

### Out of scope (later phases)

- Convex `productKnowledge*` tables (Phase 2)
- `ProductUpdatesBell` / feed UI (Phase 2)
- Drift detector / AI drafts (Phase 3)
- Reorganization workbook linkage (Phase 4)

---

## Current behavior

### Help shell

**Provider:** `HelpSupportProvider` wraps authenticated app content in `lender-app/app/layout.tsx` (inside `UserSettingsProvider`, above `AppChrome`).

**Context API** (`helpSupportContext.tsx`):

- `isOpen`, `initialQuery`, `initialArticleId`
- `openHelp(opts?)`, `closeHelp()`, `toggleHelp()`
- Global `?` shortcut opens help when focus is not in a text field; `Escape` closes when open

**Panel:** `HelpCenterPanel.tsx` is a full-screen overlay (fixed inset, scrim + slide-over panel) at `Z_LAYER.HELP` (48). Features:

- Category filter (7 categories from `HELP_CATEGORIES`)
- Client-side search via `searchHelpArticles`
- Article list + detail view with plain-text paragraphs
- Support mailto when `NEXT_PUBLIC_SUPPORT_EMAIL` is set

**Trigger:** `HelpHubTrigger` calls `toggleHelp()`; icon-only 36×36px control.

**Critical finding — panel not mounted:** `AppChrome.tsx` **imports** `HelpCenterPanel` and `ContextualQuickTip` but **does not render them** anywhere in the file. Pressing `?` sets `isOpen: true` in context, but no component subscribes to render the panel. Help is effectively **non-functional in production UI** except via any direct `openHelp()` calls from code that may exist elsewhere (none found for panel mount).

**Trigger placement:**

| Shell | Help trigger visible? | Location |
|-------|----------------------|----------|
| SaaS (non–file-workspace) | Yes, `sm+` only | `MobileTopNav` trailing: `HelpHubTrigger iconOnly className="hidden sm:inline-flex"` |
| SaaS pipeline file workspace | No | Minimal chrome branch — no header actions |
| Classic | No | Header actions: search, theme, bell, nav, connection, user — **no HelpHubTrigger** |

### Static content (`helpCenterContent.ts`)

- **12 articles** in `HELP_ARTICLES`
- **7 categories:** basics, tasks, pipeline, contacts, lenders, documents, account
- **8 route tips** in `QUICK_ROUTE_TIPS` (tasks, pipeline, contacts, lenders, documents, settings, activity)
- No network fetch; no Convex; no founder/developer glossary block
- Article bodies are short (1–2 paragraphs); no structured sections (purpose / capabilities / data boundaries)

**Article IDs today:**

`workspace-overview`, `global-search`, `tasks-matrix`, `pipeline-files`, `contacts-crm`, `lenders-directory`, `documents`, `activity-feed`, `settings-hub`, `demo-workspace`, `notifications`, `offline-connection`

### Search (`searchHelpArticles.ts`)

- Client-side token scoring over title, summary, body, keywords, category
- Used only by `HelpCenterPanel` (which is not mounted)

### Contextual tips (`ContextualQuickTip.tsx`)

- Fixed bottom-left toast; dismiss persists to `localStorage` key `dlc-quick-tip-dismissed:{id}`
- Links to help article via `openHelp({ articleId })` when tip has `articleId`
- Uses `shellZIndexStyle("contextualTip")` — **not** in `Z_LAYER` enum (legacy alias in layerTokens)
- **Not mounted** in `AppChrome` (same critical gap as help panel)

### Settings — Help & support section

- `settingsRegistry.ts` defines section `helpSupport` with label "Help & support"
- `HelpSupportSettingsPanel.tsx` exists (open help, browse, shortcuts, mailto)
- **`SettingsPageClient.tsx` does not render a `SettingsSection` for `helpSupport`** — section is registered but omitted from the page (nav may still link via hash if present in sidebar — verify in Phase 1)

### Header chrome (`AppChrome.tsx`)

**Operational bell** (`UserNotificationsBell`):

- Mounted in SaaS `MobileTopNav` trailing and Classic header actions
- Requires `notifyUserKey` (session user id or `accountId` from preferences)
- Uses `PortalOverlayPanel`, `overlaySurfaceClass("dropdown")`, Convex queries: `unreadCountForUser`, notification list mutations
- Categories: task_assignment, file_update, mention, deadline, assignment_change, comment_activity, document_activity, status_change, digest_group
- Org-scoped via `activeOrganizationId` from permissions context

**Header action order (SaaS):** GlobalSearch → Help (sm+) → ColorScheme → Settings link → LiveConnectionPill → **Notifications bell** → UserButton

**Header action order (Classic):** GlobalSearch → ColorScheme → **Notifications bell** → MainNav (md+) → LiveConnectionPill → UserButton

**No second bell** for product updates/changelog today.

**Scroll contract:** `<main id="app-main-scroll">` is primary scroll owner except pipeline file workspace (`workspace-delegated`, `overflow-y-hidden` on main). Help overlay is `position: fixed` full viewport — does not add nested scroll owner on main (panel has internal scroll only).

### Onboarding overlap

**Product tour** (`ProductTourRoot` → `ProductTourOverlay`):

- 4 steps: tasks, pipeline, files, contacts (`productTour.ts`)
- Highlights `[data-product-tour={id}]` in shell; z-index `PRODUCT_TOUR` (62) — above help (48)
- Separate from help encyclopedia; no shared content source

**Getting started** (`GettingStartedSettingsPanel`):

- Settings section `gettingStarted` — demo workspace checklist
- Overlaps thematically with help articles `demo-workspace`, `settings-hub` but separate UI

### Machine registries

**Pipeline blocks** (`pipelineBlockRegistry.ts`):

- 13 canonical block IDs: fileDetails, fileNotes, dealWorkspace, licensing, scenarioMatch, generateTerms, lenders, contacts, feesSplits, tasks, people, archive, dangerZone
- Categories: file, deal, analysis, execution, people, admin
- Each block has `componentReference` path for audits

**Navigation catalog** (`navigationCatalog.ts`):

- Primary nav IDs: settings, tasks, events, contacts, documents, operations, shared, activity, pipeline, lenders
- Pipeline sub-items: pipeline_hub, analytics, ledger, licenses
- `productTourId` on some entries (tasks, events, contacts, pipeline)

**No registry today** maps nav/block IDs → help article slugs.

### Convex / data layer

- **No tables** for product knowledge, articles, changelog, or read receipts
- Operational notifications: `userNotifications` table with userKey, category, summary, readAt, org linkage (see schema ~line 2048)
- Help content is 100% static TypeScript

### Existing docs / census

- `docs/as-built-spec/` had **no files** before Phase 0
- Pipeline hub census (Prompt 2A) exists in agent transcript / plan context, not yet persisted as `docs/as-built-spec/pipeline/`
- Product Knowledge plan: `.cursor/plans/product_knowledge_system_0a5d0e2d.plan.md`

---

## Dependencies

| Dependency | Role for Product Knowledge |
|------------|---------------------------|
| `HelpSupportProvider` | Encyclopedia open/close state, `?` shortcut — **must keep** |
| `AppChrome` | Mount point for Help panel, contextual tips, future second bell |
| `Z_LAYER.HELP` (48) | Help overlay tier; below modal (50), command palette (52), toast (60) |
| `Z_LAYER.DROPDOWN` (38) | Notification bell panel — second bell should use same family |
| `UserNotificationsBell` | Operational alerts — **must not merge** with product feed |
| `pipelineBlockRegistry` / `navigationCatalog` | Canonical feature IDs for census → article mapping & drift detection |
| `settingsRegistry` | Future admin section for product knowledge publish |
| `searchHelpArticles` | Client search baseline; extend in Phase 1 |
| Single scroll owner | Help/feed panels must remain fixed overlays, not re-enable `<main>` scroll on file route |

---

## Gaps vs target

| Target | Current state | Severity |
|--------|---------------|----------|
| Functional help panel | Built but **not mounted** | **Blocker** |
| Contextual route tips | Built but **not mounted** | **Blocker** |
| Help trigger in Classic shell | Missing | High |
| Help trigger on mobile (`<sm`) | Hidden in SaaS | High |
| Settings Help section | Registry entry only; panel not on settings page | High |
| 12 static articles vs full census | ~12 short articles; no hub/file split, portal, sharing, scenarios | High |
| Structured article body (purpose, capabilities, data boundaries) | Plain `body: string[]` only | Medium |
| Founder/developer glossary | Not present | Medium (Phase 1) |
| Convex articles + feed | Not present | Phase 2 |
| Second bell (product updates) | Not present | Phase 2 |
| Visibility by org plan/role | Not present | Phase 2 |
| Admin publish / draft inbox | Not present | Phase 2–3 |
| Drift detector / automation | Not present | Phase 3 |
| Registry → article slug coverage validator | Not present | Phase 3 |
| `docs/as-built-spec` census on disk | Only product-knowledge folder started | Medium |

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Mounting Help panel breaks pipeline file scroll | Keep panel `position: fixed`; do not wrap in `<main>`; follow `runtime-workspace-scroll-authority.md` |
| Second bell collides with notification UX | Distinct icon (Sparkles/Newspaper), adjacent mount, separate Convex tables and unread logic |
| Classic users cannot discover help | Phase 1: add `HelpHubTrigger` to Classic header; ensure mobile visibility |
| Duplicate onboarding (tour vs help vs getting started) | Cross-link in articles; do not merge systems in v1 |
| Auto-publish leaks developer jargon | Drafts only; human approval; glossary in founder-only field |
| Static fallback drift after Convex migration | Keep `helpCenterContent.ts` fallback until migration verified |
| Unmounted imports confuse future edits | Phase 1 first task: mount `HelpCenterPanel` + `ContextualQuickTip` at AppChrome root (all shell branches except client portal) |

---

## Recommended Phase 0C / Phase 1 entry actions

1. **Phase 0C (complete):** Add `lib/product-knowledge/types.ts` + `censusArticleMap.ts` — no UI.
2. **Phase 1 audit then:** Mount help panel and contextual tips; wire `helpSupport` settings section; expand articles from census map.

---

## Audit sign-off

- **Date:** 2026-06-22
- **Files read:**
  - `lender-app/components/AppChrome.tsx`
  - `lender-app/components/HelpCenterPanel.tsx`
  - `lender-app/components/HelpHubTrigger.tsx`
  - `lender-app/components/HelpSupportSettingsPanel.tsx`
  - `lender-app/components/ContextualQuickTip.tsx`
  - `lender-app/components/UserNotificationsBell.tsx` (partial)
  - `lender-app/components/ProductTourRoot.tsx`
  - `lender-app/components/GlobalOverlayProviders.tsx`
  - `lender-app/app/layout.tsx`
  - `lender-app/app/settings/SettingsPageClient.tsx` (partial)
  - `lender-app/lib/helpSupportContext.tsx`
  - `lender-app/lib/helpCenterContent.ts`
  - `lender-app/lib/searchHelpArticles.ts`
  - `lender-app/lib/productTour.ts`
  - `lender-app/lib/settingsRegistry.ts`
  - `lender-app/lib/pipelineBlockRegistry.ts` (partial)
  - `lender-app/lib/navigation/navigationCatalog.ts` (partial)
  - `lender-app/lib/ui/layering.ts`
  - `lender-app/lib/ui/layerTokens.ts` (partial)
  - `lender-app/convex/schema.ts` (grep: userNotifications, productKnowledge)
- **Ready to implement Phase 0C:** yes
- **Ready to implement Phase 1 UI:** yes, after `01-encyclopedia-audit.md` (mount fix is highest priority)
