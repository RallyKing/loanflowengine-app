# UX Audit — Navigation Psychology (Phase 17.5)

**Mode:** READ-ONLY  
**Canonical:** `lib/navigation/navigationCatalog.ts`, `AppChrome.tsx`, `SaasSidebar.tsx`, `MobileBottomNav.tsx`, `MainNav.tsx`, `ResponsiveNavProvider.tsx`, `TabletContextNav.tsx`

---

## 1. Global vs local vs contextual

| Element | Feels | Should be |
|---------|-------|-----------|
| SaaS sidebar / unified rail | **Global** | Global — OK |
| Mobile bottom nav (4 slots) | **Global** | Global — OK |
| Settings in mobile primary | **Global** | **Contextual** or demoted — operational friction |
| Pipeline sub-nav (analytics, ledger) | **Global pipeline zone** | Contextual under Pipeline hub |
| `PipelineHubProjectionSwitcher` | **Local hub** | Local — OK but visually competes with global nav |
| File workspace overflow | **Local file** | Local — good post-17.3 |
| Breadcrumb | **Local hierarchy** | Local — expand to hub |
| ⌘K search | **Global wayfinding** | Global — OK |
| Task drawer | **Local overlay** | Contextual — OK |
| Product tour / help | **Global interrupt** | Deferred / low priority slot |

---

## 2. What belongs in drawers vs overflow

| Action | Current | Recommendation |
|--------|---------|----------------|
| File archive/delete | Header overflow | Keep |
| Hub density/analyst | Toolbar visible | Overflow on mobile |
| Create client/project/file | Hub toolbar + dialogs | FAB or single create menu |
| Nav settings override | Settings app | Keep in settings |
| Sharing invite | Section + sometimes header | Drawer section only |
| Lender add | Lenders page + file block | Contextual entry per route |

---

## 3. Navigation redundancy

| Duplicate | Paths |
|-----------|-------|
| Pipeline entry | Sidebar, bottom nav, `PIPELINE_SUB_ITEMS`, mobile pipeline zone |
| Tasks | Nav + hub task projection + notifications |
| Lenders | Nav + lender projection + file lenders |
| Settings | Sidebar, mobile primary, header gear links on hub |
| Responsive full-screen nav sheet | Overlaps sidebar on tablet |

**Redundancy score:** **7** major duplicate entry patterns.

---

## 4. Hidden critical actions

- **Events** not on mobile primary — acceptable if infrequent; risks discoverability.
- **Shared** workspace — no mobile primary — power feature, OK.
- **Hierarchy create** — behind hub toolbar / dialogs — not obvious on first visit.
- **Board view** — hidden when `narrow` — users on small tablets lose board without explanation.

---

## 5. Overloaded top bars

| Bar | Load |
|-----|------|
| `PipelinePageClient` | **Critical** — highest in app |
| `AppChrome` master header | Medium — compression helps |
| `EventDetailClient` | Reduced post-17.3 |
| `tasks/page.tsx` filter header | High |

---

## 6. Mobile navigation collapse risks

- Bottom nav hides in **focus mode** — good for content; users may forget how to exit.
- Inspector sheet + bottom nav z-order — normalized in 17.1.
- **Safe-area** on inspector improved 17.4; bottom nav still verify `pb-safe`.
- Pipeline hub toolbar wraps to 2–3 rows on iPhone — **cognitive stack** before content.

---

## Sidebar structure (groups)

| Group | Items | Mental model |
|-------|-------|--------------|
| workspace | Tasks, Events, Documents, Operations, Shared, Activity | **Mixed** — not one workflow |
| pipeline | Pipeline + sub-items | Coherent |
| crm | Contacts, Lenders | Coherent |
| system | Settings | Coherent |

**Recommendation:** Regroup workspace nav into **Work** (tasks, pipeline file shortcuts) vs **Intel** (activity, operations, analytics).

---

## Phase 18 navigation priorities

1. Demote Settings from mobile primary → overflow or profile menu.
2. Pipeline zone sub-nav as **contextual tabs** inside `/pipeline` only.
3. Single **Create** entry on hub.
4. Tablet: expose board toggle with explanation when hidden.
5. Reduce responsive nav sheet duplication with sidebar.
