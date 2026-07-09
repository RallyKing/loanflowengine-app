# ResizeObserver feedback analysis — target systems only

**Diagnostic only.** Scoped to **sticky/workspace shell** and **explicit search** for `ResizeObserver` in **`AppChrome`**, **`MobileChromeController`**, **`MobileBottomNav`**, **`PipelineFileWorkspaceShell`**.

---

## 1. Findings summary

| File | ResizeObserver? | Observed element |
|------|-------------------|------------------|
| `PipelineFileWorkspaceShell.tsx` | **Yes** | Sticky file `<header>` (`stickyChromeRef`) |
| `AppChrome.tsx` | **No** | — |
| `MobileChromeController.tsx` | **No** | — |
| `MobileBottomNav.tsx` | **No** | — |
| `mobileCompactChrome.ts` | **No** (pure classes) | — |

**Layout strip** / **AppChrome main**: **No ResizeObserver** in these components per grep scope.

---

## 2. `PipelineFileWorkspaceShell` — dual measurement path

### 2.A `useLayoutEffect` + `ResizeObserver` (mount)

```text
L174–186: observe stickyChromeRef (<header>)
  apply(): getBoundingClientRect().height → setStickyChromeHeightPx
```

**Triggers:** Any **border-box size change** of the sticky `<header>`:

- Padding/class changes from **`compact`** (`mobileMasterExpanded`).
- **`isSnoozed`** visual banner.
- **`mobileCompactTransition` / `mobileFocusChromeTransition`** animating **padding**, **min-height**, **font-size**.
- **Safe-area** padding branch: `max-sm:pt-[max(0.5rem, env(safe-area-inset-top))]` when expanded.
- Inner **`WorkspaceContentContainer`** padding `compact ? max-md:!pb-0.5 …` vs `pb-3 pt-3`.

### 2.B `useLayoutEffect` (`compact`, `isSnoozed`)

```text
L190–195: synchronous measure after layout when compact or snooze toggles
```

**Purpose:** Avoid one-frame stale CSS vars after class flip **before** RO fires.

---

## 3. Downstream effects of `stickyChromeHeightPx`

| Output | Location |
|--------|----------|
| Inline `style` on shell root | `--header-height: Npx`, `--pipeline-file-sticky-height: Npx` |
| Consumers | `globals.css` rules: `scroll-margin-top` on pipeline sections under `[data-pipeline-file-workspace-shell]` |

**Rerender:** `setStickyChromeHeightPx` → **shell component** rerenders → children receive same props **unless** context also changed in same commit (batched).

---

## 4. Feedback loop analysis

### Loop A: Compact → header height → RO → state → CSS vars

1. `setCompactChrome` (from IO or scroll path)  
2. Sticky `<header>` classes/padding change  
3. **Layout:** height changes  
4. **`useLayoutEffect([compact, isSnoozed])`** reads height → `setState`  
5. **`ResizeObserver`** may also deliver **same** resize  
6. If rounded height **unchanged**, React **bails out** — **no extra commit**

**Risk:** If animation causes **sub-pixel oscillation** or alternating rounding (`Math.round(h * 10) / 10`), **could** theoretically alternate — **low probability**, **needs instrumentation**.

### Loop B: CSS vars → scroll-margin → layout of sections

- `scroll-margin-top` affects **scroll snapping** for `scrollIntoView` / hash — **does not** change sticky header box.  
- **Indirect:** Taller sections / different scroll alignment — **minimal** feedback into RO on header.

### Loop C: `main` padding transition (`AppChrome`) → scroll height

- **Not** observed via ResizeObserver in AppChrome.  
- **Can** change **where** sentinel sits relative to viewport → **IntersectionObserver** may re-evaluate — **indirect coupling** with `MobileChromeController` **IO**, not RO.

---

## 5. Fire frequency (qualitative)

| Phase | RO deliveries |
|-------|----------------|
| Idle | **0** |
| User resize / rotate | **1+** |
| Compact toggle + 200–300ms transitions | **Potentially many** (continuous resize observations during animation) |
| Scroll without height change | **0** (sticky content fixed height for a frame) |

**Safari note:** ResizeObserver **delivery timing** vs **subframe layout** can differ from Chromium; **duplicated** `useLayoutEffect` measure is a **partial** mitigation.

---

*End of ResizeObserver feedback analysis.*
