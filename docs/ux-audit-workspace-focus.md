# UX Audit — Workspace Focus (Phase 17.5)

**Mode:** READ-ONLY  
**Question:** Does the product feel reactive/noisy/crowded/fragmented vs focused/layered/contextual/calm/fluid/intentional?

## Current posture (weighted)

| Pole | Strength | Evidence |
|------|----------|----------|
| Reactive | **Medium** | Notifications, task matrix, activity feed compete for attention |
| Noisy | **Medium–High** | Hub toolbar, badges, stage chips |
| Crowded | **High** on hub/table; **Medium** on file (improved 17.3) |
| Fragmented | **Medium** | Projection/table/board/hierarchy multiplicity |
| Focused | **Medium** on file workspace when utilities collapsed |
| Layered | **Low–Medium** | Disclosure headers help; blocks still flat list |
| Contextual | **Low** on hub; **Medium** on file/inspector |
| Calm | **Low** hub; **Medium** file |
| Fluid | **Medium** | Real-time Convex; mode switches abrupt |
| Intentional | **Medium** | Governance/docs strong; UI still admin-first |

**Summary:** Platform is transitioning from **dense admin** toward **cockpit** on **file route only**; hub and legacy CRM routes remain admin-dense.

---

## Focus preservation

| Workspace | Focus preserved? | Interruptors |
|-----------|------------------|----------------|
| File workspace | **Yes** when utilities collapsed + focus mode | Inspectors, toasts, presence |
| Pipeline hub | **No** — always-on filters | Bulk bar, stage chips |
| Tasks matrix | **Partial** | Notifications, grouping chrome |
| Events | **Yes** on detail | Inbox tabs |
| Lenders | **Partial** | Sticky filters |
| Settings | N/A | — |

---

## Interruption frequency

| Interruption | Frequency |
|--------------|-----------|
| `UserNotificationsBell` | High |
| Product tour / help | Low–medium |
| `ResourceAccessBanner` | When permissions limited — good |
| Impersonation banner | Admin only |
| Occupancy conflict callout | Collaborative edit |
| Event toasts | Medium on events route |

---

## Visual tension

- Competing sticky layers on hub (header + stage strip).
- Primary buttons adjacent to 5+ secondary icon buttons on pre-17.3 surfaces — **reduced** on file header.
- Momentum stars + task badges + stage on one row — **high tension**.

---

## Always-visible controls → candidates

| Control | Recommendation |
|---------|----------------|
| Hub analyst density toggles | Settings / overflow |
| Capital stack / involvement filters | Advanced filter drawer |
| Utility actions on file (pre-17.3 rail) | **Done** — overflow |
| Stage chips (all stages) | Collapse to “Stages ▾” |
| Table columns (analyst) | Column picker hidden default |
| Sharing invite form | Collapse |
| Task drawer secondary sections | Collapsed default |

---

## Cockpit transformation gap

**Cockpit qualities needed:**

1. **One primary action per screen** — hub violates.
2. **Context strip** — missing on hub.
3. **Progressive depth** — file workspace closest match.
4. **Calm defaults** — utilities collapsed (file yes); hub filters no.

**Target state:** File workspace pattern **exported** to hub (orientation + disclosure + overflow).
