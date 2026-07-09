/**
 * Normalize user-facing errors to institutional language (portal + in-app surfaces).
 * Never surface raw stack traces or overly technical Convex strings where they undermine trust.
 */
export type TrustErrorSurface = "portal" | "app";

export function formatTrustSafeError(
  message: string,
  surface: TrustErrorSurface = "app",
): {
  title: string;
  detail?: string;
} {
  const m = message.trim();
  const lower = m.toLowerCase();

  if (
    lower.includes("missing sign-in token") ||
    lower.includes("missing token")
  ) {
    return {
      title: "Link incomplete or expired",
      detail:
        "Open the full secure link from your email, or sign in with your email and workspace.",
    };
  }
  const portalAuth =
    surface === "portal" &&
    (lower.includes("unauthorized") ||
      lower.includes("not authorized") ||
      lower.includes("forbidden") ||
      lower.includes("invalid token"));
  if (portalAuth) {
    return {
      title: "We could not verify that sign-in",
      detail:
        "Request a new link from your loan team or sign in again. If this persists, confirm you are using the workspace they provided.",
    };
  }
  if (lower.includes("too many") || lower.includes("rate")) {
    return {
      title: "Temporary limit reached",
      detail:
        "Wait a few minutes and try again, or contact your loan officer if you need immediate access.",
    };
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return {
      title: "Connection interrupted",
      detail: "Check your connection and try again.",
    };
  }
  if (
    lower.includes("could not undo") ||
    lower.includes("nothing to undo") ||
    (lower.includes("undo") && lower.includes("denied"))
  ) {
    return {
      title: "Undo not available",
      detail:
        "This change can no longer be reversed from here — it may have been superseded or your access may not include undo. Refresh the file or contact an administrator.",
    };
  }
  if (
    lower.includes("permission") ||
    lower.includes("forbidden") ||
    lower.includes("unauthorized") ||
    lower.includes("not authorized")
  ) {
    return {
      title: "Action not permitted",
      detail:
        "Your role or workspace settings do not allow this action. If you expected access, confirm you are on the correct account.",
    };
  }

  return {
    title: "Something went wrong",
    detail:
      m.length > 0 && m.length < 220
        ? m
        : "Try again. If the problem continues, note the time and contact your team or loan officer.",
  };
}

/** Portal sign-in and scoped-access wording (client portal pages). */
export function formatPortalTrustError(message: string) {
  return formatTrustSafeError(message, "portal");
}
