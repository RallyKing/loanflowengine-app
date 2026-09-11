/**
 * Phase 24.3A — mobile information hierarchy (content over chrome).
 * Use on max-md breakpoints only; desktop keeps existing truncate rails.
 */

/** Full-width primary label — no truncation on mobile. */
export const mobilePrimaryTitleClass =
  "w-full min-w-0 max-md:overflow-visible max-md:whitespace-normal max-md:break-words max-md:[overflow-wrap:anywhere] md:truncate text-sm font-semibold leading-snug text-foreground";

/** Tier-2 control strip beneath a full-width title. */
export const mobileSecondaryTierClass =
  "flex w-full min-w-0 flex-wrap items-center gap-2 max-md:pt-0.5";

/** Indent tier-2 to align under title after left chrome (chevron + icon). */
export const mobileHierarchySecondaryInsetClass = "max-md:pl-10";
