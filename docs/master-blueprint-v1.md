# Master Repository Blueprint v1 — Direct Lending Connection

**Date:** 2026-05-28  
**Status:** Read-only inventory (Phase 37.0) — **no code changes**  
**Purpose:** Glossary and structural map of the current application for top-down redesign of **Pipeline**, **Client Portal**, and **Master Navigation**.

**Product:** Direct Lending Connection (DLC)  
**App root:** `lender-app/` (Next.js 15 + React 18 + Convex + Vercel)  
**Companion docs:** `docs/project-intelligence-summary.md`, `docs/ai-development-rules.md`, `lender-app/AGENTS.md`

---

## 1. Repository topology

| Layer | Path | Role |
|-------|------|------|
| **Routes** | `app/` | Next.js App Router pages, layouts, API routes |
| **UI** | `components/` | React surfaces (shell, hubs, pipeline, portal, settings, shared UI) |
| **Logic / tokens** | `lib/` | Navigation, pipeline, auth, UI tokens, export, offline, design system |
| **Backend** | `convex/` | Schema, queries, mutations, crons, integrations (~166 modules) |
| **Policy** | `docs/` | Governance, scroll, mobile QA, deployment |

### 1.1 `app/` route index (operator-facing)

| Route | Page / client | Hub |
|-------|---------------|-----|
| `/` | Landing redirect | — |
| `/pipeline` | `PipelinePageClient` | **Pipeline hub** |
| `/pipeline/[fileId]` | `PipelineFilePageClient` | **Pipeline file workspace** |
| `/pipeline/file/[fileId]/deal` | Deal editor redirect | Pipeline |
| `/pipeline/file/[fileId]/print` | `PrintFileClient` | Pipeline print |
| `/pipeline/intake/[[...slug]]` | Legacy intake redirect | Intake |
| `/pipeline/library` | Redirect / library | Documents |
| `/pipeline/licenses` | Licensing reference | Pipeline sub |
| `/tasks` | `TasksPage` (matrix + drawer) | **Tasks** |
| `/ledger` | `LedgerPage` | **Ledger** |
| `/contacts` | `ContactsPage` | **Contacts** |
| `/lenders` | `LendersWorkspaceClient` | **Lenders** |
| `/events`, `/events/[eventId]` | Events workspace | Events |
| `/documents` | Documents hub | Documents |
| `/activity` | Activity feed | Activity |
| `/analytics` | Analytics | Pipeline zone |
| `/operations` | Operations dashboard | Operations |
| `/shared` | Shared workspace | Shared |
| `/settings` | `SettingsPageClient` | **Settings** |
| `/settings/navigation-manager` | Nav manager | Settings |
| `/settings/pipeline-stages` | Stage admin | Settings |
| `/settings/tasks/library` | Task templates | Settings |
| `/portal`, `/portal/login`, `/portal/magic` | Client auth | **Portal** |
| `/portal/files`, `/portal/file/[fileId]` | Client file list / detail | Portal |
| `/share/[token]` | Share link resolver | Sharing |
| `/login`, `/signup`, auth flows | Operator auth | Auth |
| `/print/ledger`, `/print/terms/[id]` | Print layouts | Print |
| `/system/*`, `/convex-debug` | Debug / health | System |

### 1.2 `components/` top-level domains

| Folder | Focus |
|--------|--------|
| `layout/` | `MasterHeaderShell`, `MobileTopNav`, `MobileBottomNav`, sidebar rail |
| `navigation/` | `NavigationConfigProvider`, `ResponsiveNavProvider`, `AdaptiveNavigationController`, `TabletContextNav` |
| `pipeline/` | Hub views, hierarchy, notes, tasks-on-file, blocks, triage |
| `intake/` | Deal editor / dashboard / share |
| `contacts/`, `events/`, `communications/`, `collaboration/`, `ownership/` | Entity-specific UI |
| `settings/` | Settings section panels |
| `ui/` | Design-system primitives (`Button`, `Input`, `SearchField`, operational overlays) |
| `debug/` | Pipeline scroll/layout debug mounts |
| Root-level | `AppChrome`, `PipelineFileWorkspace`, `TaskDrawer`, `LenderDrawer`, `GlobalSearchPalette`, etc. |

### 1.3 `lib/` top-level domains (selected)

| Folder | Focus |
|--------|--------|
| `navigation/` | Catalog, resolve, icons, path utils, responsive registry |
| `pipeline/` | Routes, graph projection, hub persistence, capital filters, notes |
| `pipelineBlockRegistry.ts` | Canonical drawer block IDs + metadata |
| `pipelineDrawerLayoutStorage.ts` | Per-file drawer layout persistence |
| `settingsRegistry.ts` | Settings section IDs + deep links |
| `clientPortalSession.ts` | Portal session token (browser) |
| `orgRbac.ts`, `sessionAuth.ts` | Operator auth / permissions |
| `ui/` | Operational tokens, motion, layering, inputs, focus |
| `export/` | Pipeline / ledger export builders |
| `offline/` | Query snapshot + offline sync context |
| `deal/` | Canonical data model notes |

---

## 2. Master navigation

Navigation is **catalog-driven**, **user-configurable**, and **org-policy-aware**. Single source of truth: `lib/navigation/navigationCatalog.ts`.

### 2.1 Shell stack (render order)

```text
AppChrome (components/AppChrome.tsx)
├── SkipToMainLink
├── SuperuserImpersonationBanner / OrgScopeRecoveryBanner / OfflineSyncBanner
├── MasterHeaderShell
│   ├── SaasSidebar OR UnifiedSidebarRail (desktop)
│   ├── MobileTopNav (narrow)
│   ├── MainNav (classic top pills) OR adaptive nav
│   ├── GlobalSearchPalette trigger + HelpCenterPanel
│   ├── UserNotificationsBell, SettingsLink, ColorSchemeToggle, UserButton
│   └── TabletContextNav (tablet context strip)
├── <main id="app-main-scroll">  ← default vertical scroll owner (non–file-route)
├── MobileBottomNav + MobileBottomNavScrollSpacer
└── Global overlays: OperationalToast, UserOnboardingChecklist, ContextualQuickTip
```

**Providers wrapping chrome:** `NavigationConfigProvider`, `ResponsiveNavProvider`, `MobileChromeProvider`, `AdaptiveNavigationController`, `ShellMotionReadyProvider`.

### 2.2 Canonical nav catalog (`NAV_CATALOG`)

| ID | Label | Href | Group | Mobile primary |
|----|-------|------|-------|----------------|
| `settings` | Settings | `/settings#appearance` | system | yes |
| `tasks` | Tasks | `/tasks` | workspace | yes |
| `events` | Events | `/events` | workspace | no |
| `contacts` | Contacts | `/contacts` | crm | no |
| `documents` | Documents | `/documents` | workspace | no |
| `operations` | Operations | `/operations` | workspace | no |
| `shared` | Shared | `/shared` | workspace | no |
| `activity` | Activity | `/activity` | workspace | yes |
| `pipeline` | Pipeline | `/pipeline` | pipeline | yes (group) |
| `lenders` | Lenders | `/lenders` | crm | no |

**Pipeline sub-items** (`PIPELINE_SUB_ITEMS`): Pipeline view, Analytics, Ledger, Licenses.

**Pipeline zone paths** (`isPipelineZonePath`): `/pipeline/*`, `/analytics/*`, `/ledger/*` — mobile bottom nav highlights Pipeline group.

### 2.3 Navigation configuration system

| Piece | File | Behavior |
|-------|------|----------|
| User overrides | `navigationUserConfig` (Convex) + local storage | Order, visibility, preset |
| Org policy | `organizationNavigationPolicy` (Convex) | Enforced visible/hidden IDs |
| Resolution | `lib/navigation/navigationResolve.ts` | Merges catalog + prefs + RBAC + recency |
| Responsive registry | `lib/navigation/responsiveNavRegistry.ts` | `primaryNav` + `quickActions` for shells |
| Nav manager UI | `app/settings/navigation-manager/page.tsx` | Admin reorder / preview |
| Icons | `lib/navigation/navIcons.tsx` | Lucide mapping for `NavIconKey` |

### 2.4 Layout components (side / top / bottom)

| Component | File | Viewport |
|-----------|------|----------|
| `SaasSidebar` | `components/SaasSidebar.tsx` | Desktop expanded sidebar |
| `UnifiedSidebarRail` | `components/layout/UnifiedSidebarRail.tsx` | Collapsed rail |
| `MainNav` | `components/MainNav.tsx` | Classic horizontal pills + Pipeline submenu |
| `MobileBottomNav` | `components/MobileBottomNav.tsx` | ≤4 primary slots |
| `MobileTopNav` | `components/layout/MobileTopNav.tsx` | Compressed top on mobile |
| `TabletContextNav` | `components/navigation/TabletContextNav.tsx` | Tablet contextual strip |
| `GlobalTenantSwitcher` | (in sidebar footer) | Org switch |

### 2.5 Global chrome utilities (all routes)

| Feature | Component | Notes |
|---------|-----------|-------|
| ⌘K search | `GlobalSearchPalette.tsx` | Convex `globalSearch`; groups files/tasks/contacts |
| Help | `HelpCenterPanel.tsx` + `HelpHubTrigger` | `lib/helpCenterContent.ts` |
| Notifications | `UserNotificationsBell.tsx` | `userNotifications` table |
| Onboarding | `UserOnboardingChecklist.tsx` | Optional checklist modal |
| Product tour hooks | `data-product-tour` on nav entries | `lib/productTour.ts` |

---

## 3. The hubs

### 3.1 Pipeline hub (`/pipeline`)

**Owner:** `app/pipeline/PipelinePageClient.tsx` (~2.6k lines — monolithic hub client).

#### Hub modes (projection / “entity tabs”)

`ProjectionModeSwitcher` + `lib/pipeline/hubProjectionUi.ts` + `lib/pipeline/graphProjection.ts`:

| Mode | Label | Tree source |
|------|-------|-------------|
| `client` | Client | `buildClientFocusTree` |
| `project` | Project | `buildProjectFocusTree` |
| `file` | Loan File | Flat list grouped by parent stage |
| `lender` | Lender | `buildLenderFocusTree` |
| `referral` | Referral Partner | `buildReferralFocusTree` |
| `team` | Team Member | `buildTeamFocusTree` |
| `task` | Task | `buildTaskFocusTree` |
| `events` | Events (link) | Navigates to `/events` |

**URL params:** `hubMode`, `hubEntity`, `hubClient`, `hubProject`, `focus` — `lib/pipeline/routes.ts`.

#### Hub views

| View | Component | Notes |
|------|-----------|-------|
| Table (default) | `PipelineHubProjectionView` → hierarchy / file rows | `effectiveView === "table"`; forced on narrow |
| Board | `PipelineBoardView` | Stage columns; hidden on `narrow` |

#### Hub header (Phase 36.x — condensed)

| Tier | Visible when collapsed | Contents |
|------|------------------------|----------|
| Primary | Always | `SearchField`, `ProjectionModeSwitcher` |
| Toggle | Always | “Tune view & filters” (`hubViewsFiltersOpen`, default **false**) |
| Summary | Always | Result count + funding total |
| Panel | Expanded only | Entity dropdowns, sort, density, export, stage chips |

**Key child components:**

| Component | Role |
|-----------|------|
| `PipelineHubHierarchyView` | Client → project nesting |
| `PipelineHubFileRow` / `PipelineHubMobileFileCard` | File rows |
| `PipelineHubParentStageHeader` | Stage group headers |
| `PipelineHubVirtualizedLists` | List virtualization (optional / gated) |
| `OperationalOrientationStrip` | Sticky mode + crumbs + search hint |
| `OperationalBatchBar` | Bulk archive / delete |
| `NewPipelineHierarchyCreateDialog` | Create client / project / loan |

#### Hub persistence (`lib/pipeline/pipelineHubPersistence.ts`)

Saved views, filter snapshots, projection mode, mobile display (cards vs grid), sort keys.

#### Related routes (not hub list)

| Route | Client | Role |
|-------|--------|------|
| `/pipeline/[fileId]` | `PipelineFilePageClient` → `PipelineFileWorkspace` | **File workspace** |
| `/pipeline/licenses` | Licenses reference | `StateLendingLicensesReference` |
| `/pipeline/library` | Library redirect | Documents bridge |
| `/pipeline/intake/*` | Legacy redirect | Old intake URLs |

---

### 3.2 Pipeline file workspace (`/pipeline/[fileId]`)

**Owners:** `components/PipelineFileWorkspace.tsx`, `PipelineFileWorkspaceShell.tsx`, `PipelineWorkspaceMobileVaulFrame.tsx`.

#### Scroll contract

- **Hub routes:** `AppChrome` `<main>` scrolls.
- **File route:** `[data-pipeline-workspace-scroll]` owns vertical scroll; `<main>` does not scroll (`docs/governance/runtime-workspace-scroll-authority.md`).

#### File chrome tiers

| Tier | Content |
|------|---------|
| Header | Back to hub, file title, triage highlight, status, actions |
| Workspace sheet | Delegated scroll + drawer blocks |
| Mobile | Vaul `Drawer` snap frame (`compact` / `comfort` / `expanded`) |

#### Modular drawer blocks (`lib/pipelineBlockRegistry.ts`)

| Block ID | Label | Category | Mandatory | Primary surface |
|----------|-------|----------|-----------|-----------------|
| `fileDetails` | File details | file | yes | `PipelineFileWorkspace.tsx` |
| `fileNotes` | File notes | file | no | `blocks/FileNotesBlock.tsx` |
| `dealWorkspace` | Deal workspace | deal | yes | `intake/IntakeEditor.tsx` |
| `licensing` | Licensing | deal | no | inline |
| `scenarioMatch` | Scenario match | analysis | no | scenario UI |
| `generateTerms` | Generate terms | analysis | no | terms generator |
| `lenders` | Lenders | execution | no | lender attach table |
| `contacts` | Contacts | people | no | `blocks/FileContactsBlock.tsx` |
| `feesSplits` | Fees & splits | execution | no | revenue UI |
| `tasks` | Tasks | execution | no | `blocks/FileTasksBlock.tsx` |
| `people` | People | people | no | team / assignments |
| `archive` | Archive | admin | no | archive controls |
| `dangerZone` | Danger zone | admin | no | delete file |

**Layout:** `pipelineDrawerLayoutStorage`, `PipelineDrawerLayoutSettings`, `PipelineDrawerParallelBlockContainer`, per-block collapse (`HubCollapsibleSubsection` pattern on hub; drawer uses section DOM ids).

#### File workspace overlays / inspectors

| Surface | Component | Pattern |
|---------|-----------|---------|
| Task detail | `TaskDrawer.tsx` | `RecordInspectorShell` |
| Lender detail | `LenderDrawer.tsx` | `RecordInspectorShell` |
| Action suite | `ActionSuiteModal` | Modal |
| Confirm destructive | `OperationalConfirmDialog` | Overlay |
| Task triage | `FileTaskTriageComposer`, `TaskAttemptSnoozeSheet`, `TaskAttemptAuditDialog` | Sheets / dialogs |
| Client portal invite | `ClientPortalInviteBlock` (in blocks) | Embedded |
| File sharing | `PipelineFileSharingSection` | Members + search |
| Messaging | `FileMessagingPanel` | Quick panel |
| Hierarchy editors | `LinkedClientsEditor`, `ProjectCapitalStackEditor`, `ClientHierarchySettings` | In-drawer forms |

#### File route helpers

| Module | Role |
|--------|------|
| `lib/pipeline/routes.ts` | `pipelineDealEditorHref`, hub return query params |
| `lib/pipelineHeaderFlex.ts` | File header flex slots (title vs triage) |
| `lib/fileSharedFields.ts` | Shared numeric snapshot read model |
| `convex/pipeline.ts` | `getDetail`, `patchDeal`, `patch`, lender ops |

---

### 3.3 Tasks hub (`/tasks`)

**Owner:** `app/tasks/page.tsx` (~3.2k lines).

| Surface | Description |
|---------|-------------|
| Eisenhower matrix | Four quadrants + drag reorder |
| Views | Matrix, list, “today plan”, pinned toolbar |
| Filters | Search, labels, types, file link, assignee, archived |
| `TaskDrawer` | Full task inspector (dynamic import) |
| `TaskSharingSection` | Share task with org members |
| Export | TSV copy / download |
| Convex | `convex/tasks.ts` — CRUD, snooze, recurrence, attachments |

---

### 3.4 Ledger hub (`/ledger`)

**Owner:** `app/ledger/page.tsx`.

| Surface | Description |
|---------|-------------|
| Sticky toolbar | `SearchField`, filters |
| `LedgerTableRow` | Inline edit: monthly amount, paid-by, stage |
| `PaymentsRow` | Expandable payment lines; add payment form |
| `ProjectionsCard` | Revenue projections |
| `ResourceAccessProvider` | View-only rows disable mutations |
| Convex | `convex/ledger.ts`, `convex/payments.ts` |
| Print | `/print/ledger` |

---

### 3.5 Contacts hub (`/contacts`)

**Owner:** `app/contacts/page.tsx`.

| Surface | Description |
|---------|-------------|
| List + inspector | Split view; draft editor |
| Search | `SearchField` in toolbar |
| Roles | `ContactRoleMultiSelect` |
| Activity | `contactActivity` timeline |
| Links | Files and lenders via `contactFileLinks`, `contactLenderLinks` |
| Convex | `convex/contacts.ts` |

---

### 3.6 Lenders hub (`/lenders`)

**Owner:** `app/lenders/LendersWorkspaceClient.tsx`.

| Surface | Description |
|---------|-------------|
| `LenderTable` | Directory + `SearchField` |
| `LenderDrawer` | `RecordInspectorShell` inspector |
| `ScenarioSearch` | Criteria-based matcher (form, not list search) |
| Discovery | AI-assisted candidate review (`convex/discovery.ts`) |
| Convex | `convex/lenders.ts`, `lenderCandidates`, `lenderAttachments` |

---

### 3.7 Settings hub (`/settings`)

**Registry:** `lib/settingsRegistry.ts` — 16 sections.

| Section ID | Label | Typical panels |
|------------|-------|----------------|
| `gettingStarted` | Getting started | `GettingStartedSettingsPanel` |
| `helpSupport` | Help & support | Help shortcuts |
| `organization` | Organization | `OrganizationSettingsPanel` |
| `teamManagement` | Team management | `TeamManagementPanel` |
| `billing` | Billing | Stripe / plan |
| `domains` | Domains | `CustomDomainsSettingsPanel` |
| `appearance` | Appearance | Theme / SaaS shell |
| `accessibility` | Accessibility | Motion, text size |
| `layout` | Layout & density | Table + drawer density |
| `navigation` | Navigation | Link to navigation manager |
| `workflow` | Workflow | Pipeline defaults, intake autosave |
| `pipelineAdmin` | Pipeline admin | Global block config, templates |
| `systemAdmin` | System admin | GodMode tenant switch |
| `performance` | Performance | Device health |
| `data` | Data & connectivity | Live / offline |
| `notifications` | Notifications | Email + in-app |

**Sub-routes:** `/settings/navigation-manager`, `/settings/pipeline-stages`, `/settings/tasks/library`.

---

### 3.8 Secondary workspaces (nav catalog)

| Hub | Route | Notes |
|-----|-------|-------|
| **Events** | `/events`, `/events/[eventId]` | `EventDetailClient`, sections/items, collaborators |
| **Documents** | `/documents` | Library hub |
| **Activity** | `/activity` | `activityFeed` |
| **Analytics** | `/analytics` | Pipeline zone analytics |
| **Operations** | `/operations` | Ops dashboard |
| **Shared** | `/shared` | `sharedWorkspace` cross-org |
| **Intake (legacy)** | `/pipeline/intake/*` | Redirect to file deal workspace |

---

## 4. Pipeline specifics — component glossary

### 4.1 Hub components (`components/pipeline/`)

| File | Function |
|------|----------|
| `PipelineHubProjectionView.tsx` | Mode switcher content router |
| `PipelineHubHierarchyView.tsx` | Client/project tree |
| `PipelineHubFileRow.tsx` | Single file row (hub) |
| `PipelineHubMobileFileCard.tsx` | Mobile card layout |
| `PipelineBoardView.tsx` | Kanban by stage |
| `PipelineTableRow.tsx` | Legacy/wide table row |
| `PipelineHubMobileFilterSheet.tsx` | Mobile filter sheet (legacy; hub uses unified panel in 36.2+) |
| `PipelineHubRelationshipBadges.tsx` | Client relationship chips |
| `PipelineHubFileFocusBadges.tsx` | Focus / pin badges |
| `PipelineHubTaskFocusBadges.tsx` | Task-linked badges |
| `PipelineHierarchyBreadcrumb.tsx` | Breadcrumb + href helpers |
| `PipelineStageSelector.tsx` | Stage / sub-stage picker |
| `PipelineMobileWorkspaceOpsRail.tsx` | Mobile file ops rail |
| `HubCollapsibleSubsection.tsx` | Hub list subsection collapse |
| `HubExpandChevron.tsx` | Expand affordance |
| `ChangeFileProjectControl.tsx` | Move file between projects |
| `ClientMomentumStars.tsx` | Client confidence UI |
| `StateLendingLicensesReference.tsx` | Licenses page content |

### 4.2 Notes subsystem (`components/pipeline/notes/`)

| File | Function |
|------|----------|
| `FileNotesBlock.tsx` | Drawer block shell |
| `NoteThread.tsx` | Thread display |
| `NoteComposer.tsx` | Compose note |
| `ClientNotesTimeline.tsx` | Client-scoped timeline |
| `ClientNotesSubsection.tsx` | Hub client notes |
| `ClientScopedNoteComposer.tsx` | Client note entry |
| `PipelineTableNotesCell.tsx` | Table cell indicator |
| `PipelineHubNotesIndicatorChip.tsx` | Hub chip |
| `PipelineFileAuditLog.tsx` | Activity-style log |

**Data:** `pipelineFileNotes`, `pipelineFileNoteLinks` (Convex); `lib/pipeline/normalizePipelineFileNotes.ts`.

### 4.3 Tasks-on-file (`components/pipeline/tasks/`)

| File | Function |
|------|----------|
| `FileTasksBlock.tsx` | Drawer tasks block |
| `TasksOnFileSection.tsx` | Task list section |
| `FileTaskTriageFeedRow.tsx` | Triage feed row |
| `FileTaskTriageComposer.tsx` | New triage task |
| `FileWorkspaceTriageHighlight.tsx` | Header triage strip |
| `HubTriageHighlightChrome.tsx` | Hub triage chrome |
| `TaskAttemptSnoozeSheet.tsx` | Snooze sheet |
| `TaskAttemptAuditDialog.tsx` | Attempt audit modal |
| `TaskTemplateApplyModal.tsx` | Apply template |
| `triage/*` | Label manager, quick edit popover, severity, colors |

### 4.4 Pipeline blocks (`components/pipeline/blocks/`)

| Block file | Block ID |
|------------|----------|
| `FileTasksBlock.tsx` | `tasks` |
| `FileContactsBlock.tsx` | `contacts` |
| `FileNotesBlock.tsx` | `fileNotes` |

### 4.5 Pipeline modals & create flows (root `components/`)

| Component | Trigger context |
|-----------|-----------------|
| `NewPipelineHierarchyCreateDialog.tsx` | Hub “New…” menu |
| `NewPipelineFileDialog.tsx` | Legacy file create |
| `NewFileDrawerTemplateBlocksEditor.tsx` | Template defaults |
| `PipelineDrawerBlockSuggestions.tsx` | Layout suggestions |
| `PipelineDrawerLayoutSettings.tsx` | Reorder / hide blocks |
| `BrowseFiltersPanel.tsx` | Generic filter panel pattern |

### 4.6 Pipeline Convex API map (primary)

| Module | Responsibility |
|--------|----------------|
| `pipeline.ts` | File CRUD, list previews, patch, deal data, lenders on file |
| `pipelineHierarchyQueries.ts` | Client / project / file lists |
| `pipelineHierarchyMutations.ts` | Hierarchy CRUD |
| `pipelineHierarchyFilterQueries.ts` | Involvement filters |
| `pipelineFileNotes.ts` | Relational notes |
| `pipelineFileShares.ts` | File sharing members |
| `pipelineFileActivity.ts` | Undoable activity log |
| `organizationPipelineStages.ts` | Stage tree |
| `projectCapitalStack.ts` | Capital requirements / sources |
| `globalSearch.ts` | Cross-entity search index |
| `graphProjection.ts` (lib) | Client-side projection trees |

---

## 5. Client portal

### 5.1 Routes & layout

| Route | Page | Auth |
|-------|------|------|
| `/portal` | Redirect / landing | — |
| `/portal/login` | Email + password sign-in | Public |
| `/portal/magic` | Magic link exchange | Token in URL |
| `/portal/files` | Granted file list | Session required |
| `/portal/file/[fileId]` | File detail + upload + messages | Session + grant |

**Layout:** `app/portal/layout.tsx` — standalone shell (no `AppChrome`); header + constrained `main` + footer disclaimer.

### 5.2 Portal UI components

| Component | Role |
|-----------|------|
| `PortalMessagingSection.tsx` | Client ↔ team messages |
| `trust/TrustSurfaces.tsx` | Skeletons, errors, upload receipt |
| `lib/portalTrustErrors.ts` | User-safe error copy |
| `lib/clientPortalSession.ts` | Browser session token storage |

### 5.3 Access control model

```text
clientPortalIdentities (email + password per orgScope)
        ↓
clientPortalGrants (emailKey ↔ pipelineFileId, permission, expiry)
        ↓
clientPortalSessions (tokenHash, grantIds[], expiresAt)
        ↓
API authorizeSession() on each query/mutation
```

| Permission | Capability |
|------------|------------|
| `view` | Read file summary + messages |
| `view_upload` (default legacy) | Read + upload documents |

**Security modules:** `convex/portalAuthSecurity.ts`, `convex/clientPortalCrypto.ts`, `convex/clientPortalAudit.ts`, rate buckets `portalAuthThrottle`.

**Admin (operator):** `convex/clientPortalAdmin.ts`, `convex/clientPortalEmails.ts` — invite flows from file workspace.

**Public file fields:** `publicPipelineView()` in `clientPortal.ts` — strips sensitive deal internals.

### 5.4 Portal data tables

| Table | Role |
|-------|------|
| `clientPortalIdentities` | External user credentials |
| `clientPortalGrants` | Per-file access grants |
| `clientPortalSessions` | Active sessions |
| `clientPortalMagicLinks` | One-time login links |
| `clientPortalUploads` | Client-uploaded files |
| `clientPortalRequests` | Document requests from broker |
| `clientPortalUpdates` | Broker → client updates feed |
| `clientPortalAudit` | Security audit trail |

---

## 6. Data schemas (Convex) — entity glossary

**Source of truth:** `convex/schema.ts` (~90+ tables). Grouped by domain.

### 6.1 Tenancy & auth

| Table | Entity | View connection |
|-------|--------|-----------------|
| `organizations` | Tenant | Org switcher, all scoped queries |
| `organizationMembers` | Membership | Team panel, RBAC |
| `organizationRoles` / `organizationPermissions` | RBAC | Route visibility |
| `authUsers` / `authSessions` | Operator auth | Login, session cookie |
| `userPreferences` | Per-user UI prefs | Density, theme, nav |
| `navigationUserConfig` | Nav overrides | Navigation manager |
| `organizationNavigationPolicy` | Org nav policy | Forced hide/show |
| `organizationSettings` | Org defaults | Branding, workflow |

### 6.2 Hierarchy graph (Pipeline redesign core)

```text
clients
  └── projects
        └── pipeline (loan files)
              ├── fileClients / loanClients / projectClients (M:N links)
              ├── fileProjects
              ├── fileLenders / fileReferralPartners / fileTeamMembers
              └── fileTasks (graph edges)
```

| Table | Primary UI surfaces |
|-------|---------------------|
| `clients` | Hub client mode, entity filters, hierarchy settings |
| `projects` | Hub project mode, capital stack editor |
| `pipeline` | Hub file mode, file workspace, ledger, portal grants |
| `projectCapitalRequirements` / `Sources` / `Allocations` | Capital stack editor, hub funding filters |
| `organizationPipelineStages` / `SubStages` | Board columns, stage chips, inline stage |

**`pipeline` row highlights:** `dealData` (intake-shaped), `status` / `stageId`, `fundingAmount`, `lenders[]`, `selectedLenderId`, `clientMomentum`, `commission` / `netRevenue`, `scenarioCriteria`, archive/snooze fields, `organizationId`, `globalSearchText`.

### 6.3 CRM & directories

| Table | Hub |
|-------|-----|
| `contacts` | Contacts page |
| `contactFileLinks` / `contactLenderLinks` | File workspace contacts block, contacts hub |
| `contactActivity` | Contact timeline |
| `lenders` | Lenders hub |
| `lenderAttachments` / `lenderStats` | Lender drawer |
| `lenderCandidates` | Discovery review |

### 6.4 Work management

| Table | Hub |
|-------|-----|
| `tasks` | Tasks page, file tasks block, hub task mode |
| `taskAttachments` / `taskNotifications` | Task drawer |
| `taskTemplateGroups` / `taskTemplates` | Settings task library |
| `organizationTriageLabels` | Triage label manager |
| `entityAssignments` | People block |

### 6.5 Economics

| Table | Hub |
|-------|-----|
| `ledger` | Ledger page (per-file revenue row) |
| `payments` | Ledger payment lines |

### 6.6 Collaboration & comms

| Table | Hub |
|-------|-----|
| `fileMessages` / `fileMessageAttachments` | File messaging, portal messages |
| `pipelineFileNotes` | Notes block |
| `pipelineFileActivity` | Audit / undo |
| `pipelineFileShares` | Sharing section |
| `resourceShares` | Shared workspace |
| `communicationThreads` / `outboundMessages` | Communications panels |
| `collaborationThreads` / `Comments` | Collaboration features |
| `activityFeed` | Activity page |

### 6.7 Documents & signatures

| Table | Hub |
|-------|-----|
| `libraryDocuments` + versions + links | Documents hub |
| `signatureEnvelopes` / `Signers` | Document signature block |

### 6.8 Events (separate product surface)

| Table | Notes |
|-------|-------|
| `events` + `eventSections` + `eventSectionItems` | Events workspace |
| `eventInvitations` / `Collaborators` | Sharing |
| `eventItemTaskLinks` | Bridge to tasks |

### 6.9 Integrations & automation

| Table | Notes |
|-------|-------|
| `integrationConnectors` / `Jobs` | External sync |
| `outboundWebhookSubscriptions` | Pipeline patch events |
| `userSimpleWorkflows` | User automation rules |
| `savedFilterPresets` | Saved hub filters |

### 6.10 View ↔ query quick reference

| UI surface | Primary Convex entrypoints |
|------------|----------------------------|
| Pipeline hub list | `pipeline.listTablePreview`, graph projection (client) |
| File workspace | `pipeline.getDetail`, `patchDeal`, `patch` |
| Tasks | `tasks.*` |
| Ledger | `ledger.list`, `payments.create/update` |
| Contacts | `contacts.list`, mutations |
| Lenders | `lenders.list`, `discovery.*` |
| Portal | `clientPortal.listMyFiles`, `getFileBundle` |
| Global search | `globalSearch.search` |
| Settings | `organizationSettings`, `userPreferences`, `navigationUserConfig` |

---

## 7. Cross-cutting platform systems

| System | Key files | Notes |
|--------|-----------|-------|
| **Scroll ownership** | `AppChrome`, `PipelineFileWorkspace`, `docs/scroll-architecture-rules.md` | One vertical owner per route |
| **Overlays** | `RecordInspectorShell`, `OperationalFilterDrawer`, `GlobalOverlayPortal` | Z-index via `lib/ui/layering.ts` |
| **Search UX** | `SearchField`, `opSearchFieldClass` | Phase 35 unified search styling |
| **Material / tokens** | `app/globals.css`, `tailwind.config.ts`, `lib/ui/operationalTokens.ts` | DLC Material adaptation |
| **Offline** | `lib/offline/OfflineSyncContext.tsx` | Snapshot persistence for hub list |
| **RBAC** | `lib/orgRbac.ts`, `convex/organizationRbac.ts` | Permission strings → nav + mutations |
| **Resource access UX** | `ResourceAccessProvider`, `lib/resourceAccessUx.ts` | View-only affordances |
| **Mobile QA** | `tests/mobile/*`, `npm run qa:governance` | Mandatory before ship |

---

## 8. Redesign anchors (suggested focus areas)

Based on current structure, these are the **highest-leverage boundaries** for Pipeline + Navigation + Portal redesign:

1. **Split `PipelinePageClient.tsx`** — extract `PipelineHubToolbar`, filter panel, and projection body into dedicated modules without changing behavior.
2. **Navigation catalog vs. hub IA** — `NAV_CATALOG` pipeline group bundles Analytics + Ledger; hub entity tabs are separate from nav tabs.
3. **Hierarchy FK migration** — UI reads both legacy `dealData` paths and `clients` / `projects` FKs; graph projection is client-side.
4. **File workspace block registry** — 13 blocks with partial inline implementation; registry is ahead of component extraction.
5. **Portal isolation** — separate layout and session stack from operator `AppChrome`; grants are file-scoped not client-scoped.
6. **Inspector pattern** — `TaskDrawer` + `LenderDrawer` share `RecordInspectorShell`; pipeline file uses full-page workspace instead.

---

## 9. Document maintenance

| When | Action |
|------|--------|
| New hub route | Add to §1.1 and §3 |
| New nav catalog ID | Update §2.2 |
| New Convex table | Add to §6 domain group |
| New pipeline block | Update §3.2 block table + `pipelineBlockRegistry.ts` |
| Header/toolbar refactor | Update §3.1 hub header table |

**Verification commands (inventory drift):**

```bash
# From lender-app/
npm run verify:governance:docs
rg "defineTable\(" convex/schema.ts
rg "id:" lib/navigation/navigationCatalog.ts
```

---

*End of Master Blueprint v1*
