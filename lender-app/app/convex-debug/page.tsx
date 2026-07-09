"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";

/**
 * Runtime isolation: direct `convex/react` useQuery only — no org wrappers.
 * - Failure here → client likely OK; generated `api` or deployment/backend mismatch.
 * - Success here + failure elsewhere → investigate app-level query wiring / boundaries.
 */
function ConvexDebugBody() {
  const rawUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const result = useQuery(api.organizations.list, {});

  if (!rawUrl?.trim()) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        <p className="font-medium text-destructive">Missing NEXT_PUBLIC_CONVEX_URL</p>
        <p className="mt-1 text-muted-foreground">
          Convex client cannot start. Set the env var (see <code className="rounded bg-muted px-1">.env.local</code> or production config).
        </p>
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <p className="font-medium">Loading</p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          useQuery(api.organizations.list, {"{}"})
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
      <p className="font-medium text-emerald-800 dark:text-emerald-200">
        Query succeeded (frontend + deployment alignment for this call)
      </p>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        {JSON.stringify(result)}
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        If another surface still errors, treat it as a wrapper, args, or auth path
        issue — not a missing <code className="rounded bg-muted px-1">organizations.list</code> on
        the backend.
      </p>
    </div>
  );
}

export default function ConvexDebugPage() {
  return (
    <div className="mx-auto min-h-dvh max-w-lg space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Convex runtime isolation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Route: <code className="rounded bg-muted px-1">/convex-debug</code>
        </p>
      </div>

      <ConvexQueryBoundary
        fallback={
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
            <p className="font-medium text-destructive">useQuery threw (likely backend mismatch)</p>
            <p className="mt-2 text-muted-foreground">
              Typical causes: wrong <code className="rounded bg-muted px-1">NEXT_PUBLIC_CONVEX_URL</code>,
              undeployed Convex functions, or stale codegen vs production. Compare with{" "}
              <code className="rounded bg-muted px-1">npm run verify:deployment</code>.
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              useQuery(api.organizations.list, {"{}"})
            </p>
          </div>
        }
      >
        <ConvexDebugBody />
      </ConvexQueryBoundary>
    </div>
  );
}
