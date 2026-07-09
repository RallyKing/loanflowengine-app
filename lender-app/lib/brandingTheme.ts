/**
 * Applies organization white-label colors by setting CSS variables on the document root.
 * Keeps work in one layout effect — no React re-renders across the tree.
 */

const MANAGED_VARS = [
  "--primary",
  "--primary-fg",
  "--brand",
  "--brand-fg",
  "--brand-accent",
  "--brand-accent-fg",
  "--accent",
  "--accent-fg",
  "--nav-sidebar",
  "--nav-sidebar-fg",
  "--dlc-tone-primary-container",
  "--dlc-tone-on-primary-container",
  "--dlc-tone-primary-outline",
  "--dlc-tone-secondary-container",
  "--dlc-tone-on-secondary-container",
  "--dlc-tone-secondary-outline",
] as const;

export function clearBrandingThemeVars(el: HTMLElement) {
  for (const k of MANAGED_VARS) {
    el.style.removeProperty(k);
  }
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const a = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0]! + 0.7152 * a[1]! + 0.0722 * a[2]!;
}

function fgSpaceForRgb(r: number, g: number, b: number): string {
  return relativeLuminance(r, g, b) > 0.55 ? "11 29 21" : "255 255 255";
}

function mixTowardWhite(r: number, g: number, b: number, t: number): string {
  return `${Math.round(r + (255 - r) * t)} ${Math.round(g + (255 - g) * t)} ${Math.round(b + (255 - b) * t)}`;
}

function parseSpaceRgb(space: string): [number, number, number] {
  const p = space.split(/\s+/).map((x) => Number(x));
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
}

/** Material-style tonal surfaces derived from a seed color (multi-tenant primary / secondary). */
function applyTonalFromRgb(
  el: HTMLElement,
  rgb: [number, number, number],
  role: "primary" | "secondary",
) {
  const [r, g, b] = rgb;
  const container = mixTowardWhite(r, g, b, 0.88);
  const [cr, cg, cb] = parseSpaceRgb(container);
  const onContainer = fgSpaceForRgb(cr, cg, cb);
  const outline = mixTowardWhite(r, g, b, 0.62);
  if (role === "primary") {
    el.style.setProperty("--dlc-tone-primary-container", container);
    el.style.setProperty("--dlc-tone-on-primary-container", onContainer);
    el.style.setProperty("--dlc-tone-primary-outline", outline);
  } else {
    el.style.setProperty("--dlc-tone-secondary-container", container);
    el.style.setProperty("--dlc-tone-on-secondary-container", onContainer);
    el.style.setProperty("--dlc-tone-secondary-outline", outline);
  }
}

function applyPrimaryPair(
  el: HTMLElement,
  rgb: [number, number, number],
  options: {
    nav: boolean;
    setDerivedAccent: boolean;
  },
) {
  const [r, g, b] = rgb;
  const space = `${r} ${g} ${b}`;
  const fg = fgSpaceForRgb(r, g, b);
  applyTonalFromRgb(el, rgb, "primary");
  el.style.setProperty("--primary", space);
  el.style.setProperty("--primary-fg", fg);
  el.style.setProperty("--brand", space);
  el.style.setProperty("--brand-fg", fg);
  if (options.nav) {
    el.style.setProperty("--nav-sidebar", space);
    el.style.setProperty("--nav-sidebar-fg", fg);
  }
  if (options.setDerivedAccent) {
    const softStr = mixTowardWhite(r, g, b, 0.12);
    const soft = softStr.split(" ").map((x) => Number(x)) as [
      number,
      number,
      number,
    ];
    el.style.setProperty("--brand-accent", softStr);
    el.style.setProperty(
      "--brand-accent-fg",
      fgSpaceForRgb(soft[0]!, soft[1]!, soft[2]!),
    );
    el.style.setProperty("--accent", mixTowardWhite(r, g, b, 0.92));
    el.style.setProperty("--accent-fg", space);
  }
}

function applySecondaryPair(el: HTMLElement, rgb: [number, number, number]) {
  const [r, g, b] = rgb;
  const space = `${r} ${g} ${b}`;
  const fg = fgSpaceForRgb(r, g, b);
  applyTonalFromRgb(el, rgb, "secondary");
  el.style.setProperty("--brand-accent", space);
  el.style.setProperty("--brand-accent-fg", fg);
  el.style.setProperty("--accent", mixTowardWhite(r, g, b, 0.9));
  el.style.setProperty("--accent-fg", space);
}

export function applyBrandingThemeVars(
  el: HTMLElement,
  colors: {
    primaryHex: string | null | undefined;
    secondaryHex: string | null | undefined;
  },
) {
  const p = colors.primaryHex ? hexToRgb(colors.primaryHex) : null;
  const s = colors.secondaryHex ? hexToRgb(colors.secondaryHex) : null;

  if (!p && !s) {
    clearBrandingThemeVars(el);
    return;
  }

  if (p && s) {
    applyPrimaryPair(el, p, { nav: true, setDerivedAccent: false });
    applySecondaryPair(el, s);
    return;
  }

  if (p) {
    applyPrimaryPair(el, p, { nav: true, setDerivedAccent: true });
    return;
  }

  if (s) {
    applyPrimaryPair(el, s, { nav: true, setDerivedAccent: false });
    applySecondaryPair(el, s);
  }
}
