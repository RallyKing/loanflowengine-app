# Alerts system — Phase 0 audit (2026-10-08)

**Repo:** RallyKing/loanflowengine-app  
**Branch audited:** `main` @ `83bee00` (worktree `lfe-vault-excel-preview`)  
**App:** `lender-app/`  
**Convex prod:** `basic-anaconda-984`  
**Vercel prod:** https://www.paperworkprocessing.com  

**Scope:** Read-only discovery before any Alerts product code.  
**Hard rules for Phase 1+:** no polling; no idle `runAfter(0, self)` pumps; no unbounded `.collect()`; cron ≥ 15 minutes if used; never weaken auth/RBAC/tokens; **do not replace or change behavior** of `userNotifications`, `activityFeed`, or `deadlineDigest`.

---

## 0. Executive findings

| Topic | Finding |
|-------|---------|
| File snooze | `pipeline.snoozedUntil` (ISO preferred / legacy ms). Lazy wake — **no scheduler today**. |
| Task due | Hub/`pipeline`-linked: `tasks.dueDate` (Unix ms). Vault: `documentVaultFileTasks.dueDate`. Templates prefer `dueOffsetDays`. |
| Existing “Alerts” UI | `UserNotificationsBell` already labeled Alerts; backed by **`userNotifications`**. New system must be a **separate** table + UI. |
| Activity feed | `activityFeed` + `/activity` — leave untouched. |
| Web Push | **Not implemented on `main`.** No VAPID, subscription table, or push allowlist. `document_activity` is an **in-app/email** preference category only. |
| Deadline overlap | Daily cron `notifications.deadlineDigest` already creates `userNotifications` category `deadline` for **assignees**. New Alerts are one-shot at exact `fireAt` for the user who **set** the due/snooze — complementary, not a replacement. |
| Recipient gap | File snooze does **not** store who snoozed. Task due does not store who last set `dueDate`. Phase 1 must add scheduling metadata on source rows (see §7). |

---

## 1. File snooze

### 1.1 Storage

| Item | Value |
|------|--------|
| Table | `pipeline` |
| Field | `snoozedUntil` |
| Validator | `v.optional(v.union(v.string(), v.number()))` |
| Schema | `convex/schema.ts` ~1923–1928 |

New writes store **UTC ISO 8601** via `pipeline.snooze`. Legacy Unix ms still readable.

**Not on** `documentVaultFileTasks` (vault file-tasks have no snooze field).

Related but out of scope for “file snooze” alerts:

- Hub `tasks.snoozedUntil` (task snooze, separate product)
- `userNotifications.snoozedUntil` (inbox snooze on notifications)

### 1.2 Mutations

| Mutation | File | Behavior |
|----------|------|----------|
| `pipeline.snooze` | `convex/pipeline.ts` ~2878–2908 | Parse ms; if `<= now` → clear; else patch ISO |
| `pipeline.unsnooze` | `convex/pipeline.ts` ~2914–2925 | Patch `snoozedUntil: undefined` |

Auth: `assertCanMutatePipelineRow` with `preferencesAccountId`.

### 1.3 Timezone

| Layer | Behavior |
|-------|----------|
| UI | Local calendar **end of day** `23:59:59.999` — `lib/pipelineSnooze.ts` (`endOfLocalCalendarDayMs`); presets tomorrow / +7d |
| Persist | Server → `new Date(ms).toISOString()` |
| Display / filter | `isCurrentlySnoozed` vs triage clock / `Date.now()` — no IANA field on the row |

### 1.4 Unsnooze / wake today

1. Explicit `unsnooze` or picker clear.  
2. Writing a past/non-future snooze clears the field.  
3. **Lazy auto-wake (no DB write):** when `snoozedUntil <= now`, hub treats file as visible again; expired value may remain until cleared.  
4. **No cron / scheduler** for snooze wake (`convex/crons.ts` has no snooze job).

### 1.5 Alert implications

- Schedule one-shot at parsed `fireAt = Date.parse(snoozedUntil)`.  
- Fire handler must re-read row: still snoozed **and** fire instant still matches (within equality of stored ISO/ms).  
- On unsnooze / clear / reschedule: cancel prior `ScheduledFunction` id.  
- **Who gets the alert:** not stored today → add `snoozeAlertUserKey` (or equivalent) at schedule time from authenticated actor (`preferencesAccountId` / session userKey). Default recommendation: alert the user who **set** the snooze (matches “the user” in the product brief). Optionally also notify `pipeline.assigneeId` / `ownerUserKey` in a later category — **out of v1**.

---

## 2. Task due dates

### 2.1 Hub / pipeline-linked tasks (`tasks`)

| Item | Value |
|------|--------|
| Field | `dueDate: v.optional(v.number())` — Unix ms |
| Index | `by_dueDate` |
| Link to file | `relatedFileId: v.optional(v.id("pipeline"))` |
| Assignee | `assigneeId` (string user key) |
| Task snooze | `snoozedUntil` (ms) — separate from due |

**Set / clear:** `tasks.create`, `tasks.update` (`null` → clear), recurrence on `tasks.complete` may spawn next due.  
**Complete:** `status: "done"` + `completedAt` — due field usually kept.  
**Delete:** `tasks.remove` hard-deletes subtree.

**Timezone:** UI writes local midnight via `InlineDate` / date inputs; digest labels use UTC date slice.

**Existing digest (do not alter):** `notifications.deadlineDigest` (`crons.ts` daily 14:00 UTC) → `userNotifications` category `deadline` for **assignees**, horizon overdue→+2d, `.take(2000)`, dedupe `deadline:{taskId}:{digestDay}`.

### 2.2 Vault file-tasks (`documentVaultFileTasks`)

| Item | Value |
|------|--------|
| Field | `dueDate: v.optional(v.number())` |
| Template | `documentTaskTemplates.dueOffsetDays` preferred; legacy absolute `dueDate` |
| Inject | `resolveTemplateDueDate` → `appliedAt + offset * MS_PER_DAY` |

Mutations: `createWithConfig`, `updateTaskConfig` (`dueDate: null` clears), `injectTemplates`.  
Complete paths keep `dueDate`. Delete/archive: hard delete / soft archive.

### 2.3 “Pipeline tasks” in UI

File Tasks / triage blocks are **`tasks` rows** with `relatedFileId`, not vault rows. Same due field and mutations as §2.1.

### 2.4 Alert implications (task_due)

| Source | Entity type | Deep link |
|--------|-------------|-----------|
| `tasks` | `task` | `/tasks?task={id}` (drawer); if `relatedFileId`, optional `/pipeline/{fileId}` + local drawer later |
| `documentVaultFileTasks` | `vault_file_task` | `pipelineDealEditorHref(fileId, { tab: "documents" })` (+ task id in path/query if we add one) |

**Recipient (v1):** user who **set or last changed** `dueDate` (actor at schedule time), per product brief — **not** necessarily the assignee (digest already covers assignees). Store `dueAlertUserKey` + `dueAlertJobId` on the source row.  
**Validity on fire:** task still exists; not done/archived; `dueDate` still equals scheduled fireAt (same ms); for hub tasks also skip if task-snoozed past fire? Recommendation: still fire due alert if due instant arrived even if task snoozed (due ≠ snooze); document choice in PR1.  
**Cancel when:** due cleared, due changed, task completed/deleted (and vault archive/delete).

---

## 3. Existing notification & activity surfaces (do not replace)

### 3.1 `userNotifications` (current Alerts bell)

Schema ~2530–2577: categories include `task_assignment`, `deadline`, `document_activity`, etc.  
Indexes: `by_user_created`, `by_user_dedupe`, `by_task`, `by_file`.  
Dispatch: `dispatchUserNotification` in `convex/notifications.ts` (prefs → insert → optional email).  
UI: `components/UserNotificationsBell.tsx` — test ids `notifications-bell` / `notifications-inbox-panel`; `PortalOverlayPanel` + `CHROME_MENU`.  
Deep links: `lib/notifications/notificationDeepLink.ts`.

### 3.2 `taskNotifications` (legacy)

Assignment-only; unified bell uses `userNotifications`.

### 3.3 `activityFeed`

Org/user scoped feed; page `/activity`; writers in `convex/activityFeed.ts`. Separate from Alerts.

### 3.4 Preferences today

`lib/notificationPreferences.ts` — per-category **inApp + email** under `userPreferences.behaviorSettings`. Includes `document_activity`. **No push toggles.**

---

## 4. Web Push (gap vs brief)

| Expected (brief) | On `main` @ 83bee00 |
|------------------|---------------------|
| Subscription table | **Absent** |
| VAPID / web-push sender | **Absent** |
| Allowlist `document_activity` only | **N/A** — `document_activity` is in-app/email only |
| SW `push` handler | `public/sw.js` — install/activate/fetch only |

**Closest desktop notify:** Browser `Notification` API when unread count rises (`UserNotificationsBell` ~171–184) — client-only, not Web Push.

**Phase 3 plan:** Keep `alertPreferences.*.push` boolean in schema; wire sender **only if** Web Push lands (or behind a no-op stub that never widens any allowlist). Do **not** invent a second push stack that races a future document_activity allowlist. Until push exists, preference `push: true` is stored but send is a no-op with structured log.

---

## 5. Header / nav mount points

`components/AppChrome.tsx` — `data-testid="master-header-actions"`:

1. Search / Help / HardRefresh / ColorScheme / Settings  
2. LiveConnectionPill  
3. **`ProductUpdatesBellSafe`** then **`UserNotificationsBell`** (when `notifyUserKey`)  
4. UserButton  

Pipeline file route uses a reduced shell (no master bells).

**Mount for new Alerts:** Adjacent to existing bells (recommend **left of** `UserNotificationsBell` to avoid confusion). Naming:

| Surface | Label | Icon | Test id |
|---------|-------|------|---------|
| Existing | Keep current copy (“Alerts” / notifications) | Bell | `notifications-bell` |
| New | **“Reminders”** or **“Time alerts”** in UI chrome; settings section **“Alerts”** as brief specifies | `AlarmClock` / `BellRing` | `time-alerts-bell` |

Avoid two identical “Alerts” labels. Product copy decision in PR2.

Also mounted on tasks page: second `UserNotificationsBell` with `onOpenTask` — new Reminder bell should support the same optional callback.

---

## 6. Deep-link route patterns

| Entity | Pattern | Notes |
|--------|---------|-------|
| Pipeline file | `/pipeline/{fileId}` | Optional `?tab=documents&document=` via `pipelineDealEditorHref` |
| Hub task | `/tasks?task={taskId}` | Opens drawer on tasks page |
| File-scoped task drawer | Local state in `PipelineFileWorkspace` — **no URL today** | Deep link → `/tasks?task=` or file URL; opening drawer on file page is enhancement |
| Contacts | `/contacts/{id}` | N/A for v1 categories |
| Lenders | `/lenders?lender=` | N/A for v1 |
| Vault file-task | File + documents tab | Prefer file deep link; include vault task id in `deepLinkPath` query if we add `?vaultTask=` later |

**Security:** Validate `deepLinkPath` is internal-only (`/` + no `//`, no `http:`, no scheme). Helper e.g. `assertInternalAppPath` used at write and click.

---

## 7. Proposed data model (Phase 1 — implement after this audit)

### 7.1 `alerts`

| Field | Notes |
|-------|--------|
| `userId` | Session user key string (match `userNotifications.userKey` convention) **or** Convex `users` id — **decide in PR1 to match auth helper used elsewhere** |
| `orgId` | Org scope for isolation |
| `category` | `"file_snooze_due" \| "task_due"` (+ room for more via union growth) |
| `title`, `body` | Display |
| `entityType`, `entityId` | Discriminated source |
| `deepLinkPath` | Internal path only |
| `fireAt`, `createdAt` | ms |
| `readAt?`, `dismissedAt?` | |
| `dedupeKey` | Unique per user + category + entity + fireAt |
| Optional: `hiddenUntil?` | Per-row alert snooze |

**Indexes (as brief):**

- `by_user_unread` → `[userId, readAt, fireAt]` — note: Convex optional `readAt` indexing: unread rows typically use `readAt` absent; confirm pattern used elsewhere or use `readState: "unread"|"read"` for reliable index prefix.  
- `by_user_created` → `[userId, createdAt]`  
- `by_dedupeKey` → `[dedupeKey]` (or `[userId, dedupeKey]` if keys are not globally unique)

**Cheap unread badge:** `.withIndex("by_user_unread").take(100)` → display `n` or `99+`; never `.collect()` org-wide.

### 7.2 `alertPreferences`

`userId` + per-category `{ inApp: boolean, push: boolean }`.  
Defaults: **inApp on, push off** for all categories.

### 7.3 Source-row scheduling fields (additive)

| Table | Fields |
|-------|--------|
| `pipeline` | `snoozeAlertJobId?: Id<"_scheduled_functions">`, `snoozeAlertUserKey?: string`, `snoozeAlertFireAt?: number` |
| `tasks` | `dueAlertJobId?`, `dueAlertUserKey?`, `dueAlertFireAt?` |
| `documentVaultFileTasks` | same due alert fields |

Cancel via `ctx.scheduler.cancel(jobId)` when date changes/clears or task completes/deletes.

### 7.4 Triggering

1. On set/change → cancel old job → `ctx.scheduler.runAt(fireAt, internal.alerts.fire*, { entityId, fireAt, userKey, orgId, dedupeKey })`.  
2. Fire handler: re-read source; validate; check prefs; insert alert if `dedupeKey` absent; optional push no-op until Web Push exists.  
3. Backfill: **one** bounded paginated internal mutation (cursor + `.take(N)`), schedule future + one-shot for already-past; never re-fire past via pump.  
4. Optional safety-net cron: **hourly max** (≥ 15m floor), index range on `fireAt`/source fields, `.take()`, idempotent — register in `resource-consumption-policy.md` cron table in same PR.

**Do not** change snooze visibility semantics or task complete/due UX beyond scheduling hooks.

---

## 8. UI patterns to match

| Pattern | Location | Tokens / notes |
|---------|----------|----------------|
| Existing notifications panel | `UserNotificationsBell` + `PortalOverlayPanel` | `operationalOverlayDropdownClass`, outline `Button` `h-11`, badge `bg-destructive` |
| Tip card | `ContextualQuickTip` | Corner card, `shellZIndexStyle("contextualTip")`, amber chip |
| Operational toasts | `OperationalToast` / `OP_TOAST_*` | `rounded-dlc-md`, DLC surfaces |
| Report-a-bug | **Not on `main`** | Present on branch `cursor/lfe-report-bug-848a` (`ReportBugMount` + `OverlayShell`). Prefer matching `PortalOverlayPanel` / DLC drawer patterns already on `main`. Mobile: Vaul / modal per UI rules — reuse existing overlay shell if available. |

Settings: new **Alerts** section near notification prefs (`settings` panels that edit `behaviorSettings` / dedicated `alertPreferences` mutations).

---

## 9. Security checklist (Phase 1+)

- [ ] Every public query/mutation: auth + `userId`/`userKey` from identity; never trust client-supplied owner.  
- [ ] Org isolation on list/count.  
- [ ] Cannot mark/read/dismiss another user’s alerts.  
- [ ] `deepLinkPath` internal-only validation.  
- [ ] Internal fire handlers: no public schedule of `api.*`; schedule `internal.*` only.  
- [ ] Push (when built): gated by `alertPreferences` + never widen document_activity allowlist without opt-in.

---

## 10. Test plan (Phase 1–3)

**Unit (Convex / pure helpers):**

- Schedule / reschedule / cancel on change, clear, complete, delete  
- Fire validity reject paths  
- DedupeKey idempotency  
- Preferences off → no insert  
- Internal path validator  

**E2E (Playwright or existing smoke harness):**

- Set task due + file snooze ~1 minute out  
- Bell badge increments  
- Deep link opens correct task/file  
- Mark read + hide  

**Load-check:** fire paths idle 60s → zero new calls; badge query stable args; no shell-wide heavy subscription beyond capped unread count.

---

## 11. PR slicing (reviewable)

| PR | Contents | Ship gate |
|----|----------|-----------|
| **A — Data + backend** | Schema `alerts` + `alertPreferences`; source-row job fields; schedule/cancel hooks on snooze + due mutations; fire handlers; backfill; unit tests; optional hourly safety cron + policy registry | `verify:resource-safety` + Bugbot + security + agent; fail closed on Critical; then deploy Convex |
| **B — UI** | Reminder bell, panel (tabs, multi-select, mark read/hide, show hidden), deep links, skeletons/empty/error, a11y | Same reviews; deploy Vercel |
| **C — Settings + push gate** | Alerts settings toggles; push preference persistence; no-op or real push if infra exists | Same reviews; deploy |

---

## 12. Explicit non-goals (v1)

- Replacing `UserNotificationsBell` / `deadlineDigest` / activity feed  
- Changing lazy file snooze visibility  
- Web Push infrastructure greenfield (unless already merged elsewhere before PR C)  
- Alerting every org member on every snooze  
- Event `dueAt` / errand surfaces  

---

## 13. Open decisions (resolve in PR A description)

1. **Identity key:** `userKey` string (match notifications) vs `Id<"users">` — recommend **userKey** for consistency with `userNotifications`.  
2. **Unread index:** optional `readAt` vs explicit `readState` literal for reliable `by_user_unread`.  
3. **Vault task deep link:** file-only vs new query param.  
4. **Chrome label:** “Reminders” vs “Time alerts” next to existing Alerts bell.  
5. **Past-due backfill:** one alert at backfill time with `fireAt = dueDate` (even if past) — per brief.

---

*End of Phase 0 audit. No product code in this document’s commit set beyond this file.*
