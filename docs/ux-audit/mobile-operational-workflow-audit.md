# Mobile Operational Workflow Audit — Direct Lending Connection

**Lens:** Mobile must be **operationally productive**, not merely **responsive**. Benchmark: modern banking apps + Attio/HubSpot mobile record views + Linear mobile triage.

**Architecture facts (current):**  
- Signed-in shell: locked `body`, primary scroll on `AppChrome` `<main>` for most routes (`AGENTS.md`).  
- Pipeline **file** route: **delegated** scroll `[data-pipeline-workspace-scroll]`, mobile **Vaul** top sheet with snap points (`PipelineWorkspaceMobileVaulFrame.tsx`, `docs/workspace-sheet-mobile-rules.md`).  
- **MobileChromeController:** compact / focus modes; bottom nav may hide in focus mode.  
- **Touch:** `touch-scroll-y`, safe-area padding on workspace scroller and headers.

---

## 1. Thumb ergonomics & reach

| Workflow | Assessment | Risk |
|----------|------------|------|
| **Primary actions** on file (stage, attach lender, message) | Often in chrome + blocks | On small snap compact states, **confirm** destructive/secondary actions don’t crowd **primary** lane (thumb triangle) |
| **Back to pipeline** | Chevron / app compact header | OK; **confirm** deep link entry still exposes clear “exit” |
| **Task creation from file** | Task drawer overlay | Drawer is correct pattern; **confirm** first field focuses without keyboard obscuring CTAs (iOS) |

**Recommendation:** Define **thumb-priority zones** for file chrome (bottom third = highest-value actions or scroll affordances).

---

## 2. One-handed usage

| Pattern | Status |
|---------|--------|
| **Snap sheet** resize | Vaul handle — good for discoverability; reduced-motion path uses `handleOnly={false}` — watch conflict with scroll |
| **Bottom nav** | Hidden in focus mode — **tradeoff:** faster reading vs slower global jump; ensure **long-press or overflow** doesn’t become only path to Tasks |
| **File switcher** | Dropdown in chrome — on narrow width, **native-feeling** sheet picker may reduce error |

---

## 3. Scrolling continuity

| Surface | Contract |
|---------|----------|
| **Hub / lists** | `<main>` scroll |
| **File workspace** | Single workspace scroller — **correct** (no double scroll) |
| **Drawer internals** | Bounded `overflow-y` — **correct** |

**Risk:** Nested **horizontal** tables inside vertical workspace scroll — ensure `touch-pan-x` strips don’t trap vertical intent (already policy in scroll docs).

---

## 4. Compact chrome & snap

| State | Purpose |
|-------|---------|
| **App master chrome** compact | Reading focus |
| **File chrome** compact | Via snap **or** scroll-linked fallback on desktop |  
| **Vaul snap** compact / comfort / expanded | Operational vertical real estate |

**Gap:** Two independent compacts (app vs file) can **desynchronize** user mental model. **Recommendation:** Document **expected combinations** (e.g. file expanded + app compact when reading blocks).

---

## 5. Safe areas & keyboard

| Topic | Audit action |
|-------|--------------|
| **Safe area** | Workspace scroller uses bottom padding for nav + home indicator — verify against **notch** devices in QA |
| **Keyboard** | Vaul `repositionInputs` on — good; verify **inline deal fields** at bottom of long blocks don’t fight keyboard |
| **Orientation** | Tablet landscape: file workspace should feel **two-column** where block system allows |

---

## 6. Touch targets

**Policy:** `--dlc-touch-target-min: 44px` in `globals.css`.  
**Audit:** Spot-check **inline** icon buttons in dense blocks (lender rows, task rows) for **44px** hit slop.

---

## 7. Table usability on mobile

**Pipeline hub table:** horizontal pan — correct for vertical scroll ownership.  
**Risk:** **Scanning** columns (stage, amount) on very narrow widths — consider **card fallback** or **frozen first column** pattern (product decision).

---

## 8. Verdict: operational vs responsive?

**Trend:** File route is **moving toward true operational mobile** (delegated scroll + snap sheet).  
**Remaining gap:** **Hub** and **lenders directory** still feel “desktop CRM compressed” unless card/table hybrid and **saved compact views** land.

---

## Prioritization (mobile)

| Priority | Item |
|----------|------|
| Critical | Keyboard + snap interaction conflicts; touch target audit on money actions |
| High | File switcher UX on phone; hub scanning |
| Medium | Tablet parallel column layout presets |
| Low | Optional “always show bottom nav” user setting |

---

*See: `workspace-architecture-review.md`, `snap-sheet-conversion-opportunities.md`, `performance-scalability-risk-report.md`.*
