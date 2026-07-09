/**
 * Validates `NEXT_PUBLIC_CONVEX_URL` for the browser Convex client.
 * Shared by `ConvexClientProvider` (runtime) and `app/layout` (preconnect).
 */

export type ConvexPublicUrlResult =
  | { ok: true; href: string; kind: "local" | "remote" }
  | { ok: false; reason: "missing" | "invalid"; detail?: string };

/**
 * Convex HTTP/WebSocket clients expect the deployment root **without** a
 * trailing slash (e.g. `http://127.0.0.1:3210`). `new URL("…3210/").toString()`
 * keeps the slash and breaks `ConvexHttpClient` against the local backend.
 */
function convexDeploymentHrefFromUrl(u: URL): string {
  const rootish = u.pathname === "/" || u.pathname === "";
  const base = rootish
    ? `${u.protocol}//${u.host}`
    : `${u.protocol}//${u.host}${u.pathname}`;
  return `${base}${u.search}${u.hash}`;
}

/**
 * - **Local dev:** `http://127.0.0.1:<port>` or `http://localhost:<port>` (from `npx convex dev`).
 * - **Hosted:** `https://<deployment>.convex.cloud` (dev or prod deployment).
 * Does not throw.
 */
export function parseConvexPublicUrl(
  raw: string | undefined
): ConvexPublicUrlResult {
  if (raw == null || typeof raw !== "string" || !raw.trim()) {
    return { ok: false, reason: "missing" };
  }
  const trimmed = raw.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: "invalid",
      detail: `Could not parse as a URL: ${trimmed}`,
    };
  }

  const protocol = u.protocol.toLowerCase();
  const host = u.hostname.toLowerCase();

  if (protocol !== "http:" && protocol !== "https:") {
    return {
      ok: false,
      reason: "invalid",
      detail: `Use http: or https: (got ${u.protocol}).`,
    };
  }

  if (protocol === "http:") {
    if (host !== "127.0.0.1" && host !== "localhost") {
      return {
        ok: false,
        reason: "invalid",
        detail:
          "http:// is only allowed for 127.0.0.1 or localhost (local Convex). Use https://*.convex.cloud for hosted deployments.",
      };
    }
  }

  if (!host) {
    return { ok: false, reason: "invalid", detail: "URL is missing a hostname." };
  }

  const kind =
    protocol === "http:" ||
    host === "127.0.0.1" ||
    host === "localhost"
      ? "local"
      : "remote";

  return { ok: true, href: convexDeploymentHrefFromUrl(u), kind };
}

/**
 * Hostname segment for IndexedDB offline snapshot keys. When
 * `NEXT_PUBLIC_CONVEX_URL` changes (different Convex deployment), cached rows
 * must not carry over — same org id can exist in another backend during tests.
 */
export function convexPublicHostnameForSnapshotKey(): string {
  const r = parseConvexPublicUrl(
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_CONVEX_URL
      : undefined,
  );
  if (!r.ok) return "no-convex";
  try {
    return new URL(r.href).hostname.toLowerCase();
  } catch {
    return "no-convex";
  }
}

/** Safe origin for `<link rel="preconnect">` in the root layout (server). */
export function convexPublicUrlForPreconnect(
  raw: string | undefined
): string | undefined {
  const r = parseConvexPublicUrl(raw);
  return r.ok ? r.href : undefined;
}

/**
 * Base URL for Convex **`httpRouter`** endpoints on **hosted** deployments:
 * `https://<name>.convex.cloud` → `https://<name>.convex.site`.
 *
 * For **local** `NEXT_PUBLIC_CONVEX_URL`, Convex serves queries on this origin but
 * does not expose `httpRouter` there (404 on `/api/v1/...`); skip HTTP checks or
 * use a cloud deployment / ngrok per Convex local deployment docs.
 */
export function convexHttpActionsBaseUrl(deploymentHref: string): string {
  let u: URL;
  try {
    u = new URL(deploymentHref);
  } catch {
    return deploymentHref;
  }
  const host = u.hostname.toLowerCase();
  if (host.endsWith(".convex.cloud")) {
    const slug = host.slice(0, -".convex.cloud".length);
    return `${u.protocol}//${slug}.convex.site`;
  }
  const rootish = u.pathname === "/" || u.pathname === "";
  const base = rootish
    ? `${u.protocol}//${u.host}`
    : `${u.protocol}//${u.host}${u.pathname}`;
  return `${base}${u.search}${u.hash}`.replace(/\/$/, "");
}
