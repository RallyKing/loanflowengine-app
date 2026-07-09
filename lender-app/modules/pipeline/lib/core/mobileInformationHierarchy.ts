/**
 * Phase 24.5.3 — mobile-only typography / layout tokens for pipeline file workspace.
 * Desktop layouts keep existing truncate where applied via `md:` prefixes.
 */

/** Primary titles (file, task, client, project, crumb) on mobile viewports. */
export const pipelineMobilePrimaryTitleClass =
  "w-full break-words [overflow-wrap:anywhere] whitespace-normal";

/** Desktop continuation of title row truncation (unchanged behavior). */
export const pipelineDesktopTitleTruncateClass =
  "md:truncate md:overflow-hidden md:whitespace-nowrap";

export function pipelineFileTitleDisplayClass(extra?: string): string {
  return [
    "block w-full text-sm font-semibold leading-snug",
    pipelineMobilePrimaryTitleClass,
    pipelineDesktopTitleTruncateClass,
    "md:leading-tight",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export function pipelineHierarchyCrumbClass(isLast: boolean): string {
  return [
    "font-medium max-md:break-words max-md:whitespace-normal max-md:[overflow-wrap:anywhere]",
    "md:truncate",
    isLast ? "text-foreground" : "text-foreground/80",
  ].join(" ");
}
