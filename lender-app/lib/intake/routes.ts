/**
 * URL helpers for deal data, share links, and pipeline navigation.
 * Public share links stay at `/share/[token]`.
 */
/** Pipeline table / board landing (used by licenses “back” link, etc.). */
export const PIPELINE_DEALS_PATH = "/pipeline" as const;
/** @deprecated Deal library removed — redirects to pipeline hub. */
export const DEAL_LIBRARY_PATH = "/pipeline" as const;
/** Public, token-gated share pages (view/edit enforced in Convex). */
export const INTAKE_SHARE_BASE_PATH = "/share" as const;

export const dealLibraryHref = () => DEAL_LIBRARY_PATH;
/** @deprecated Use `dealLibraryHref`. Kept for a few in-repo redirects. */
export const intakeLibraryHref = dealLibraryHref;

export const shareTokenHref = (token: string) =>
  `${INTAKE_SHARE_BASE_PATH}/${token}`;

/** Open the full-page deal workspace for this pipeline file. */
export const pipelineFileHref = (pipelineId: string) =>
  `/pipeline/${encodeURIComponent(pipelineId)}`;

/**
 * Absolute share URL for clipboard (client-only; uses current origin).
 */
export function shareTokenAbsoluteUrl(token: string): string {
  if (typeof window === "undefined") {
    return shareTokenHref(token);
  }
  return `${window.location.origin}${shareTokenHref(token)}`;
}
