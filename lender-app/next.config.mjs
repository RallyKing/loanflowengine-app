import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveGitSha() {
  if (process.env.NEXT_PUBLIC_DLC_GIT_SHA) {
    return process.env.NEXT_PUBLIC_DLC_GIT_SHA;
  }
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA;
  }
  try {
    return execSync("git rev-parse HEAD", {
      cwd: __dirname,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

const dlcBuildTime = new Date().toISOString();
const dlcGitSha = resolveGitSha();

// Set DLC_NEXT_DIST_DIR=1 for `.next-local`, or an absolute path (e.g. under
// %LOCALAPPDATA%) to avoid OneDrive rename races during multitask builds.
const dlcDistDirEnv =
  process.env.VERCEL || process.env.CI
    ? ""
    : process.env.DLC_NEXT_DIST_DIR?.trim() || "";
const dlcDistDir =
  dlcDistDirEnv === "1"
    ? ".next-local"
    : dlcDistDirEnv.length > 0
      ? dlcDistDirEnv
      : null;
const dlcDistDirOutsideProject = Boolean(
  dlcDistDir && path.isAbsolute(dlcDistDir),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(dlcDistDir ? { distDir: dlcDistDir } : {}),
  env: {
    NEXT_PUBLIC_DLC_GIT_SHA: dlcGitSha,
    NEXT_PUBLIC_DLC_BUILD_TIME: dlcBuildTime,
    NEXT_PUBLIC_DLC_VERCEL_DEPLOYMENT_ID:
      process.env.VERCEL_DEPLOYMENT_ID ?? "local",
  },
  /**
   * Prefer the repo folder (`â€¦/Lender List`) over a stray `package-lock.json`
   * higher in the tree (e.g. user profile) when resolving the tracing root.
   * `node_modules` remains under `lender-app/`.
   *
   * Skip on Vercel: there `__dirname` is `/vercel/path0` and the parent is
   * `/vercel/`, which makes Next emit traces one directory too high and the
   * deployer fail to lstat `routes-manifest.json` (path0/path0/...).
   * When distDir is absolute outside the app, keep tracing rooted at lender-app
   * so module resolution still finds `node_modules`.
   */
  ...(process.env.VERCEL
    ? {}
    : {
        // Custom distDir (incl. junction → %LOCALAPPDATA%) must resolve
        // node_modules from lender-app, not the repo parent / AppData target.
        outputFileTracingRoot: dlcDistDir
          ? __dirname
          : path.join(__dirname, ".."),
      }),
  reactStrictMode: true,
  /**
   * Strip stray `console.log` in production; keep `console.error` / `console.warn` for
   * diagnostics and error boundaries (reliability under load â€” less main-thread noise).
   */
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn", "info"] }
        : false,
  },
  /** Slightly smaller responses; default is on in app mode. */
  compress: true,
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  // Tree-shake icon imports: only bundled icons are included in the client graph.
  // Windows / synced folders: parallel SSG and webpack workers can race and emit
  // bad references to vendor chunks (e.g. missing `./vendor-chunks/convex.js`).
  // Serializing these steps trades build time for deterministic output.
  experimental: {
    optimizePackageImports: ["lucide-react"],
    staticGenerationMaxConcurrency: 1,
    workerThreads: false,
    webpackBuildWorker: false,
  },
  /**
   * Baseline security headers (CDN / edge can add HSTS, etc. in production).
   * `X-Frame-Options: SAMEORIGIN` limits clickjacking while allowing same-origin embeds.
   * Production also sets a pragmatic CSP; extend `connect-src` if you add third-party APIs.
   */
  async headers() {
    const base = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ];
    if (process.env.NODE_ENV === "production") {
      base.push({
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          [
            "connect-src 'self'",
            "https://*.convex.cloud https://*.convex.site",
            "wss://*.convex.cloud wss://*.convex.site",
            "http://127.0.0.1:3210 ws://127.0.0.1:3210",
            "http://127.0.0.1:3211 ws://127.0.0.1:3211",
            "http://localhost:3210 ws://localhost:3210",
            "http://localhost:3211 ws://localhost:3211",
          ].join(" "),
          "worker-src 'self' blob:",
          [
            "frame-src 'self'",
            "https://*.convex.cloud",
            "https://*.convex.site",
            "blob:",
          ].join(" "),
          "frame-ancestors 'self'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      });
    }
    return [
      {
        source: "/:path*",
        headers: base,
      },
    ];
  },
  /**
   * Legacy lender-tool paths (preâ€“unified workspace). Keeps bookmarks and
   * external links working without maintaining duplicate App Router pages.
   */
  async redirects() {
    return [
      { source: "/browse", destination: "/lenders", permanent: true },
      { source: "/add", destination: "/lenders?tab=add", permanent: true },
      { source: "/upload", destination: "/lenders?tab=upload", permanent: true },
      {
        source: "/discover",
        destination: "/lenders?tab=discover",
        permanent: true,
      },
      {
        source: "/scenario",
        destination: "/lenders?tab=scenario",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
