/**
 * Geometry helpers for detached block “window-in-window” panels.
 * Persist is localStorage-only (no Convex) — per-browser placement memory.
 */

export type FloatingWindowGeometry = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export const FLOATING_WINDOW_MIN_W = 280;
export const FLOATING_WINDOW_MIN_H = 200;

const STORAGE_PREFIX = "dlc-floating-window:";

function viewportSize(): { vw: number; vh: number } {
  if (typeof window === "undefined") {
    return { vw: 1024, vh: 768 };
  }
  return {
    vw: Math.max(1, window.innerWidth),
    vh: Math.max(1, window.innerHeight),
  };
}

/** Safe area + chrome padding so windows stay reachable on mobile. */
function insetPad(): { top: number; right: number; bottom: number; left: number } {
  const { vw } = viewportSize();
  const mobile = vw < 768;
  return mobile
    ? { top: 8, right: 8, bottom: 72, left: 8 }
    : { top: 12, right: 12, bottom: 12, left: 12 };
}

export function defaultFloatingWindowGeometry(
  cascadeIndex = 0,
): FloatingWindowGeometry {
  const { vw, vh } = viewportSize();
  const pad = insetPad();
  const mobile = vw < 768;
  const w = mobile
    ? Math.max(FLOATING_WINDOW_MIN_W, vw - pad.left - pad.right)
    : Math.min(520, Math.max(FLOATING_WINDOW_MIN_W, Math.floor(vw * 0.42)));
  const h = mobile
    ? Math.min(
        Math.max(FLOATING_WINDOW_MIN_H, Math.floor(vh * 0.55)),
        vh - pad.top - pad.bottom,
      )
    : Math.min(480, Math.max(FLOATING_WINDOW_MIN_H, Math.floor(vh * 0.55)));
  const offset = (cascadeIndex % 6) * 28;
  const x = mobile
    ? pad.left
    : Math.min(
        vw - w - pad.right,
        Math.max(pad.left, Math.floor(vw * 0.35) + offset),
      );
  const y = mobile
    ? Math.max(pad.top, Math.floor(vh * 0.12))
    : Math.min(
        vh - h - pad.bottom,
        Math.max(pad.top, Math.floor(vh * 0.14) + offset),
      );
  return clampFloatingWindowGeometry({ x, y, w, h });
}

export function clampFloatingWindowGeometry(
  g: FloatingWindowGeometry,
): FloatingWindowGeometry {
  const { vw, vh } = viewportSize();
  const pad = insetPad();
  const maxW = Math.max(FLOATING_WINDOW_MIN_W, vw - pad.left - pad.right);
  const maxH = Math.max(FLOATING_WINDOW_MIN_H, vh - pad.top - pad.bottom);
  const w = Math.min(maxW, Math.max(FLOATING_WINDOW_MIN_W, Math.round(g.w)));
  const h = Math.min(maxH, Math.max(FLOATING_WINDOW_MIN_H, Math.round(g.h)));
  const x = Math.min(
    Math.max(pad.left, Math.round(g.x)),
    Math.max(pad.left, vw - w - pad.right),
  );
  const y = Math.min(
    Math.max(pad.top, Math.round(g.y)),
    Math.max(pad.top, vh - h - pad.bottom),
  );
  return { x, y, w, h };
}

export function floatingWindowStorageKey(persistKey: string): string {
  return `${STORAGE_PREFIX}${persistKey}`;
}

export function loadFloatingWindowGeometry(
  persistKey: string,
): FloatingWindowGeometry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(
      floatingWindowStorageKey(persistKey),
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FloatingWindowGeometry>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.w !== "number" ||
      typeof parsed.h !== "number"
    ) {
      return null;
    }
    return clampFloatingWindowGeometry({
      x: parsed.x,
      y: parsed.y,
      w: parsed.w,
      h: parsed.h,
    });
  } catch {
    return null;
  }
}

export function saveFloatingWindowGeometry(
  persistKey: string,
  geometry: FloatingWindowGeometry,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      floatingWindowStorageKey(persistKey),
      JSON.stringify(clampFloatingWindowGeometry(geometry)),
    );
  } catch {
    // Quota / private mode — ignore.
  }
}
