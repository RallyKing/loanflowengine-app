"use client";

/**
 * Shown when `NEXT_PUBLIC_CONVEX_URL` is missing or invalid. Uses Tailwind +
 * design tokens from `globals.css` (imported by the root layout) so the shell
 * stays on-brand instead of crashing the whole client tree.
 */
export function ConvexConfigMissing({
  variant,
  detail,
}: {
  variant: "missing" | "invalid";
  /** Raw env value when invalid (for debugging only). */
  detail?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground antialiased">
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-16">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {variant === "missing"
            ? "Convex URL not configured"
            : "Convex URL is invalid"}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {variant === "missing" ? (
            <>
              Add{" "}
              <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                NEXT_PUBLIC_CONVEX_URL
              </code>{" "}
              to{" "}
              <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                .env.local
              </code>{" "}
              (run{" "}
              <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                npx convex dev
              </code>{" "}
              once, copy the deployment URL), then restart the dev server.
            </>
          ) : (
            <>
              Use{" "}
              <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                https://your-deployment.convex.cloud
              </code>{" "}
              for a hosted deployment (dev or prod), or{" "}
              <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {`http://127.0.0.1:<port>`}
              </code>{" "}
              or{" "}
              <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {`http://localhost:<port>`}
              </code>{" "}
              for local{" "}
              <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                npx convex dev
              </code>
              . No quotes or spaces around the URL.
            </>
          )}
        </p>
        {variant === "invalid" && detail ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-xs text-destructive">
            {detail}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Styling and layout load normally here; only live data features are
          disabled until Convex is configured.
        </p>
      </main>
    </div>
  );
}
