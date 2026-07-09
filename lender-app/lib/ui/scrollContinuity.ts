/**
 * Phase 18.3 — preserve cognitive scroll position across operational toggles.
 * Presentation-only; does not alter routing or data.
 */

import {
  isPipelineScrollDebugEnabled,
  pipelineScrollDebugController,
} from "@/lib/debug/pipelineScrollDebug";

function logScrollContinuityApi(
  api: "scrollTop" | "scrollTo",
  target: string,
  args: unknown,
): void {
  if (!isPipelineScrollDebugEnabled()) return;
  if (!pipelineScrollDebugController.enabled) return;
  pipelineScrollDebugController.logEvent({
    type: "SCROLL_API_CALL",
    at: Date.now(),
    api,
    target,
    args,
    stack: (new Error().stack ?? "")
      .split("\n")
      .slice(2, 8)
      .map((l) => l.trim())
      .join(" ← "),
  });
}

function shortSelector(el: Element): string {
  const parts: string[] = [el.tagName.toLowerCase()];
  if (el.id) parts.push(`#${el.id}`);
  const tid = el.getAttribute("data-testid");
  if (tid) parts.push(`[data-testid=${tid}]`);
  return parts.join("");
}

/** AppChrome main scroll owner (default hub/list routes). */
export function getOperationalScrollRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const main = document.querySelector("main");
  if (main && main.scrollHeight > main.clientHeight) return main as HTMLElement;
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

export function captureOperationalScrollTop(): number {
  const root = getOperationalScrollRoot();
  return root?.scrollTop ?? (typeof window !== "undefined" ? window.scrollY : 0);
}

export function restoreOperationalScrollTop(
  top: number,
  options?: { doubleFrame?: boolean },
): void {
  const apply = () => {
    const root = getOperationalScrollRoot();
    if (root) {
      logScrollContinuityApi("scrollTop", shortSelector(root), top);
      root.scrollTop = top;
      return;
    }
    if (typeof window !== "undefined") {
      logScrollContinuityApi("scrollTo", "window", { top, behavior: "instant" });
      window.scrollTo({ top, behavior: "instant" });
    }
  };
  if (typeof requestAnimationFrame === "undefined") {
    apply();
    return;
  }
  requestAnimationFrame(() => {
    apply();
    if (options?.doubleFrame) {
      requestAnimationFrame(apply);
    }
  });
}

/**
 * Run `fn` while attempting to restore scroll after React commits.
 */
export function withOperationalScrollPreserved(fn: () => void): void {
  const top = captureOperationalScrollTop();
  fn();
  restoreOperationalScrollTop(top, { doubleFrame: true });
}

/** Pipeline file workspace delegated scrollport. */
export function getPipelineWorkspaceScrollRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(
    "[data-pipeline-workspace-scroll]",
  ) as HTMLElement | null;
}

export function capturePipelineWorkspaceScrollTop(): number {
  return getPipelineWorkspaceScrollRoot()?.scrollTop ?? 0;
}

export function restorePipelineWorkspaceScrollTop(top: number): void {
  const root = getPipelineWorkspaceScrollRoot();
  if (!root) return;
  requestAnimationFrame(() => {
    logScrollContinuityApi("scrollTop", shortSelector(root), top);
    root.scrollTop = top;
  });
}
