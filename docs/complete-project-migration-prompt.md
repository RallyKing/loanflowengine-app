# Complete Project Migration Prompt — Direct Lending Connection (DLC)

**Purpose:** Master build/migration brief for porting or re-implementing the entire Direct Lending Connection platform on the same tech stack (Next.js 15 + Convex + Vercel).

**Production reference:** https://dlcfunds.vercel.app  
**App root:** `lender-app/`  
**Last updated:** 2026-07-06

**Related (narrower scope):** Stage 2 Forms-only transfer is documented inline in §5.4; for deep Forms ingestion detail see implementation in `convex/intakeForms.ts` and `lib/intake/dealPartyFieldRegistry.ts`.

---

## 1. Product definition

Build **Direct Lending Connection (DLC)** — a broker-centric **operational workspace** for commercial and alternative lending. It is **not** a collection of mini-apps; it is one unified platform where a **pipeline file (deal)** is the hub.

**Primary users:** Loan officers, brokers, processors, and team leads who shop deals to lenders, track stages and economics, manage contacts, run tasks, share documents, and optionally expose a **client portal**.

**Core workflow:** Move a **file** from lead → underwriting → funding while maintaining:

- Structured **deal data** (intake-shaped JSON on the file)
- Attached **lenders** and scenario matching
- Linked **contacts** (borrowers, guarantors, referral partners, lender reps)
- **Tasks**, **notes**, **messaging**, **documents**
- Optional **external intake** (forms, share links, client portal)

**Philosophy:**

- Unified workspace UX (one scroll owner per route, mobile-first, content-first)
- Modular **lego blocks** on the file workspace (attach, remove, reorder, configure)
- CRM + workspace hybrid (global contacts/lenders, many-to-many links to files)
- Multi-tenant org-first (`organizations`, RBAC, custom domains, branding direction)
- Real-time via Convex subscriptions

---

## 2. Tech stack (required)

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 15 App Router, React 18, TypeScript, Tailwind |
| Backend / DB / realtime | Convex (schema, queries, mutations, `_storage`) |
| Auth | HMAC-signed session cookie (`dlc_session`) via `lib/sessionAuth.ts` |
| Deploy | Vercel CLI (`npm run deploy:prod`), Convex prod deploy (`npm run convex:deploy:prod`) |
| Testing | Playwright (desktop + Mobile Chrome + Mobile Safari), `npm run qa:governance` |
| Design | DLC Material tokens (`rounded-dlc-*`, `duration-dlc-*`, `bg-dlc-surface`, semantic scrim/elevation) |

---

## 3. Non-negotiable architecture rules

1. **Single vertical scroll owner per route**
   - Default routes: `AppChrome` `<main>` scrolls
   - Pipeline **file** route: `<main>` is **non-scrolling**; scroll lives on `[data-pipeline-workspace-scroll]`
   - Registry route: `[data-registry-workspace-scroll]`
   - Task/lender inspectors: overlay only (`RecordInspectorShell`), must not steal file scroll

2. **Domain module layout** (post Phase 3 migration)

```
modules/pipeline/     — file workspace, blocks, tabs, tasks, lib/core
modules/contacts/     — command center, hub, registry explorer
modules/settings/     — loan templates, org panels, task library
lib/pipeline/*.ts     — re-export shims for Convex + legacy imports
components/           — shared shell only (AppChrome, ui/*, RecordInspectorShell)
```

3. **No shadow systems** — one canonical owner per concern (data, scroll, triage labels, block registry)

4. **Public routes** bypass session auth in `middleware.ts`: `/login`, `/portal`, `/share`, `/apply`, auth APIs

5. **Public routes** strip CRM chrome in `AppChrome` (portal + apply layouts)

6. **User-facing completion** requires: `npm run build` → `npm run qa:governance` → `npm run deploy:prod` → manual prod smoke

**Canonical policy docs:** `docs/ai-development-rules.md`, `docs/project-intelligence-summary.md`, `docs/governance/MANIFEST.json`, `docs/master-platform-blueprint.md`.

---

## 4. Application routes (full surface map)

| Route | Purpose |
|-------|---------|
| `/` | Redirects to tasks hub |
| `/pipeline` | Pipeline table / board hub |
| `/pipeline/[fileId]` | **Primary file workspace** (Deal Command Center) |
| `/pipeline/client/[clientId]` | Client-scoped file tree |
| `/pipeline/intake/[[...slug]]` | Legacy intake flows |
| `/tasks` | Eisenhower task matrix hub |
| `/contacts` | Contacts list |
| `/contacts/[id]` | Contact Command Center |
| `/contacts/entity/[entityId]` | Entity detail |
| `/registry` | Unified Registry Explorer (contacts + entities + lenders) |
| `/lenders` | Lender directory + scenario search |
| `/documents` | Document library hub |
| `/ledger` | Revenue / funded deals ledger |
| `/analytics` | Org analytics |
| `/activity` | Activity feed |
| `/events` | Events calendar |
| `/operations` | Ops dashboard |
| `/settings` | Org settings hub |
| `/settings/loan-templates` | File layout templates (block picker) |
| `/settings/pipeline-stages` | Dynamic pipeline stages |
| `/settings/navigation-manager` | Nav customization |
| `/settings/tasks/library` | Task template playbooks |
| `/shared` | Shared-with-me resources |
| `/portal/*` | **Client portal** (external users, portal auth) |
| `/share/[token]` | **Legacy intake share links** (section-based) |
| `/apply/[token]` | **Forms & Applications** public intake (registry-key based) |
| `/login`, `/signup`, etc. | Workspace auth |

---

## 5. Core systems to implement (complete feature list)

### 5.1 Pipeline & file workspace

**Data:** `pipeline` table — one row per deal/file.

**Fields (conceptual):** `fileName`, `status`, `stageId`, `subStageId`, `organizationId`, `fundingAmount`, `rate`, `term`, `lenders[]`, `selectedLenderId`, `dealData` (intake JSON), `fileDrawerLayout`, `fileSharedState`, `snoozedUntil`, `archivedAt`, economics (`commission`, `netRevenue`), hierarchy FKs (`clientId`, `projectId`).

**File workspace UI (`PipelineFileWorkspace`):**

- Sticky file chrome (name, stage, snooze, actions)
- **Deal Command Center tabs:**
  - Deal Info (borrowers, guarantors, file details, licensing, notes, tasks, lenders, fees)
  - Financials (deal workspace calculators, construction budget, PFS, household/income/assets)
  - Portals & Progress (client portal, underwriting ledger, communications)
  - Documents (document vault)
  - **Forms & Applications** (intake form composer + link hub)
  - Settings (archive, sharing, danger zone) — overflow tab
- Favorites bar (pin blocks → slide-over inspector)
- Utilities collapsed by default
- Mobile: Vaul snap sheet (`PipelineWorkspaceMobileVaulFrame`)

**Modular block registry** (`lib/pipelineBlockRegistry.ts`):

Block IDs: `fileDetails`, `fileNotes`, `dealWorkspace`, `licensing`, `scenarioMatch`, `generateTerms`, `lenders`, `contacts`, `feesSplits`, `tasks`, `people`, `archive`, `dangerZone`, `constructionBudget`, `investorExperience`, `pfs`.

Each block: category, parent tab, default/mandatory flags, `visibilityWhen` rules, optional `settingsSchema`, per-file layout (`order`, `hidden`, `expanded`, `settings`).

**Loan templates** (`pipelineFileUserTemplates`, Settings UI): Built-in strategies + custom templates with block registry picker; new file wizard applies template layout.

**Hierarchy:** Clients → Projects → Files (`clients`, `projects`, `loanClients`, `fileClients` junction tables). New file wizard: Contact → Project → Template.

**Pipeline stages:** Org-configurable `organizationPipelineStages` + sub-stages.

**Snooze:** `snoozedUntil` hides from default list.

**File activity + undo:** `pipelineFileActivity` with undo specs.

**Global search:** Denormalized `globalSearchText` on pipeline, contacts, lenders.

**Key paths:**

- `modules/pipeline/workspace/PipelineFileWorkspace.tsx`
- `modules/pipeline/components/FileWorkspaceTabShell.tsx`
- `lib/pipelineBlockRegistry.ts`

---

### 5.2 Deal data & intake

**Canonical deal payload:** `pipeline.dealData` — intake-shaped document (same field names as legacy `intakeSheets`).

**Key slices:**

- `borrowers[]`, `guarantors[]` (zero baseline: empty arrays on new files)
- `business` (entity borrower: legalName, ein, entityType, clientId)
- `cover`, `subjectProperty`, `loans[]`, `incomeRows`, `assets`, `liabilities`
- `commercial`, `hardMoney`, `pfs`, `sourceType`
- Patches via `patchDeal` mutation + `dealDataMerge`

**Legacy:** `intakeSheets` + `shareLinks` still supported; prefer `dealData` on pipeline for new files.

**Shared data bus:** `fileSharedState` + `fileBlockFieldOverrides` — canonical funding/rate/term/notes/revenue across blocks; `normalizeFileSharedStateFromPipeline` is read model.

**Key paths:**

- `convex/pipeline.ts` (`patchDeal`, `createFileWithDeal`)
- `convex/dealDataMerge.ts`
- `convex/intakeDocumentDefaults.ts`
- `lib/fileSharedFields.ts`

---

### 5.3 Borrowers, guarantors & entities (Phase 1)

**Internal UI (Deal Info tab):**

- `RegistryPartyLinker` — Individual/Entity toggle, registry search, inline create
- `DealPartyIdentityChip`, `DealPartyInstancePanel`
- `DealBorrowersPanel`, `DealGuarantorsPanel` — + Add borrower/guarantor empty-state

**Mutations:**

- `assignContactToBorrowerSlot`, `assignContactToGuarantorSlot` (`convex/pipelineContacts.ts`)
- `quickCreateRegistryEntity`, `bindEntityBorrowerToFile` (`convex/entityCanonicalization.ts`)
- Dual-write: deal row edits sync to linked CRM contact (`lib/contacts/borrowerTabWriteAdapter.ts`)

**Entity canonicalization:** `clients` table is source of truth for LLCs/corps; `dealData.business.clientId` back-reference.

**Field registry:** `lib/intake/dealPartyFieldRegistry.ts` — declarative keys for forms engine.

**Zero baseline:** `convex/intakeDocumentDefaults.ts` — `borrowers: []`, `guarantors: []` on new files.

---

### 5.4 Forms & Applications (Stage 2)

**Tables:** `intakeForms`, `intakeFormLinks` (see `convex/intakeSchemaPart.ts`)

**End-to-end flow:**

```
INTERNAL: Pipeline File → Forms & Applications tab
  → built-in preset or custom form
  → registry field checklist (grouped by block)
  → borrowerPartyType (individual / entity / either)
  → generateLink → https://host/apply/[token]

EXTERNAL: GET /apply/[token] (no auth, no CRM chrome)
  → getByToken → dynamic fields via portalFieldsForForm()
  → submitByToken

INGESTION:
  file_intake → hydrate dealData on existing fileId
  referral    → create pipeline file (status "New Lead", sourceType "referral")
  → map registryKey → rowKey via dealPartyFieldRegistry
  → create/link contacts, entity via ensureClientFromBusiness
  → referral partner via contactFileLinks (relationshipType: referral)
```

**Form types:**

- `file_intake` — hydrate existing file (requires `fileId` on form)
- `referral` — create new lead file (no `fileId`; optional `referralPartnerContactId`)

**Convex API (`convex/intakeForms.ts`):**

| Export | Auth | Purpose |
|--------|------|---------|
| `listForFile` | member | Forms for a pipeline file |
| `listLinksForForm` | member | Links for a form |
| `createForm` / `updateForm` / `removeForm` | member | CRUD templates |
| `generateLink` / `revokeLink` | member | Tokenized URLs |
| `getByToken` | **public** | Portal load |
| `markOpened` | **public** | Analytics |
| `submitByToken` | **public** | Ingest submission |

**Internal UI:** `modules/pipeline/components/tabs/FormsApplicationsTab.tsx`  
**Public UI:** `app/apply/[token]/`  
**Middleware:** `/apply` in `PUBLIC_PREFIXES`; `AppChrome` bypass for `/apply/*`

**Built-in presets** (in registry): Standard Client Intake, Entity Borrower Intake, Referral Lead Capture.

**Deferred:** Referral form builder UI at org level (backend ready; UI shows stub for referral preset from file tab).

---

### 5.5 Contacts & registry (CRM)

**`contacts` table:** People with multi-email/phone, roles, PII, org scope.

**Junction tables:**

- `contactFileLinks` (role, `registryRoleId`, `relationshipType`: client | referral | lender_rep)
- `contactLenderLinks`
- `entityContactLinks`, `clientContactLinks`, `individualContactLinks`

**Contact Command Center:** Hub tabs, relationship panels, sticky data (REO, PFS, business entities via `contactDataVersions` / sticky tables).

**Unified Registry (`/registry`):** Federated list of contacts + entities (`clients`) + lenders; `api.registry.list`; edit/create modals; promote contact → entity.

**Export bundle for partial port:** `export-bundle/` + `LOAN_FLOW_PRO_INTEGRATION.md`

**Key paths:**

- `modules/contacts/`
- `convex/contacts.ts`, `convex/registry.ts`, `convex/contactFileLinks.ts`

---

### 5.6 Lenders & scenario matching

**`lenders` table:** Company, programs, entity type, niche, min FICO, attachments, org vs global scope.

**On file:** `pipeline.lenders[]`, `selectedLenderId`, `fileLenders` junction with `contactRepId`.

**Scenario match:** `scenarioCriteria` on file + `convex/scenario.ts` scoring against lender catalog.

**Lender discovery (AI):** `discovery.ts` → `lenderCandidates` inbox for review.

**Lender drawer:** Overlay inspector on file workspace.

---

### 5.7 Tasks & triage

**`tasks` table:** Eisenhower matrix, subtasks, `relatedFileId`, snooze, recurrence, attachments.

**Triage (org labels):** `organizationTriageLabels` + `triageLabelId` on tasks — **not** separate task-type enums.

**In-file triage:** `FileTasksBlock`, `FileTaskTriageComposer`, `FileTaskTriageFeedRow`, visual state via `lib/inFileTaskTriageUi.ts`.

**Task template playbooks:** `taskTemplateGroups`, `taskTemplates`, `applyTemplateGroupToFile`.

**Hub highlights:** `taskHighlights.ts`, `hubTriageHighlight.ts` — macro chrome urgency bubbles.

**Task drawer:** Overlay via `RecordInspectorShell`.

---

### 5.8 Client portal

**Tables:** `clientPortalIdentities`, `clientPortalGrants`, `clientPortalSessions`, `clientPortalMagicLinks`, `clientPortalUploads`, `clientPortalRequests`, audit tables.

**Routes:** `/portal/login`, `/portal/files`, `/portal/file/[fileId]`, magic link flow.

**Internal:** `ClientPortalTab`, `ClientPortalInviteBlock`, `ClientPortalUploadsInbox` in Portals & Progress tab.

**Auth:** Separate from workspace session cookie.

**Key paths:** `convex/clientPortal.ts`, `convex/clientPortalAdmin.ts`, `app/portal/`

---

### 5.9 Documents & vault

**Tables:** `libraryDocuments`, `libraryDocumentVersions`, `libraryDocumentLinks`, `documentFolders`, `documentVaultTemplates`.

**Features:** Versioned blobs in Convex storage, folder tree per file, AI category suggestions, compliance templates, assembly.

**UI:** `DocumentVaultTab` on file; global `/documents` hub; link to contacts/lenders/tasks.

---

### 5.10 Messaging & communications

**`fileMessages` + attachments** — per-file threaded messaging.

**`UnifiedCommunicationPanel`** in Portals tab.

**Email:** System email events/logs; portal invite flows; partial transactional email abstraction.

---

### 5.11 Notes & activity

**File notes:** `pipelineFileNotes`, notes block, favorites slide-over.

**Activity feed:** `activityFeed`, `collaborationActivityEvents`, `pipelineFileActivity`.

**Contact notes:** via `contactActivity`.

---

### 5.12 Ledger & payments

**`ledger` table:** Funded deal economics.

**`payments` table:** Payment tracking.

**Print:** `/print/ledger`, `/print/terms/[id]`.

---

### 5.13 Underwriting & financial tools

**Underwriting ledger tab** in Portals & Progress.

**Deal workspace calculators:** DTI, comparison, weighted interest, payoff, day counter.

**Modular financial blocks:** Construction budget, investor experience, PFS.

**Commercial DSCR / hard money rehab** sections in financials tab.

---

### 5.14 Sharing & collaboration

**`pipelineFileShares`**, `resourceShares` — team file access.

**`shareLinks`** — legacy public intake section sharing (`/share/[token]`). **Distinct from** Forms (`/apply/[token]`).

**`taskShares`** — shared task views.

**Member presence, collaboration threads/comments** (schema present).

---

### 5.15 Organizations, auth & RBAC

**Tables:** `organizations`, `organizationMembers`, `organizationRoles`, `organizationPermissions`, `organizationSettings`, `organizationCustomDomains`, `authUsers`, `authSessions`.

**Access:** `organizationAccess.ts` — `assertOrgMember`, `assertCanMutatePipelineRow`, `assertCanReadContactRow`, plan entitlements.

**Superuser impersonation** (audit tables).

**Demo workspace:** `demoWorkspace.ts` — removable demo bundle.

---

### 5.16 Automation & integrations

**`userSimpleWorkflows`:** Triggers (`file_created`, `lender_selected`, …) → actions (`create_task_reminder`, `show_drawer_block`, `enqueue_integration_job`, `emit_automation_webhook`).

**Outbound webhooks:** `outboundWebhookSubscriptions`, delivery logs.

**Integration connectors:** `integrationConnectors`, OAuth, API keys, rate limits, job queue (foundational).

**Inbound webhooks:** `integrationHttp.ts`.

---

### 5.17 Analytics & discovery

**`analytics.ts`:** Referral sources, funnel metrics.

**`discovery.ts`:** AI-assisted lender candidate generation.

**Global search palette:** `globalSearch.ts` across entities.

---

### 5.18 Settings & configuration

- Org branding (logo, colors)
- Pipeline stages / sub-stages
- Navigation manager (user nav config)
- Loan file templates (block layouts)
- Task template library
- Document vault templates
- Triage label management
- Team / members / roles

---

## 6. Data architecture principles

| Principle | Implementation |
|-----------|----------------|
| Deal truth | `dealData` on `pipeline` (intake-shaped) |
| Workflow shell | `pipeline` row fields (status, stage, economics mirrors) |
| Cross-block UI numbers | `fileSharedState` bus + top-level mirrors |
| Per-block overrides | `fileBlockFieldOverrides` (`blockId::fieldKey`) |
| Contacts ↔ files | `contactFileLinks` (prefer over legacy `pipeline.contacts[]`) |
| Entities | `clients` table + `dealData.business.clientId` |
| Many-to-many everywhere | Junction tables, not embedded duplicates |
| Writes | Targeted Convex mutations only — blocks don't call each other |
| Migrations | Additive, reversible, never silent production overwrite |

---

## 7. Key Convex modules (backend map)

```
pipeline.ts                    — CRUD files, patchDeal, createFileWithDeal
pipelineContacts.ts            — borrower/guarantor slot assignment, sync
entityCanonicalization.ts      — entity find-or-create, bind to file
intakeForms.ts                 — forms engine (Stage 2)
shareLinks.ts                  — legacy share links
dealDataMerge.ts               — merge patches into dealData
fileSharedState.ts             — data bus mutations
tasks.ts                       — task CRUD, matrix queries
taskTemplateLibrary.ts         — playbook apply
organizationTriageLabels.ts    — org triage labels
contacts.ts                    — contact CRUD
registry.ts                    — federated registry list
lenders.ts                     — lender CRUD, search, scenario inputs
scenario.ts                    — lender matching engine
clientPortal.ts                — portal auth + file access
clientPortalAdmin.ts           — invites, grants
libraryDocuments.ts            — document vault
fileMessages.ts                — messaging
ledger.ts, payments.ts         — revenue
discovery.ts                   — AI lender discovery
webhookOutbound.ts             — outbound events
organizationAccess.ts          — RBAC guards
globalSearchSync.ts            — search text refresh
pipelineHierarchy*.ts          — client/project/file tree
pipelineFileUserTemplates.ts   — loan templates
```

**Schema:** `convex/schema.ts` (~100+ tables) + `convex/intakeSchemaPart.ts` for intake validators.

---

## 8. UI / UX system

- **Material adaptation:** `docs/material-design-system.md`, `app/globals.css` CSS variables, Tailwind token mapping
- **Premium workspace density:** `modules/pipeline/lib/core/premiumWorkspaceUi.ts`, `modules/contacts/components/hub/hubDetailStyles.ts`
- **Overlays:** `RecordInspectorShell` for tasks, lenders, favorite blocks — portaled, semantic scrim
- **Mobile:** Compact chrome on scroll, focus mode, bottom nav, safe areas, `touch-scroll-y`
- **No double scroll, no overlapping chrome**
- **Touch targets ≥ ~40px** on mobile primary actions

---

## 9. Implementation phases (recommended build order)

| Phase | Scope |
|-------|-------|
| **0 — Foundation** | Next.js shell, Convex, auth, AppChrome, middleware, org model, session |
| **1 — Pipeline core** | `pipeline` table, hub table, file workspace shell, scroll contract, stages |
| **2 — Deal data** | `dealData`, `patchDeal`, file details, shared state bus |
| **3 — Blocks & templates** | Block registry, drawer layout, loan templates, new file wizard |
| **4 — Command Center tabs** | Deal Info, Financials, Portals, Documents tab refactor |
| **5 — Contacts & registry** | CRM, junction links, registry explorer, command center |
| **6 — Lenders & scenario** | Lender directory, attach to file, scenario match, lender drawer |
| **7 — Tasks & triage** | Task matrix, in-file triage, org labels, playbooks |
| **8 — Borrowers/guarantors** | Zero baseline, registry linker, entity canonicalization |
| **9 — Forms & Applications** | Registry-driven intake, `/apply`, auto-ingestion |
| **10 — Portal & external** | Client portal, share links, referral forms UI |
| **11 — Documents** | Vault, folders, uploads, AI filing |
| **12 — Ledger, analytics, automation** | Revenue, webhooks, workflows, discovery AI |
| **13 — Polish & governance** | Mobile QA matrix, performance, a11y, enterprise policies |

---

## 10. Source repo layout (what to copy)

```
Lender List/
├── lender-app/                    # Next.js + Convex app (THE PRODUCT)
│   ├── app/                       # Routes
│   ├── modules/                   # Domain code (pipeline, contacts, settings)
│   ├── components/                # Shared shell + ui
│   ├── lib/                       # Shared libs + shims
│   ├── convex/                    # Backend (~198 modules)
│   └── tests/                     # Playwright
├── docs/                          # Governance + architecture (MANDATORY)
│   ├── ai-development-rules.md
│   ├── project-intelligence-summary.md
│   ├── master-platform-blueprint.md
│   ├── complete-project-migration-prompt.md  # (this file)
│   ├── governance/                # Enterprise policies (MANIFEST.json)
│   └── ...
├── export-bundle/                 # Registry integration bundle for Loan Flow Pro
└── LOAN_FLOW_PRO_INTEGRATION.md   # Registry phase export guide
```

**Minimum docs to port with the code:**

- `docs/project-intelligence-summary.md`
- `docs/ai-development-rules.md`
- `docs/master-platform-blueprint.md`
- `docs/governance/MANIFEST.json` + listed policy files

---

## 11. Stage 2 file manifest (Forms — quick copy list)

```
lib/intake/dealPartyFieldRegistry.ts
modules/pipeline/lib/core/dealPartyFieldRegistry.ts
convex/intakeForms.ts
convex/intakeSchemaPart.ts          # intakeForms + intakeFormLinks tables
convex/schema.ts
modules/pipeline/components/FileWorkspaceTabShell.tsx
modules/pipeline/components/tabs/FormsApplicationsTab.tsx
modules/pipeline/workspace/PipelineFileWorkspace.tsx
app/apply/layout.tsx
app/apply/[token]/page.tsx
app/apply/[token]/ApplyFormClient.tsx
middleware.ts
components/AppChrome.tsx
```

**Phase 1 dependencies (borrowers/guarantors):**

```
convex/intakeDocumentDefaults.ts
convex/pipelineContacts.ts
convex/entityCanonicalization.ts
modules/pipeline/components/deal/RegistryPartyLinker.tsx
modules/pipeline/components/deal/DealPartyIdentityChip.tsx
modules/pipeline/components/deal/DealPartyInstancePanel.tsx
modules/pipeline/components/deal/DealBorrowersPanel.tsx
modules/pipeline/components/deal/DealGuarantorsPanel.tsx
lib/contacts/borrowerTabWriteAdapter.ts
```

---

## 12. QA & deployment checklist

From `lender-app/`:

```bash
npm run build
npm run qa:governance          # build + mobile core + desktop smoke
npm run convex:deploy:prod     # when convex/ changed
npm run deploy:prod            # Vercel production
```

**Manual prod smoke:** login → pipeline → open file → scroll (mobile) → tasks → contacts → lenders → Forms & Applications tab → generate `/apply` link → submit in incognito → verify Deal Info hydrates.

**Production smoke protocols A/B/C:** `docs/master-platform-blueprint.md`

---

## 13. Known gaps / deferred (do not assume complete)

- Referral form **builder UI** at org level (backend exists; file-tab UI stub)
- Household Income registry + ingestion (PFS summary fields only)
- Full transactional email (mailto used for form portal invites)
- Integration catalog largely placeholder
- Dual contact model legacy (`pipeline.contacts[]` vs `contactFileLinks`) — migrating toward links
- Some registry blocks still `component: null` in monolithic workspace file
- Playwright E2E for `/apply/[token]` not yet written
- Public form submit does not run full email dedup (`assertNoDuplicateEmailsInOrg`)

---

## 14. Master terminology index

| Internal / code | Also called | Meaning |
|-----------------|-------------|---------|
| `pipeline` | File, deal file | Primary deal row |
| `dealData` | Deal workspace payload | Intake-shaped JSON on pipeline |
| `fileSharedState` | Data bus | Canonical cross-block numbers/text |
| `fileDrawerLayout` | Drawer layout | Block order/hidden/expanded/settings |
| `PIPELINE_BLOCK_IDS` | Block id | Canonical drawer block set |
| `contactFileLinks` | File-contact link | Many-to-many with role/relationship |
| `clients` | Entity, business entity | Canonical LLC/corp store |
| `intakeForms` | Form template | Stage 2 composer definition |
| `intakeFormLinks` | Apply link | Tokenized public URL row |
| `shareLinks` | Share link | Legacy intake **section** sharing |
| `organizationId` | Org, tenant | Multi-tenant scope |
| `userKey` / `memberUserKey` | Member identity | Session + Convex org checks |
| `[data-pipeline-workspace-scroll]` | Workspace scroller | File route vertical scroll owner |

Full index: `docs/project-intelligence-summary.md` §11.

---

## 15. Elevator pitch (for target team)

> Build **Direct Lending Connection**: a Next.js 15 + Convex + Vercel broker workspace where every deal is a **pipeline file** with modular blocks, real-time deal data, lender shopping, CRM contacts, Eisenhower tasks with org triage labels, document vault, client portal, and registry-driven external intake forms. Enforce **single scroll ownership**, **org-scoped multi-tenancy**, and a **declarative block registry**. The file workspace is the product center; everything else links into it.

---

*End of complete project migration prompt.*
