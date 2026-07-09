# Mobile Operations Audit — v2

**Standard:** Workflows are **mobile-operational** only if they meet **thumb ergonomics**, **scroll continuity**, **predictable overlays**, and **keyboard viability** without **context loss** — not merely “responsive.”

---

## 1. Platform posture

| Route class | Scroll owner | Mobile ops rating |
|-------------|--------------|-------------------|
| **Default** | `AppChrome` `<main>` | **Operational** for list hubs if tables pan correctly |
| **Pipeline file** | `[data-pipeline-workspace-scroll]` + Vaul snap (`PipelineWorkspaceMobileVaulFrame`) | **Leading** — true sheet semantics |
| **Drawers** | Internal `overflow-y` | **Operational** if bounded and focus-safe |

---

## 2. iPhone ergonomics

| Check | Status | Gap |
|-------|--------|-----|
| **Thumb reach** | File actions mid/upper | Add **bottom** action bar for 2–3 primaries optional |
| **Safe area** | Partially addressed | Verify all sheets |
| **Dynamic Island** | — | Avoid critical CTAs under sensor housing |

---

## 3. Android ergonomics

| Check | Gap |
|-------|-----|
| **Back gesture** | Must predict drawer dismiss vs nav back — test |
| **Gboard** | IME + Vaul — test |
| **Overscroll** | `overscroll-contain` on owners — good |

---

## 4. Tablet

| Mode | Issue |
|------|-------|
| **Portrait** | Same as large phone — OK |
| **Landscape** | **Under-used** horizontal space — not yet operational CRM split |

---

## 5. Keyboard workflows

| Flow | Risk |
|------|------|
| **Inline edit** bottom of block | Obscured |
| **Task drawer** first field | Must scroll into view |
| **Scenario** numeric | Decimal keyboards |

---

## 6. Thumb reach map (file)

| Zone | Appropriate controls |
|------|---------------------|
| **Bottom** | Scroll, primary FAB (if adopted), nav |
| **Mid** | Stage, chips |
| **Top** | Back, switcher — acceptable |

---

## 7. Multi-step workflows

| Workflow | Continuity |
|----------|------------|
| **Attach lender** | Search → pick → confirm — **sheet** better than stack modals |
| **Portal invite** | **Wizard** or **stepper** on mobile |

---

## 8. Scroll continuity

| Risk | Mitigation |
|------|------------|
| **Double scroll** | Governance |
| **Horizontal table** trap | `touch-pan-x` |

---

## 9. Nested scroll detection (review checklist)

- [ ] No `overflow-y-auto` inside workspace scroller except **bounded** `max-h-*` regions  
- [ ] Drawer only **one** main vertical scroller  
- [ ] Messaging: separate inner scroll — **document** as exception

---

## 10. Snap continuity

| Check |
|-------|
| Identity visible at min snap |
| No **orphan** scroll when moving between snaps |

---

## 11. Bottom-nav utility

| Tradeoff | Recommendation |
|----------|----------------|
| Hidden in focus mode | **Long-press** app menu or **edge swipe** for tasks — evaluate |

---

## 12. File workflow continuity

**Strong** due to delegated scroll + snap.  
**Risk:** Opening **task drawer** feels like **new page** — subtitle must show file.

---

## 13. Pipeline hub usability

| Issue | Classification |
|-------|----------------|
| **Table** on 390px | **Responsive** but **not fully operational** — needs **card** toggle |

---

## 14. Table usability (mobile)

- **Frozen column** or **card** for primary fields.  
- **Sticky header** inside **main** scroll for hub — already pattern; verify **height**.

---

## 15. Task workflows

| Path | Ops quality |
|------|-------------|
| **Tasks app** | Good matrix — dense |
| **File → task** | Drawer — good if unified inspector |

---

## 16. Messaging

| Risk | **Operational?** |
|------|------------------|
| Nested scroll | **Marginal** — snap sheet target |

---

## 17. Documents

| Risk | **Operational?** |
|------|------------------|
| Preview | **Marginal** — memory + gestures |

---

## 18. Classification summary

| Truly mobile-operational today | Mostly responsive (needs work) |
|-------------------------------|--------------------------------|
| File workspace (post sheet) | Pipeline hub table |
| Task drawer (bounded) | Lenders directory density |
| Settings (scroll) | Scenario editor |
| | Documents preview |

---

## 19. Breaks under pressure

| Stress | Failure |
|--------|---------|
| **Many tasks** | Matrix scroll + render |
| **Many files** | Hub DOM |
| **Rapid snap** | Momentum + IO compact desync |

---

## 20. Frustration at scale

- **File switcher** in long org list.  
- **Global search** without scope.  
- **Automation** mystery changes.

---

*See: `snap-sheet-master-plan.md`, `performance-scale-ux-report.md`, `master-enterprise-modernization-report.md`.*
