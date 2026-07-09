# Render + layout profiling — methodology & predicted hotspots

**Diagnostic only.** **No** React Profiler session, **no** Chrome Performance trace, and **no** WebKit timeline was captured in this environment.

---

## 1. What was **not** measured

- Renders per second (RPS) during scroll  
- Layout count / sec, paint count / sec  
- FPS  
- Forced synchronous layouts (`layout` / `recalculate style` blocks in trace)  
- Exact `longtask` attribution  

**Reason:** Requires running the app in an instrumented browser (or CI trace) with user gesture; explicitly out of scope for **static** forensic pass.

---

## 2. Recommended profiling procedure (for engineers)

1. **React DevTools Profiler:** record while performing **one slow scroll** on pipeline file (mobile preset). Note **`MobileChromeProvider`**, **`AppChromeBody`**, **`PipelineFileWorkspaceShell`**, **`MobileBottomNav`** commit counts when compact toggles.
2. **Chrome Performance:** enable **Screenshots**, **Layout**, **Paint**, **Script**. Filter **Update layer tree**, **Recalculate style**, **Layout**. Mark compact toggle region.
3. **Safari Web Inspector → Timelines:** Mobile Safari target device; same gesture; watch **Layout & Rendering**.
4. **React `why-did-you-render`** (dev-only) if needed — **not** in repo by default.

---

## 3. Predicted worst offenders (code complexity × scroll coupling)

| Rank | Component / hook | Why |
|------|------------------|-----|
| 1 | **`AppChromeBody` rerender** on `compactChrome` | Large subtree: headers + grids + `main` padding classes |
| 2 | **`PipelineFileWorkspaceShell`** + **`useLayoutEffect`/`ResizeObserver`** | Extra commit(s) when height/CSS vars update |
| 3 | **`MobileChromeProvider` effects** | `IntersectionObserver` callback + `document.documentElement` attribute mutation |
| 4 | **`MobileBottomNav`** | Small tree but triggers compositing on transform |
| 5 | **`PipelineFileWorkspaceUtilitiesCollapsible`** | Collapsible class churn from `isMobileCompactMode` |

---

## 4. Predicted hooks / effects under suspicion

| Location | Mechanism |
|----------|-----------|
| `MobileChromeController` IO callback | `startTransition(setCompactChrome)` |
| `MobileChromeController` scroll+rAF path | **Only non-pipeline** — higher frequency potential |
| `PipelineFileWorkspaceShell` RO `apply` | `setStickyChromeHeightPx` during padding animation |
| `PipelineFileWorkspaceShell` `useLayoutEffect([compact, isSnoozed])` | Sync measure post-commit |
| `MobileChromeController` html `data-*` effect | DOM writes each compact flip |

---

## 5. Forced layout patterns (static)

- **`getBoundingClientRect()`** in `ResizeObserver` + `useLayoutEffect` — **read after write** is batched by browser, but **paired** with **style changes** in same turn can still cause **forced layout** if interleaved with **DOM writes** elsewhere.

---

*End of render/layout profile document.*
