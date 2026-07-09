# Final targeted root cause ranking — pipeline mobile scroll jump

**Diagnostic only.** Likelihood = **subjective posterior** from static code forensics + known WebKit scroll behavior (not A/B measured). Scores are **independent** and need not sum to 100%.

**Scale:** Likelihood / severity **0–10**; fix complexity **1–5** (1 = surgical CSS, 5 = architecture).

---

## R1 — Concurrent layout transitions after compact flip

| Field | Value |
|-------|--------|
| **Likelihood** | **9/10** |
| **Severity** | **9/10** |
| **Fix complexity** | **4/5** |
| **Files** | `mobileCompactChrome.ts`, `AppChrome.tsx`, `PipelineFileWorkspaceShell.tsx` |
| **State** | `compactChrome` in `MobileChromeController.tsx` |
| **Hooks** | Context consumers rerender; IO callback L121–124 or scroll+rAF L141–160 (non-pipeline) |
| **CSS** | `grid-template-rows` transition; `transition-[padding,…]`; `mobileContentBottomPadTransition` |
| **Animation** | 200–300ms overlapping **layout** properties |
| **Observer** | Indirect: **ResizeObserver** on sticky after tall changes |
| **Chain** | `isMobileCompactMode` → master header grids + file sticky padding + **`main` pb** + nav transform + stack **gap** |

**Hypothesis:** **Largest** contributor to perceived “jump” — **`main` scrollHeight** and **master header height** change **during** momentum.

---

## R2 — `main` bottom padding transition (focus) vs fixed nav

| Field | Value |
|-------|--------|
| **Likelihood** | **8/10** |
| **Severity** | **8/10** |
| **Fix complexity** | **3/5** |
| **Files** | `AppChrome.tsx` (inner `main` wrapper L518–535 / SaaS L386–399), `mobileCompactChrome.ts` (`mobileContentBottomPadTransition`, `mobileFocusMainBottomPadClass`) |
| **State** | `isMobileFocusMode` (mirrors `compactChrome`) |
| **CSS** | `transition-[padding]` 300ms; `pb` from ~`5.5rem+safe-area` to ~`safe-area only` |
| **Chain** | Bottom **inset** of scrollport content changes → scroll position **feel** shifts |

**Safari note:** Dynamic toolbar + **large pb** changes exacerbate **visible** jumps.

---

## R3 — ResizeObserver on sticky header during padding animation

| Field | Value |
|-------|--------|
| **Likelihood** | **7/10** |
| **Severity** | **7/10** |
| **Fix complexity** | **3/5** |
| **File** | `PipelineFileWorkspaceShell.tsx` L174–195 |
| **Hook** | `ResizeObserver` + `useLayoutEffect` |
| **State** | `stickyChromeHeightPx` |
| **CSS vars** | `--header-height`, `--pipeline-file-sticky-height` |
| **Chain** | Variable updates → **scroll-margin** on sections → secondary layout |

---

## R4 — IntersectionObserver boundary oscillation (pipeline file)

| Field | Value |
|-------|--------|
| **Likelihood** | **6/10** |
| **Severity** | **6/10** |
| **Fix complexity** | **2/5** |
| **File** | `MobileChromeController.tsx` L113–135 |
| **Observer** | `IntersectionObserver`, `threshold: 0` |
| **State** | `setCompactChrome(!hit)` |

**Hypothesis:** Sentinel **flickers** across boundary if layout **breathes** or sticky height **animates**.

---

## R5 — `transform` + `sticky` on same file header (`mobileFocusChromeTransition`)

| Field | Value |
|-------|--------|
| **Likelihood** | **5/10** (needs computed-style proof) |
| **Severity** | **9/10** if true |
| **Fix complexity** | **2/5** |
| **File** | `PipelineFileWorkspaceShell.tsx` L213–218 |
| **CSS** | `mobileFocusChromeTransition` lists **`transform`** |

---

## R6 — Instant `gap` flip (`mobileWorkspaceStackClass`)

| Field | Value |
|-------|--------|
| **Likelihood** | **5/10** |
| **Severity** | **5/10** |
| **Fix complexity** | **2/5** |
| **File** | `mobileCompactChrome.ts` L86–90, used `PipelineFileWorkspaceShell.tsx` |

---

## R7 — `documentElement` `data-dlc-mobile-*` mutation

| Field | Value |
|-------|--------|
| **Likelihood** | **4/10** |
| **Severity** | **3/10** |
| **Fix complexity** | **2/5** |
| **File** | `MobileChromeController.tsx` L182–195 |

**Hypothesis:** Global attribute toggles may trigger **stylesheet recalc** if selectors exist (grep separately).

---

## Summary — confidence percentages (normalized illustrative)

If forced to **single** “most likely mechanism” for jump:

| Mechanism | % confidence |
|-----------|--------------|
| Combined **layout transitions** (R1+R2) | **45%** |
| **RO + CSS var** churn (R3) | **20%** |
| **IO oscillation** (R4) | **15%** |
| **Sticky+transform** (R5) | **12%** (pending device proof) |
| Other (R6–R7) | **8%** |

---

*End of targeted root cause ranking.*
