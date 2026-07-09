/**
 * Phase 18.3 — focus return and escape discipline for overlays/drawers.
 */

import { useEffect, useRef } from "react";

/** Remember focus when overlay opens; restore on close. */
export function useOperationalFocusReturn(active: boolean): void {
  const previousRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) {
      const prev = previousRef.current;
      if (prev && document.contains(prev)) {
        prev.focus({ preventScroll: true });
      }
      previousRef.current = null;
      return;
    }
    previousRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }, [active]);
}

/** Focus first tabbable inside container when opened. */
export function focusOperationalContainer(container: HTMLElement | null): void {
  if (!container) return;
  const selector =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const first = container.querySelector<HTMLElement>(selector);
  (first ?? container).focus({ preventScroll: true });
}

export function useOperationalEscape(
  active: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose]);
}
