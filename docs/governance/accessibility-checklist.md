# Accessibility checklist

**PR-level complement to `accessibility-policy.md`.**

---

## Keyboard & focus

- [ ] All primary actions reachable via keyboard
- [ ] Focus order logical; no traps except intentional modals
- [ ] `focus-visible` rings visible (respect user “stronger focus” setting if applicable)

---

## Screen readers

- [ ] Images/icons have text or `aria-hidden` appropriately
- [ ] Dynamic updates use `aria-live` where users need announcement

---

## Motion

- [ ] `prefers-reduced-motion` / app `data-reduce-motion` respected for heavy motion

---

## Touch / mobile

- [ ] Tap targets sufficient on primary actions
- [ ] No hover-only critical paths

---

## Visual

- [ ] Contrast acceptable for text on new surfaces

---

## Related

- `design-system-policy.md`
- `docs/mobile-testing-rules.md`
