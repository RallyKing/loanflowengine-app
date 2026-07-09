/**
 * Canonical pipeline statuses used across the list, drawer, and reports.
 *
 * Stage *chrome* defaults below use hex paints for user-customizable funnel colors
 * (Settings). For *semantic meaning* (alerts, validation, trust badges), prefer
 * `lib/design-system/semanticTokens.ts` + `dlc-semantic-*` CSS — do not conflate
 * brand gold with warning states.
 *
 * The funnel matches the broker workflow:
 *   Confirm Interest → Portal/Collecting Documents → Initial Review →
 *   Accepted → Underwriting → Closing → Funding → Paid/Paying.
 *
 * Free-form status strings are still allowed (legacy rows from before the
 * funnel rename, or future additions). When a status doesn't match a known
 * canonical value, helpers fall back to neutral styling and Title-Case the
 * raw value, and `LEGACY_STATUS_MAP` lets the UI suggest the new equivalent.
 */

import { isValidUiDisplayColor } from "@/lib/uiDisplaySettings";

export type PipelineStatusValue =
  | "confirm_interest"
  | "portal_collecting_docs"
  | "initial_review"
  | "accepted"
  | "underwriting"
  | "closing"
  | "funding"
  | "paid_paying";

export type PipelineStatusInfo = {
  value: PipelineStatusValue;
  label: string;
  /** Tailwind classes for a small pill / badge. */
  badgeClassName: string;
  /** Single-color dot used in compact UI (Kanban headers, dense rows). */
  dotClassName: string;
  /** Sort weight for ordering by status (smaller = earlier in funnel). */
  weight: number;
};

export type PipelineStageStyle = {
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  selectedBackgroundColor: string;
  selectedTextColor: string;
  indicatorColor: string;
};

export type PipelineStageStyleMap = Partial<
  Record<PipelineStatusValue, Partial<PipelineStageStyle>>
>;

export const DEFAULT_PIPELINE_STAGE_STYLES: Readonly<
  Record<PipelineStatusValue, PipelineStageStyle>
> = {
  confirm_interest: {
    backgroundColor: "#FEF3C7",
    textColor: "#78350F",
    borderColor: "#F59E0B",
    selectedBackgroundColor: "#F59E0B",
    selectedTextColor: "#111827",
    indicatorColor: "#F59E0B",
  },
  portal_collecting_docs: {
    backgroundColor: "#FEF3C7",
    textColor: "#78350F",
    borderColor: "#F59E0B",
    selectedBackgroundColor: "#F59E0B",
    selectedTextColor: "#111827",
    indicatorColor: "#F59E0B",
  },
  initial_review: {
    backgroundColor: "#FEF3C7",
    textColor: "#78350F",
    borderColor: "#F59E0B",
    selectedBackgroundColor: "#F59E0B",
    selectedTextColor: "#111827",
    indicatorColor: "#F59E0B",
  },
  accepted: {
    backgroundColor: "#FEF3C7",
    textColor: "#78350F",
    borderColor: "#F59E0B",
    selectedBackgroundColor: "#F59E0B",
    selectedTextColor: "#111827",
    indicatorColor: "#F59E0B",
  },
  underwriting: {
    backgroundColor: "#FEF3C7",
    textColor: "#78350F",
    borderColor: "#F59E0B",
    selectedBackgroundColor: "#F59E0B",
    selectedTextColor: "#111827",
    indicatorColor: "#F59E0B",
  },
  closing: {
    backgroundColor: "#FEF3C7",
    textColor: "#78350F",
    borderColor: "#F59E0B",
    selectedBackgroundColor: "#F59E0B",
    selectedTextColor: "#111827",
    indicatorColor: "#F59E0B",
  },
  funding: {
    backgroundColor: "#DCFCE7",
    textColor: "#14532D",
    borderColor: "#15803D",
    selectedBackgroundColor: "#15803D",
    selectedTextColor: "#F9FAFB",
    indicatorColor: "#15803D",
  },
  paid_paying: {
    backgroundColor: "#CCFBF1",
    textColor: "#134E4A",
    borderColor: "#0F766E",
    selectedBackgroundColor: "#0F766E",
    selectedTextColor: "#F9FAFB",
    indicatorColor: "#0F766E",
  },
};

const HEX6_RE = /^#([0-9a-f]{6})$/i;

export function isValidPipelineStageColor(value: string): boolean {
  return HEX6_RE.test(value.trim());
}

function normalizeHex6(value: string): string {
  const t = value.trim();
  return HEX6_RE.test(t) ? t.toUpperCase() : "";
}

function readableTextColor(hex: string): string {
  const m = HEX6_RE.exec(hex);
  if (!m) return "#111827";
  const h = m[1]!;
  const r = Number.parseInt(h.slice(0, 2), 16) / 255;
  const g = Number.parseInt(h.slice(2, 4), 16) / 255;
  const b = Number.parseInt(h.slice(4, 6), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const l = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return l > 0.36 ? "#111827" : "#F9FAFB";
}

function contrastRatio(bgHex: string, textHex: string): number {
  const bg = HEX6_RE.exec(bgHex);
  const fg = HEX6_RE.exec(textHex);
  if (!bg || !fg) return 0;
  const toLum = (m: RegExpExecArray) => {
    const h = m[1]!;
    const r = Number.parseInt(h.slice(0, 2), 16) / 255;
    const g = Number.parseInt(h.slice(2, 4), 16) / 255;
    const b = Number.parseInt(h.slice(4, 6), 16) / 255;
    const toLinear = (c: number) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  };
  const l1 = toLum(bg);
  const l2 = toLum(fg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function enforceReadableText(bgHex: string, desiredTextHex: string): string {
  const bg = normalizeHex6(bgHex);
  const desired = normalizeHex6(desiredTextHex);
  if (!bg) return "#111827";
  if (desired && contrastRatio(bg, desired) >= 4.5) return desired;
  return readableTextColor(bg);
}

function normalizeStyleColor(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const normalized = normalizeHex6(raw);
  return normalized || fallback;
}

export function resolvePipelineStageStyle(
  value: PipelineStatusValue,
  custom?: PipelineStageStyleMap
): PipelineStageStyle {
  const base = DEFAULT_PIPELINE_STAGE_STYLES[value];
  const override = custom?.[value] ?? {};
  const backgroundColor = normalizeStyleColor(override.backgroundColor, base.backgroundColor);
  const borderColor = normalizeStyleColor(override.borderColor, base.borderColor);
  const indicatorColor = normalizeStyleColor(override.indicatorColor, base.indicatorColor);
  const selectedBackgroundColor = normalizeStyleColor(
    override.selectedBackgroundColor,
    base.selectedBackgroundColor
  );
  const textColor = enforceReadableText(
    backgroundColor,
    normalizeStyleColor(override.textColor, base.textColor)
  );
  const selectedTextColor = enforceReadableText(
    selectedBackgroundColor,
    normalizeStyleColor(override.selectedTextColor, base.selectedTextColor)
  );
  return {
    backgroundColor,
    textColor,
    borderColor,
    selectedBackgroundColor,
    selectedTextColor,
    indicatorColor,
  };
}

export function getDefaultPipelineStageStyles(): Record<PipelineStatusValue, PipelineStageStyle> {
  return { ...DEFAULT_PIPELINE_STAGE_STYLES };
}

/*
 * Each badge ships explicit dark-mode variants. Without them the light
 * `bg-*-50` backgrounds rendered as nearly-white pills on the dark
 * page background, making "Closing" essentially invisible and forcing
 * "Initial Review" to look inverted. The dark variants use a tinted
 * `bg-*-900/40` panel + a bright `text-*-300` so each pill stays
 * legible (≥ WCAG AA contrast) on both schemes while preserving the
 * funnel's color-coded progression.
 */
const BADGE = {
  slate:   "border-slate-300   bg-slate-100   text-slate-700   dark:border-slate-600   dark:bg-slate-800/70   dark:text-slate-100",
  sky:     "border-sky-300     bg-sky-50      text-sky-700     dark:border-sky-700     dark:bg-sky-950/60     dark:text-sky-200",
  indigo:  "border-indigo-300  bg-indigo-50   text-indigo-700  dark:border-indigo-700  dark:bg-indigo-950/60  dark:text-indigo-200",
  violet:  "border-violet-300  bg-violet-50   text-violet-700  dark:border-violet-700  dark:bg-violet-950/60  dark:text-violet-200",
  amber:   "border-amber-300   bg-amber-50    text-amber-800   dark:border-amber-600   dark:bg-amber-950/60   dark:text-amber-200",
  orange:  "border-orange-300  bg-orange-50   text-orange-800  dark:border-orange-600  dark:bg-orange-950/60  dark:text-orange-200",
  emerald: "border-emerald-300 bg-emerald-50  text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-200",
  // Deep-green pill: solid forest body with white text in both modes. The
  // saturated fill makes Funding pop against the soft amber funnel pills
  // and the white-on-green pairing keeps the label fully legible whether
  // the pill is sitting in a row or highlighted as an active filter chip
  // (~7.6:1 contrast — well past WCAG AAA).
  green:   "border-green-800   bg-green-700   text-white       dark:border-green-500   dark:bg-green-700      dark:text-white",
  // Brand pill: gold on dark (the brand-accent), forest on light (primary).
  brand:   "border-primary/40  bg-primary/15  text-primary     dark:border-brand-accent/60 dark:bg-brand-accent/15 dark:text-brand-accent",
} as const;

/*
 * Per product direction: every in-progress funnel stage shares the
 * Underwriting (amber) pill so the status column reads as a single
 * "in flight" state. Only Funding (emerald) and Paid / Paying (brand)
 * keep their distinct colors so the eye can immediately spot the
 * money-moving rows in any list.
 */
const AMBER_DOT = "bg-amber-500 dark:bg-amber-300";

/**
 * @deprecated Phase 12.1 transitional — use `organizationPipelineStages` (org-scoped).
 * Removal target: Phase 12.2 — see `docs/phase12.2-legacy-stage-removal.md`.
 * Do not add new UI fallbacks to this constant; hub/board/settings must use dynamic stages.
 */
export const PIPELINE_STATUSES: ReadonlyArray<PipelineStatusInfo> = [
  {
    value: "confirm_interest",
    label: "Confirm Interest",
    badgeClassName: BADGE.amber,
    dotClassName: AMBER_DOT,
    weight: 1,
  },
  {
    value: "portal_collecting_docs",
    label: "Portal / Collecting Docs",
    badgeClassName: BADGE.amber,
    dotClassName: AMBER_DOT,
    weight: 2,
  },
  {
    value: "initial_review",
    label: "Initial Review",
    badgeClassName: BADGE.amber,
    dotClassName: AMBER_DOT,
    weight: 3,
  },
  {
    value: "accepted",
    label: "Accepted",
    badgeClassName: BADGE.amber,
    dotClassName: AMBER_DOT,
    weight: 4,
  },
  {
    value: "underwriting",
    label: "Underwriting",
    badgeClassName: BADGE.amber,
    dotClassName: AMBER_DOT,
    weight: 5,
  },
  {
    value: "closing",
    label: "Closing",
    badgeClassName: BADGE.amber,
    dotClassName: AMBER_DOT,
    weight: 6,
  },
  {
    value: "funding",
    label: "Funding",
    badgeClassName: BADGE.green,
    // Light dot on the deep-green pill so the indicator stays visible
    // against the saturated background.
    dotClassName: "bg-green-100 dark:bg-green-100",
    weight: 7,
  },
  {
    value: "paid_paying",
    label: "Paid / Paying",
    badgeClassName: BADGE.brand,
    dotClassName: "bg-primary dark:bg-brand-accent",
    weight: 8,
  },
];

/**
 * Maps legacy status strings (from before the funnel rename) onto the new
 * canonical values. Used by the migration helper and by helpers that need
 * to read historic rows (e.g. ledger insertion).
 */
export const LEGACY_STATUS_MAP: Readonly<Record<string, PipelineStatusValue>> = {
  // Old short funnel
  lead: "confirm_interest",
  app: "portal_collecting_docs",
  application: "portal_collecting_docs",
  underwriting: "underwriting",
  approved: "accepted",
  funded: "funding",
  paid: "paid_paying",
  paying: "paid_paying",
  // Common synonyms / shorthand
  closing: "closing",
  funding: "funding",
};

const FALLBACK: Omit<PipelineStatusInfo, "value" | "label"> = {
  badgeClassName:
    "border-border bg-muted text-foreground dark:border-border dark:bg-muted dark:text-foreground",
  dotClassName: "bg-muted-foreground",
  weight: 50,
};

const titleCase = (s: string) =>
  s
    .split(/[\s_/-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");

/** Normalize a raw status string (case / whitespace / slash insensitive). */
export function normalizeStatusKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s/]+/g, "_");
}

/** Look up a status by its raw stored string (case/whitespace-insensitive). */
export function getPipelineStatusInfo(raw: string): PipelineStatusInfo {
  const key = normalizeStatusKey(raw);
  const direct = PIPELINE_STATUSES.find((s) => s.value === key);
  if (direct) return direct;
  const legacyTarget = LEGACY_STATUS_MAP[key];
  if (legacyTarget) {
    const mapped = PIPELINE_STATUSES.find((s) => s.value === legacyTarget)!;
    return mapped;
  }
  return {
    value: key as PipelineStatusValue,
    label: raw.trim() ? titleCase(raw) : "Unknown",
    badgeClassName: FALLBACK.badgeClassName,
    dotClassName: FALLBACK.dotClassName,
    weight: FALLBACK.weight,
  };
}

/**
 * True when a status (canonical or legacy) represents a paid deal —
 * mirrors the server's `isPaidStatusLabel` so client UI can highlight
 * paid rows consistently.
 */
export function isPaidStatus(raw: string): boolean {
  const key = normalizeStatusKey(raw);
  if (key === "paid_paying" || key === "paid" || key === "paying") return true;
  return LEGACY_STATUS_MAP[key] === "paid_paying";
}

export function getPipelineStatusBadgeStyle(
  raw: string,
  custom?: PipelineStageStyleMap,
  opts?: { selected?: boolean; globalIndicator?: string | null },
): Record<string, string> | undefined {
  const info = getPipelineStatusInfo(raw);
  const canonical = PIPELINE_STATUSES.find((s) => s.value === info.value);
  if (!canonical) return undefined;
  const style = resolvePipelineStageStyle(canonical.value, custom);
  const selected = opts?.selected === true;
  const gi = opts?.globalIndicator;
  const borderColor =
    gi && isValidUiDisplayColor(gi) ? gi.trim() : style.borderColor;
  return {
    backgroundColor: selected ? style.selectedBackgroundColor : style.backgroundColor,
    borderColor,
    color: selected ? style.selectedTextColor : style.textColor,
  };
}

export function getPipelineStatusDotStyle(
  raw: string,
  custom?: PipelineStageStyleMap,
  globalIndicator?: string | null,
): Record<string, string> | undefined {
  if (globalIndicator && isValidUiDisplayColor(globalIndicator)) {
    return { backgroundColor: globalIndicator.trim() };
  }
  const info = getPipelineStatusInfo(raw);
  const canonical = PIPELINE_STATUSES.find((s) => s.value === info.value);
  if (!canonical) return undefined;
  const style = resolvePipelineStageStyle(canonical.value, custom);
  return { backgroundColor: style.indicatorColor };
}

/** Options shape for `<InlineSelect>` / native `<select>`. */
export const PIPELINE_STATUS_SELECT_OPTIONS = PIPELINE_STATUSES.map((s) => ({
  value: s.value,
  label: s.label,
  badgeClassName: s.badgeClassName,
}));

export function getPipelineStatusSelectOptions(
  custom?: PipelineStageStyleMap,
  globalIndicator?: string | null,
) {
  return PIPELINE_STATUSES.map((s) => ({
    value: s.value,
    label: s.label,
    badgeClassName: s.badgeClassName,
    badgeStyle: getPipelineStatusBadgeStyle(s.value, custom, {
      globalIndicator,
    }),
  }));
}
