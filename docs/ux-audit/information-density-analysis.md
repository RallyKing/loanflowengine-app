# Information Density Analysis — Direct Lending Connection

**Users:** Brokerage operators managing **many** files, **high** message volume, **frequent** stage and lender changes.  
**Tension:** Density vs calm (fintech trust) vs mobile thumb reach.

---

## 1. Current density profile

| Surface | Density character | Notes |
|---------|-------------------|-------|
| **Pipeline hub** | High (table) | Good for scan; poor on narrow without column discipline |
| **File workspace — utilities** | Low by default (collapsed) | **Correct** progressive disclosure per `ui-ux-rules.md` |
| **File workspace — blocks** | Variable | Registry blocks differ; some **expand to very tall** stacks |
| **Tasks matrix** | High | Eisenhower grid — cognitive load **inherent**; mitigate with filters and chunking |
| **Lenders table** | High | Directory scale needs filters + column sanity |
| **Contacts** | Medium–high | Activity + fields — watch duplicate chrome |

---

## 2. Chaotic vs intentional whitespace

**Intentional:**

- Collapsed utilities on file.  
- Card padding from shared shells (`pipelineWorkspaceSurfaceShell`, `WorkspaceContentContainer`).

**Risk / chaotic:**

- **Multiple** “headers” in one viewport (app chrome + file chrome + block titles + insights strip).  
- **Over-expanded** drawer blocks by default on new files (layout template issue).  
- **Stage + scenario + lenders** all competing for “above the fold” on laptop — hierarchy depends on deal phase but UI doesn’t **adapt** by phase yet.

---

## 3. Hidden critical data

| Data | Where it should surface | Risk |
|------|-------------------------|------|
| **Chosen lender** | Already prioritized in product copy / block order | Keep visible in **compact** file chrome row |
| **Economics** (amount, rate) | `fileSharedState` | Ensure **compact** mode doesn’t hide **only** copy of funding |
| **Snooze / archive** | Badges in chrome | Good |
| **Override vs shared** field source | `FieldSyncIndicator` | Operators must understand — **supporting text** consistency |

---

## 4. Chrome vs content ratio

**Mobile file route:** Snap compact reduces sheet height — **reduces chrome** mechanically.  
**Desktop file route:** Full chrome + wide blocks — can feel **admin-heavy** if every block expanded.

**Recommendation:** **Layout presets:** “Sales motion” (scenario + lenders up), “Processing” (documents + tasks up), “Executive” (insights + economics only). Persist per user or org.

---

## 5. Progressive disclosure opportunities

| Instead of full render | Use |
|------------------------|-----|
| Long lender sub-panels | **Summary card** + “View details” side sheet |
| Full contact profile embedded | **Link preview** + side sheet |
| Long activity feed | **Last N** + “Open full activity” |

---

## 6. Where compact operational modes are needed

1. **Pipeline hub:** density toggle (comfortable / compact rows).  
2. **File workspace desktop:** “Focus blocks” mode (hide utilities + collapse non-pinned blocks).  
3. **Tasks:** high-density row option for power users.

---

## 7. Snap sheets vs modals (density lens)

- **Snap sheet:** vertical real estate **without** losing **where** you are (file context preserved) — **better** than full-screen modal for **filters** and **secondary** tools on mobile.  
- **Modal:** confirm destructive, short forms, legal — keep **narrow** and **short**.

---

## Prioritization

| Class | Item |
|-------|------|
| High | Phase-aware default block expansion; hub row density |
| Medium | Summary + side sheet pattern for lender/contact drilldown |
| Low | User preference “compact tables” global toggle |

---

*See: `common-user-flow-optimization.md`, `side-sheet-conversion-opportunities.md`.*
