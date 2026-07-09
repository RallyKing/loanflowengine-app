/**
 * Account-scoped UI tint keys stored under `UserPreferences.displaySettings`.
 * Values are full CSS colors (e.g. `#15803D`, `rgb(22 101 52)`).
 */

export const UI_DISPLAY_COLOR_KEYS = [
  "blockColor",
  "labelColor",
  "indicatorColor",
  "textColor",
] as const;

export type UiDisplayColorKey = (typeof UI_DISPLAY_COLOR_KEYS)[number];

export type UiDisplayColors = Partial<Record<UiDisplayColorKey, string>>;

const DANGEROUS = /[;{}<>]|url\s*\(/i;

/** Conservative allowlist — blocks script injection via `style` attributes. */
export function isValidUiDisplayColor(value: string): boolean {
  const v = value.trim();
  if (v.length < 3 || v.length > 80) return false;
  if (DANGEROUS.test(v)) return false;
  if (v.startsWith("#")) {
    return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v);
  }
  if (v.startsWith("rgb")) {
    return /^rgba?\([^)]+\)$/i.test(v);
  }
  if (v.startsWith("hsl")) {
    return /^hsla?\([^)]+\)$/i.test(v);
  }
  return false;
}

function hex6FromShortOrLong(hex: string): string | null {
  const t = hex.trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t.slice(1).toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(t)) {
    const h = t.slice(1);
    return `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return null;
}

/** `rgba(r,g,b,a)` from `#rrggbb` / `#rgb`. */
/** `#rgb` / `#rrggbb` for `<input type="color" />`; falls back when unset. */
export function hexForColorInput(stored: string | undefined, fallback: string): string {
  const s = (stored ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    const h = s.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  return fallback.toUpperCase();
}

export function hexToRgbaString(hex: string, alpha: number): string | null {
  const body = hex6FromShortOrLong(hex);
  if (!body) return null;
  const r = Number.parseInt(body.slice(0, 2), 16);
  const g = Number.parseInt(body.slice(2, 4), 16);
  const b = Number.parseInt(body.slice(4, 6), 16);
  if (![r, g, b].every((x) => Number.isFinite(x))) return null;
  return `rgba(${r},${g},${b},${alpha})`;
}

function softBackgroundFromColor(c: string): string | null {
  const t = c.trim();
  if (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("color", `color-mix(in srgb, ${t} 16%, transparent)`)
  ) {
    return `color-mix(in srgb, ${t} 16%, transparent)`;
  }
  if (t.startsWith("#")) return hexToRgbaString(t, 0.14);
  return null;
}

function borderTintFromColor(c: string): string | null {
  const t = c.trim();
  if (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("color", `color-mix(in srgb, ${t} 42%, transparent)`)
  ) {
    return `color-mix(in srgb, ${t} 42%, transparent)`;
  }
  if (t.startsWith("#")) return hexToRgbaString(t, 0.38);
  return null;
}

export function parseUiDisplayColors(
  displaySettings: Record<string, unknown> | null | undefined,
): UiDisplayColors {
  if (!displaySettings || typeof displaySettings !== "object") return {};
  const out: UiDisplayColors = {};
  for (const key of UI_DISPLAY_COLOR_KEYS) {
    const raw = displaySettings[key];
    if (typeof raw !== "string") continue;
    const v = raw.trim();
    if (!v || !isValidUiDisplayColor(v)) continue;
    out[key] = v;
  }
  return out;
}

/**
 * Merge color keys into an existing `displaySettings` bag (other keys preserved).
 */
export function mergeDisplaySettingsColorPatch(
  displaySettings: Record<string, unknown>,
  patch: Partial<Record<UiDisplayColorKey, string | null | undefined>>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...displaySettings };
  for (const key of UI_DISPLAY_COLOR_KEYS) {
    if (!(key in patch)) continue;
    const v = patch[key];
    if (v === null || v === undefined || v === "") {
      delete next[key];
      continue;
    }
    const t = v.trim();
    if (!isValidUiDisplayColor(t)) continue;
    next[key] = t;
  }
  return next;
}

/** Apply parsed colors to `document.documentElement` (or any element). */
export function applyUiDisplayColorsToElement(
  el: HTMLElement,
  colors: UiDisplayColors,
): void {
  const setOrRemove = (name: string, v?: string) => {
    if (v && isValidUiDisplayColor(v)) el.style.setProperty(name, v.trim());
    else el.style.removeProperty(name);
  };

  setOrRemove("--ui-block-color", colors.blockColor);
  setOrRemove("--ui-label", colors.labelColor);
  setOrRemove("--ui-body-text", colors.textColor);
  setOrRemove("--ui-indicator", colors.indicatorColor);

  if (colors.indicatorColor && isValidUiDisplayColor(colors.indicatorColor)) {
    const c = colors.indicatorColor.trim();
    const soft = softBackgroundFromColor(c);
    const border = borderTintFromColor(c);
    if (soft) el.style.setProperty("--ui-indicator-soft-bg", soft);
    else el.style.removeProperty("--ui-indicator-soft-bg");
    if (border) el.style.setProperty("--ui-indicator-border", border);
    else el.style.removeProperty("--ui-indicator-border");
  } else {
    el.style.removeProperty("--ui-indicator-soft-bg");
    el.style.removeProperty("--ui-indicator-border");
  }
}
