/**
 * Focus restoration helpers — pair with overlay open/close.
 * For inspectors: prefer `RecordInspectorShell` (implements full contract + Escape).
 */

export type FocusSnapshot = {
  element: HTMLElement | null;
};

export function captureActiveElement(): FocusSnapshot {
  if (typeof document === "undefined") return { element: null };
  return { element: document.activeElement as HTMLElement | null };
}

export function restoreFocus(snapshot: FocusSnapshot): void {
  const el = snapshot.element;
  if (el?.isConnected) {
    el.focus({ preventScroll: true });
  }
}
