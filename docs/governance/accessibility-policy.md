# Accessibility policy

**Binding.** Shipping features MUST meet baseline accessibility expectations.

---

## MUST

- **Keyboard** — primary flows operable without pointer-only gestures.
- **Focus visibility** — visible focus rings; respect `focus-visible` and user settings (`globals.css` enhanced focus mode).
- **Screen readers** — meaningful labels, roles, and live regions where status changes matter.
- **Reduced motion** — honor `prefers-reduced-motion` / `data-reduce-motion` patterns.
- **Touch targets** — minimum sizes for mobile primary actions (`mobile-testing-rules.md`).
- **Contrast** — do not regress WCAG-minded pairings for text/icons on surfaces without design sign-off.

---

## Checklist

PR-level items: **`accessibility-checklist.md`**.

---

## Related

- `ui-consistency-policy.md`
- `design-system-policy.md`
