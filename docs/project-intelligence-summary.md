# Project Intelligence Summary — Direct Lending Connection

**Purpose:** Canonical onboarding and planning context for humans and AI assistants. Reflects the repo as of the document date; verify against `convex/schema.ts`, `lib/pipelineBlockRegistry.ts`, and `docs/ai-development-rules.md` when implementing.

## Governance & required reading (mandatory)

**Every AI-assisted session and every engineer** working on product code must load this intelligence **together with** the repository’s binding policy docs — **before** coding or closing user-facing work:

| Document | Why |
|----------|-----|
| `docs/ai-development-rules.md` | Master standards + canonical doc map + “before complete” QA workflow |
| **`docs/governance/`** | **Enterprise policies** (no shadow systems, migrations, webhooks, tenancy, AI lifecycle, etc.) — full list in **`docs/governance/MANIFEST.json`** |
| `docs/project-intelligence-summary.md` (this file) | Architecture, terminology, systems, scroll/mobile philosophy |
| `docs/scroll-architecture-rules.md` | Single scroll owner, nested scroll prohibition, sticky/CLS discipline |
| **`docs/governance/runtime-workspace-scroll-authority.md`** | **Authoritative** runtime: delegated file scroll, non-scrolling `<main>` on file routes, Vaul, overlay rules |
| `docs/workspace-sheet-scroll-model.md` | Delegated scroll DOM contract + test ids |
| `docs/mobile-testing-rules.md` | **Mandatory mobile QA** — devices, commands, merge policy |
| `docs/deployment-rules.md` | Build → `qa:governance` → Vercel CLI deploy → prod smoke |
| **`docs/master-platform-blueprint.md`** | **Post-migration smoke protocols (A/B/C), module layout, triage/overlay/import guardrails** |
| `docs/ui-ux-rules.md` | Mobile-first UX, Material alignment, overlays, no double scroll |
| `docs/performance-rules.md` | Rerender, virtualization, observers, mobile perf |

**Enforcement tooling:** `lender-app/` → `npm run qa:governance`; **`npm run verify:governance:docs`** verifies **`docs/governance/MANIFEST.json`** + core policy paths exist. **Checklist:** `docs/testing/governance-qa-checklist.md`, `docs/governance/feature-completion-checklist.md`.

**Cursor:** `.cursor/rules/project-rules.mdc`, `.cursor/rules/governance-hub.mdc` (always on), repo root `.cursorrules`.

---

**Product name:** **Direct Lending Connection** (workspace folder may still read “Lender List.”)  
**Stack:** Next.js 15, React 18, Convex (backend + real-time data), Tailwind, Vercel (frontend). **Auth:** HMAC-signed session cookie (`lib/sessionAuth.ts`, `dlc_session`) embedding `userKey`, Convex `organizationId`, `organizationName`, and `workspaceRole`, with matching `APP_AUTH_*` variables on the Convex deployment for server fallbacks.

---

## SECTION 1 — PROJECT OVERVIEW

**What the platform is:** A broker-centric **operational workspace** for commercial / alternative lending workflows: pipeline (deals/files), lender directory and scenario matching, structured deal intake, tasks, CRM-style contacts, messaging, documents, revenue/ledger views, and team features—unified in one shell rather than a collection of disconnected tools.

**Who it is for:** Origination and brokerage teams who shop files to lenders, track stages and economics, manage people and follow-ups, and need **one scroll-stable, mobile-capable surface** per deal.

**Core business/workflow purpose:** Move a **file** (pipeline row) from lead through underwriting and funding while attaching **lenders**, running **scenario match**, maintaining **deal data** (intake-shaped), linking **contacts**, coordinating **tasks** and **comms**, and optionally exposing a **client portal**.

**Operational philosophy:**  
- **Unified operational workspace:** One platform feel; shared grid/spacing; utilities stay secondary to content.  
- **Modular “lego block” features:** Attach, remove, reorder, configure—especially on the pipeline file surface.  
- **CRM / workspace hybrid:** Files are the hub; global **contacts** and **lenders** are shared directories with many-to-many links to files and each other.  
- **White-label SaaS direction:** Org-level `branding` (logo storage, colors, app name) and custom domains exist in schema; product paths assume eventual tenant theming.  
- **Multi-tenant direction:** `organizations`, `organizationMembers`, RBAC-style permissions, plan/Stripe fields, scoped queries, and demo bundles—the model is org-first with legacy unscoped rows still supported.

Authoritative engineering philosophy is captured in `docs/ai-development-rules.md` (architecture, UX, data, performance, deployment, long-term constraints).

---

## SECTION 2 — CORE SYSTEMS

| System | Purpose | Connects to | Architecture status | Future direction |
|--------|---------|-------------|---------------------|------------------|
| **Pipeline** | Funnel of deals (`pipeline` table): stage, economics shell, lender list, scenario criteria, archives, snooze, org scope, search text. | Deal intake (`dealData` / `intakeSheets`), tasks (`relatedFileId`), ledger, contacts (embedded + links), webhooks, portal. | **Mature** core data model with explicit ownership docs (`lib/deal/canonicalDataModel.ts`). | Denser automation hooks; clearer migration off legacy embedded contacts-only flows. |
| **Pipeline File Workspace** | Primary **per-file** UI: file chrome, workspace sheet + delegated scroll, quick panels, modular blocks. | Convex `pipeline` queries/mutations, block registry, mobile Vaul snap frame, task/lender **`RecordInspectorShell`**. | **Mature**; scroll contract is **delegated** on the file route (not `<main>`). | Preset layouts; inspector shell reuse; performance tuning on large files. |
| **Tasks** | Eisenhower-style matrix, subtasks, links to files/contacts, snooze, recurrence, attachments. | `pipeline`, `contacts`, notifications (`userNotifications`, `taskNotifications`). | **Mature** schema and hub UX. | Stronger assignee workflows as identity model hardens. |
| **Contacts** | Standalone CRM records: labels, CRM relationship types, activity log, global search. | `contactFileLinks`, `contactLenderLinks`, tasks, documents hub, file messaging. | **Mature**; coexists with legacy `pipeline.contacts` array. | Prefer link table as source of truth; reduce duplication/confusion with embedded contacts. |
| **Lenders** | Directory + enrichment: programs, scenario search text, org vs global catalog, attachments, ratings. | `pipeline.lenders` / `selectedLenderId`, scenario matching, discovery AI, contact links. | **Mature** with org-scoping and search indexes. | Deeper program-level matching; integration-driven sync (see integrations). |
| **Scenario Matching** | Match lenders to deal criteria (`scenarioCriteria` on file; global search analogs). | `pipeline`, `lenders` (incl. `programList`, `minFico` overrides). | **Production** path via Convex scenario APIs and UI blocks (`PipelineScenarioMatch`). | Richer rule DSL; saved scenarios; performance on very large catalogs. |
| **Notes** | File notes live on pipeline row and in shared state; contact activity includes note kinds; file notes block in drawer. | `pipeline.notes`, `fileSharedState`, activity feed. | **Mature** at file level; contact notes via `contactActivity`. | Unified “timeline” UX across entities (optional). |
| **Messaging** | Per-file threads (`fileMessages`) with optional contact linkage. | `pipeline`, `contacts`, org permissions. | **Implemented** (`FileMessagingPanel` in quick panels). | Notifications, read receipts, external channel bridges via integrations. |
| **Email** | Transactional/system email paths (e.g. notifications, portal flows) via Convex modules and env-configured providers. | Auth users, org settings, `systemEmails`-class flows where present. | **Partial**—depends on env and feature flags. | Consolidate provider abstraction; template management per org. |
| **Portal** | Client-facing constrained access: invites, grants, audit, requests (`clientPortalAdmin` APIs, `ClientPortalInviteBlock`). | `pipeline`, sign-in URLs returned from invite mutations, org scope. | **Implemented** for core invite/link flows. | Expand permissions, branding, and document workflows for clients. |
| **Documents** | Library storage and linking (task attachments, lender attachments, hub UIs like `LibraryDocumentsPanel`). | Convex `_storage`, contacts, tasks, lenders. | **Mature** patterns; multiple surfaces. | Single mental model for “library vs task-only” docs across UX copy. |
| **Snooze** | Hide files from default pipeline until `snoozedUntil`; tasks have analogous `snoozedUntil`. | Pipeline list/board filters; `SnoozeMenu` UI. | **Implemented.** | Server-side reminders optional; timezone clarity in UI. |
| **Layout engine** | `AppChrome` + `MobileChromeProvider` + route-aware padding; pipeline shell width via `WorkspaceContentContainer`. | Single scroll contract, bottom nav, focus mode. | **Stabilized** (documented in `AGENTS.md`). | Continue ruthless elimination of competing scrollports. |
| **Modular block system** | Registered pipeline drawer blocks with defaults, visibility rules, per-file layout, global admin config, settings schemas. | `pipelineBlockRegistry`, `fileDrawerLayout`, `pipelineGlobalBlockConfig`, `PipelineDrawer` / parallel layout. | **Mature** registry; some blocks still implemented inside large files (`component: null`). | Finish component extraction; expand `settingsSchema` coverage. |
| **Shared data layer** | `fileSharedState` + `fileBlockFieldOverrides` — canonical numeric/text snapshot and per-block overrides. | All blocks that show loan amount, rate, term, revenue fields; `fileSharedState` Convex helpers. | **Implemented** with normalization (`lib/fileSharedFields.ts`). | More fields bus-backed if duplication appears; clear UI for override vs sync. |
| **Automation** | `userSimpleWorkflows` (trigger → action), outbound webhooks, integration job enqueue placeholders. | Pipeline mutations, `userSimpleWorkflowExecutor`, outbound subscription tables. | **Foundational**—rules exist; not all actions are feature-complete end-to-end. | Expand triggers; UI for non-dev configuration; observability. |
| **Webhooks** | Org-scoped outbound subscriptions; signed/delivered events (HTTP worker path); includes pipeline patch context. | `webhookOutbound.ts`, product mutations emit via scheduler. | **Implemented** core enqueue/delivery pattern. | More event types; retry dashboards; inbound connector parity. |
| **AI systems** | **Lender discovery** (OpenAI/Perplexity web-assisted candidate generation → `lenderCandidates` review). | `convex/discovery.ts`, env API keys. | **Operational** with external API dependency. | Guardrails, cost controls, optional closed-network mode; assistive AI elsewhere kept architectural per `ai-development-rules.md`. |

---

## SECTION 3 — PIPELINE FILE WORKSPACE

**Terminology map**

| UX / concept | Code / region | Notes |
|--------------|---------------|--------|
| File chrome | `sectionId: file-chrome`, `htmlId: pipeline-ws-file-chrome` | Sticky header: name, stage, actions. |
| Workspace utilities (collapsible) | `sectionId: workspace-utilities` | Wraps quick panels, scheduling, sharing, utility actions. |
| Quick panels | `sectionId: quick-panels` | Stack of lightweight sections (portal, messages, org email, etc.). |
| Scheduling | `sectionId: scheduling` | File-level schedule / appointments UI. |
| Sharing | `sectionId: sharing` | Team access / shares when present. |
| Utility actions | `sectionId: utility-actions` | Row of file-level actions. |
| Layout strip | `sectionId: layout-strip` | Insights, activity, drawer layout controls. |
| Modular blocks | `sectionId: modular-blocks` | Page-body blocks outside the drawer (parallel layout region). |
| Pipeline file root | `sectionId: pipeline-file-workspace`, `htmlId: pipeline-ws-file-root` | Outermost workspace wrapper. |
| Quick panel: portal | `sectionId: quick-panel-client-portal` | |
| Quick panel: messages | `sectionId: quick-panel-messages` | |

**Sticky header system:** Workspace header is `sticky top-0` with snooze-aware styling; inner padding follows mobile compact vs expanded chrome (`MobileChromeController`).

**Quick panels:** First-class vertical stack inside utilities; each quick panel can be wrapped in `PipelineWorkspaceSection` for stable IDs and labels.

**Scheduling row:** Discrete `PipelineWorkspaceSection` with scheduling slot content.

**Layout / default strip:** Houses **insights**, **activity**, and **drawer layout** affordances so file-level analytics and drawer ordering stay aligned to the same grid as the rest of the workspace.

**Modular sections:** Drawer blocks (registry-driven) plus **parallel** page blocks (`PipelineDrawerParallelBlockContainer`) for two-column-style layouts where configured.

**Overlays:** **Task drawer** and **Lender drawer** use the shared **`RecordInspectorShell`** (right-docked inspector or full-screen mode): semantic scrim (`--dlc-scrim`), elevation tokens, and **one** bounded vertical scrollport on the panel. They must not steal **`AppChrome` `<main>`** scroll on hub/list routes or **[`data-pipeline-workspace-scroll`]** on the file route.

**Task / Lender inspector:** Overlay-only; aside uses `h-dvh max-h-dvh min-h-0 overflow-y-auto` (see `RecordInspectorShell.tsx`).

**Scrolling ownership (authoritative):** **`html`/`body` do not scroll** in the signed-in app. **Default:** **`AppChrome` `<main>`** is the vertical scroll owner for hub, lists, activity, settings, etc. **Pipeline file route (`/pipeline/[convexFileId]`):** **`AppChrome` `<main>`** is **`overflow-y-hidden`**; **vertical scroll is delegated** to **`[data-pipeline-workspace-scroll]`** inside the file workspace (mobile: **`PipelineWorkspaceMobileVaulFrame`** snap sheet). File chrome and blocks scroll **inside** that region — **not** via sticky “whole page” `<main>` scroll. **Task drawer**, **lender drawer**, **modals**, and **`max-h-*`** auxiliary lists remain **documented exceptions** with their own bounded scrollports. See `lender-app/AGENTS.md`, `docs/workspace-sheet-scroll-model.md`, and `docs/scroll-architecture-rules.md`.

**Mobile behavior:** Scroll-direction–driven **compact chrome** and **focus mode** reduce padding and hide bottom nav when deep in content; safe-area-aware; `touch-scroll-y` on scroll surfaces for iOS momentum; pipeline routes use wider shell (`isPipelineWideShellRoute`).

**Canonical section IDs:** Prefer `sectionId` values: `file-chrome`, `workspace-utilities`, `quick-panels`, `scheduling`, `sharing`, `utility-actions`, `layout-strip`, `modular-blocks`, and per-panel ids such as `quick-panel-client-portal`, `quick-panel-messages`.

**Layout philosophy (current):** One column, one max-width system (`WorkspaceContentContainer`), utilities **collapsed by default** (`PipelineFileWorkspaceUtilitiesCollapsible`), content-first.

**Future layout direction:** Org- and role-specific **default templates** (already partially modeled in `pipelineGlobalBlockConfig` and user preferences), richer **parallel block** presets, and continued **mobile-first** refinements without breaking scroll contracts.

---

## SECTION 4 — DATA ARCHITECTURE

**Shared data philosophy:** Deal truth lives in **intake-shaped** documents (`pipeline.dealData` and/or `intakeSheets`); workflow and economics on the **`pipeline`** row must not silently diverge. Cross-block UI fields use **`fileSharedState`** as the canonical snapshot (“data bus”) with top-level mirrors (`fundingAmount`, `rate`, `term`, `notes`, `commission`, `netRevenue`) for legacy readers.

**Canonical shared state:** `normalizeFileSharedStateFromPipeline` (`lib/fileSharedFields.ts`) is the **single read model** for bus + mirrors.

**Override logic:** `fileBlockFieldOverrides` keys are **`blockId::fieldKey`** with numeric `n` and `updatedAt`. Blocks may display **override** vs **shared** sourcing (see `FieldSyncIndicator`). Convex mutations in `fileSharedState.ts` reconcile updates and activity.

**Relationships:** Normalized **junction** tables: `contactFileLinks`, `contactLenderLinks`, `pipelineFileShares`. `pipelineFileActivity` provides undo-capable audit for many file operations.

**Many-to-many:** Contacts ↔ files, contacts ↔ lenders, files ↔ org members (shares). Lenders ↔ files uses `pipeline.lenders` array + `selectedLenderId` (workflow choice).

**Contacts architecture:** **Dual representation:** (1) legacy embedded `pipeline.contacts[]` objects, (2) first-class `contacts` rows with links. New CRM flows prefer **standalone contacts + links**; global list and activity assume org scope.

**Lenders ↔ contacts:** `contactLenderLinks` + optional embedded `lenders.contacts[]` for multi-contact lender orgs.

**Files ↔ contacts:** `contactFileLinks` with `role` and `relationshipType` (`client` | `referral` | `lender_rep`).

**Labels / roles:** Contacts carry `labels[]` (free tags) and `crmRelationshipTypes[]`; link rows carry `role` (free string) and optional `relationshipType`.

**Data flow between blocks:** Blocks read through Convex queries; **writes** go through targeted mutations (`patchDeal`, pipeline patch, `fileSharedState` helpers). Blocks **must not** couple to each other—only to **shared canonical fields** on the file or deal payload.

**Sync behavior:** Patches that touch derived fields (fees, funding amount from deal, global search text) run **server-side** in Convex to keep one authoritative number. Real-time UI updates via Convex subscriptions.

---

## SECTION 5 — MODULAR BLOCK SYSTEM

**Block registry:** `lib/pipelineBlockRegistry.ts` defines `PIPELINE_BLOCK_IDS`, categories, default/mandatory flags, `visibilityWhen` rules, `settingsSchema`, and `uiSurface`.

**Dynamic rendering:** Layout persisted per file in `fileDrawerLayout` (`order`, `hidden`, `expanded`, `settings`). Global admin defaults in `pipelineGlobalBlockConfig` (disabled blocks, admin-required union, default layout for **new** files).

**Active blocks:** Union of registry eligibility, org/product gates, deal-context visibility, and per-file hidden list.

**Block IDs (canonical):** `fileDetails`, `fileNotes`, `dealWorkspace`, `licensing`, `scenarioMatch`, `generateTerms`, `lenders`, `contacts`, `feesSplits`, `tasks`, `people`, `archive`, `dangerZone`.

**Visibility:** `hidden` array in layout; mandatory blocks ignore hide. `visibilityWhen` can hide blocks (e.g. `generateTerms` for refi-related deal types).

**Reorderability:** `order` array; UI persists back to `pipeline`.

**Default templates:** Seeded from registry `isDefault` + global config `newFileDrawerLayout`; user/org prefs may merge (`userPreferences.newFileDrawerSettings`).

**User customization:** Per-file drawer layout and block settings; account-level preferences for new files.

**Admin customization:** `pipelineGlobalBlockConfig` disables blocks product-wide or tightens which blocks must remain visible.

**Lego philosophy:** One implementation per concern; blocks **attach/detach** via layout, not forked pages.

**Duplicate elimination:** Validate with `npm run validate:block-registry`; follow `docs/ai-development-rules.md` (no parallel mini-systems; shared components for inline fields).

---

## SECTION 6 — UX / UI PHILOSOPHY

- **Unified workspace:** Shared spacing, no overlapping chrome, utilities **collapsed by default** on the file page.  
- **Mobile-first behavior:** Compact/focus modes, touch-friendly controls, safe areas, bottom nav awareness on non-focus routes.  
- **Minimized sticky chrome:** Headers shrink mentally and physically as the user scrolls on small screens.  
- **Smooth transitions:** intentional motion; avoid layout jump on load (reserve space, skeletons where needed).  
- **Content-first:** Deal story, lenders, and actions dominate; admin/settings are accessible but not loud.  
- **No overlapping UI:** Avoid stacked floating panels that fight the main surface; task drawer as **overlay** only.  
- **No double scrolling:** Strict shell contract (`AGENTS.md`); bounded inner regions only where documented.  
- **Collapse-by-default:** Workspace utilities Collapsible reinforces progressive disclosure.

**How it should feel:** Fast, legible, professional—one product, not a Frankenstein widget. Mobile users should trust they can reach the bottom of every screen without “scroll traps.”

---

## SECTION 7 — PERFORMANCE + DEPLOYMENT

**Frontend deploy:** **Vercel**, **CLI-first** (`npm run deploy:prod` = build + `vercel deploy --prod --yes`). Git may be disconnected; do not assume Git-triggered deploys (`docs/deployment-rules.md`, `lender-app/docs/deployment-workflow.md`).

**Backend deploy:** Convex production push **`npm run convex:deploy:prod`** whenever `convex/` changes.

**Testing:** `npm run build` before release; Playwright suites (`lender-app/tests/`) including mobile (`docs/mobile-testing-rules.md`); `npm run qa:governance` before marking user-facing work complete; `npm run test:core` for TS edge tests; manual smoke per `docs/deployment-rules.md` and `docs/ai-development-rules.md`.

**Mobile testing:** Policy: `docs/mobile-testing-rules.md`; Playwright Mobile Chrome + Mobile Safari (+ matrix as required); physical device sign-off for release-grade work.

**Performance philosophy:** Mobile-first; avoid redundant Convex subscriptions; memoize hot reads; virtualize large lists; lazy-load heavy blocks (e.g. lazy contacts block).

**Rendering optimization:** Stable keys, careful client/server boundaries, minimize rerender in workspace shell.

**Virtualization / lazy:** Large lender browse and pipeline lists should use patterns that scale (virtualization where implemented); prefer lazy component imports for heavy file blocks.

---

## SECTION 8 — AUTOMATION + INTEGRATIONS

**Webhook architecture:** Organizations configure **outbound** webhook subscriptions; mutations schedule **internal** delivery with backoff; payloads include pipeline snapshots when allowed (`webhookOutbound.ts`, envelope helpers in `lib/webhooks/`).

**GoHighLevel / CRM direction:** No dedicated “GoHighLevel” key appears in `lib/integrations/catalog.ts` today; CRM path is **provider-agnostic** (e.g. `generic_crm`, HubSpot, Salesforce placeholders) plus **inbound webhook** URLs on connectors. Typography in the app historically aligned with GHL-style branding (`app/layout.tsx` comment)—**product integration** is trending toward **configurable connectors**, not a single vendor lock-in.

**Automation events:** Pipeline activity kinds include `automation`; user workflows support triggers (`file_created`, `lender_selected`, `lender_attached`) and actions (`show_drawer_block`, `create_task_reminder`, `enqueue_integration_job`, `emit_automation_webhook`).

**Trigger/action philosophy:** Server-executed, **whitelisted** actions for safety; org-scoped; suitable for gradual expansion.

**Future API direction:** Convex mutations/queries as internal API; outbound webhooks and integration connectors as external bridge; minimize ad-hoc HTTP surfaces without auth story.

---

## SECTION 9 — CURRENT KNOWN ISSUES

- **Architectural:** Dual contact models (embedded `pipeline.contacts` vs `contacts` + `contactFileLinks`) can confuse product reasoning and imports.  
- **UX:** Any new surface that adds `overflow-y-auto` without `min-h-0` risks **scroll traps** (historically painful; heavily documented).  
- **Performance:** Very large lender tables or unconstrained lists without virtualization may regress mobile.  
- **Unfinished / transitional:** Integration **catalog** is largely **placeholder**; workers may be incomplete per provider. Some registry entries still point at monolithic `PipelineFileWorkspace.tsx` (`component: null`).  
- **Refactor areas:** Further **split** mega-components; centralize more block UIs into `components/pipeline/blocks/`.  
- **Duplicate systems:** Legacy `intakeSheets`-only flows vs `dealData`-on-pipeline—sync rules exist but mental overhead remains.  
- **Scalability:** Webhook volume, discovery AI cost, and global search index size require monitoring as tenants grow.

---

## SECTION 10 — FUTURE ROADMAP

- **White-label SaaS:** Org branding + custom domains (schema present); deepen theme tokens in UI.  
- **Organizations:** First-class tenant isolation via Convex `organizations` + RBAC; session pins active `organizationId`.
- **Permissions:** `organizationRbac` / plan entitlements—expand resource-level matrix (files, contacts, integrations).  
- **Automation:** Richer triggers (status transitions, time-based), durable execution log, user-facing rule builder.  
- **Analytics:** `convex/analytics.ts` direction—funnel metrics, lender win rates, SLA-style reporting.  
- **AI assistance:** Discovery today; future assist for scenario drafting, term summaries, and contact insights **within** shared architecture rules.  
- **Configurable layouts:** Per-role default blocks, template marketplace internal to org.  
- **User-defined workflows:** Combine tasks, webhooks, and integration jobs into saved playbooks.  
- **Marketplace / plugins:** Registry pattern supports third-party blocks **if** security and RBAC story matures.  
- **Advanced CRM graph:** Explicit graph queries across contacts ↔ lenders ↔ files ↔ tasks for relationship intelligence.

---

## SECTION 11 — MASTER TERMINOLOGY INDEX

| Internal / code | Also called | Meaning |
|-----------------|-------------|---------|
| `pipeline` | File, deal file, pipeline file | Primary deal row. |
| `dealData` | Deal workspace payload | Intake-shaped JSON on pipeline. |
| `intakeSheets` | Intake (legacy) | Standalone sheet table; may link to pipeline. |
| `fileSharedState` | Data bus, shared snapshot | Canonical cross-block numbers/text + `updatedAt`. |
| `fileBlockFieldOverrides` | Block overrides | Per-block numeric overrides. |
| `fileDrawerLayout` | Drawer layout | Block order/hidden/expanded/settings. |
| `PIPELINE_BLOCK_IDS` | Block id | Canonical drawer block identifier set. |
| `PipelineFileWorkspace` | File page workspace | Main per-file UI shell. |
| `AppChrome` | App shell | Header, nav, `<main>` — **scroll owner on default routes**; on file workspace route `<main>` is **non-scrolling** (see **`runtime-workspace-scroll-authority.md`**) |
| `[data-pipeline-workspace-scroll]` | Workspace scroller | **Vertical scroll owner** for pipeline **file** route body (`data-testid="pipeline-workspace-scroll"`). |
| `PipelineFileWorkspaceShell` | File layout shell | Hosts delegated scroller + desktop integrated sheet. |
| `PipelineWorkspaceMobileVaulFrame` | Mobile workspace sheet | Vaul snap; embeds workspace scrollport; below `md` only. |
| `WorkspaceContentContainer` | Grid width wrapper | Aligns max width / padding. |
| `PipelineWorkspaceSection` | Section wrapper | Provides `sectionId`, `htmlId`, label. |
| `contacts` | CRM contacts | Table of people/entities. |
| `contactFileLinks` | File-contact link | Many-to-many with role/relationship. |
| `contactLenderLinks` | Lender-contact link | Many-to-many. |
| `lenders` | Lender directory | Capital provider catalog row. |
| `selectedLenderId` | Chosen lender | Funding choice among attached lenders. |
| `scenarioCriteria` | Scenario filters | Structured match inputs on file. |
| `Snooze` / `snoozedUntil` | Hide until date | File or task deferral. |
| `ledger` | Revenue ledger | Funded deal economics record. |
| `tasks` | Task hub items | Work tracking rows. |
| `fileMessages` | File messaging | Threaded in-app messages on file. |
| `clientPortalGrants` (concept) | Portal access | Client capability grants (API layer). |
| `integrationConnectors` | Connector | Org integration endpoint config. |
| `userSimpleWorkflows` | Automation rules | Trigger/action pairs. |
| `lenderCandidates` | Discovery inbox | AI-suggested lenders pending review. |
| `organizationId` | Org, tenant | Multi-tenant scope. |
| `userKey` / `memberUserKey` | Member identity | Stable id passed from client; aligns with session `userKey` and Convex org-member checks. |
| `globalSearchText` | Search blob | Denormalized search field on major entities. |
| `demoBundleId` | Demo dataset tag | Removable demo seed marker. |

---

## SECTION 12 — ENGINEERING RULES SUMMARY

**Governance:** Mandatory read order and QA gates are defined in `docs/ai-development-rules.md` and **`docs/governance/`** (manifest: `docs/governance/MANIFEST.json`). Run `npm run verify:governance:docs` and `npm run qa:governance` from `lender-app/`. Human checklists: `docs/testing/governance-qa-checklist.md`, `docs/governance/feature-completion-checklist.md`.

**Architecture:** Modular blocks; no duplicate mini-apps; shared canonical data between blocks; additive migrations; preserve production data; Convex schema is source of truth for persistence shape.

**Testing:** Desktop + tablet + mobile; empty/loading/error/large data states; no production console errors on shipped paths; **`npm run qa:governance`** baseline for user-facing completion; Playwright for critical scroll/layout regressions.

**Deployment:** `npm run build` in `lender-app/`; deploy Next.js to Vercel **via CLI** per `docs/deployment-rules.md` (`npm run deploy:prod`); deploy Convex when backend changes; **`npm run qa:governance`** baseline + **manual prod smoke** for user-facing changes.

**Modularity:** Register blocks in `pipelineBlockRegistry`; avoid cross-import UI coupling; use visibility and layout JSON over one-off forks.

**UX:** **Single active vertical scroll owner** per route — default `<main>`; pipeline **file** route `[data-pipeline-workspace-scroll]` (see **`docs/governance/runtime-workspace-scroll-authority.md`**); no overlapping clutter; stable section IDs; collapsible utilities on file workspace; task/lender inspector overlay only (`RecordInspectorShell`).

**Performance:** Mobile-first; lazy/virtualize; memoize; avoid nested heavy queries; optimize global search and scenario match hot paths.

---

*End of Project Intelligence Summary.*
