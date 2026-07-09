# Removed scroll containers — Phase 1

Route-level vertical scroll wrappers eliminated so **`AppChrome` `<main>`** owns scrolling.

---

## 1. Pipeline hub (`PipelinePageClient.tsx`)

**Removed:**

```tsx
<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
```

**Replaced with:** Horizontal-only wrapper on `data-testid="pipeline-table-scroll"` (no `overflow-y`).

**Gesture:** `max-md:touch-pan-xy` → **`max-md:touch-pan-x`** (vertical pan stays on `<main>`).

---

## 2. Activity feed (`app/activity/page.tsx`)

**Removed from `<ul>`:**

- `min-h-0 flex-1 touch-scroll-y overflow-y-auto`

**Kept:** `space-y-2 pr-1` for spacing.

---

## 3. Contacts list column (`app/contacts/page.tsx`)

**Removed from list shell `div`:**

- `min-h-0 flex-1 touch-scroll-y overflow-y-auto`

**Kept:** `mt-4 min-w-0 rounded-lg border border-border`.

---

## Not removed (approved bounded regions)

| Location | Pattern | Reason |
|----------|---------|--------|
| `app/contacts/page.tsx` | `ul.max-h-64 … overflow-y-auto` | Auxiliary activity list on detail pane |
| `app/tasks/page.tsx` | Errand inline `max-h-[min(70vh,520px)] overflow-y-auto` | Bounded expanded row |
| `TaskDrawer` / `LenderDrawer` | aside `overflow-y-auto` | Overlay exception |
| Modals / palettes | various `max-h-* overflow-y-auto` | Overlay exception |
| `components/SaasSidebar.tsx` | `nav` `overflow-y-auto` | Side rail (sibling of `<main>` in SaaS shell — separate follow-up) |

---

*See `scroll-ownership-remediation.md`.*
