"use client";

import { Sparkles } from "lucide-react";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { OperationalEmptyState } from "@/components/ui/OperationalEmptyState";
import { cn } from "@/lib/cn";

/**
 * Coming soon — home for unfinished / not-ready modules.
 * Scroll: AppChrome `<main>` (default signed-in contract).
 */
export default function ComingSoonPage() {
  return (
    <PageErrorBoundary>
      <div
        className={cn(
          "mx-auto min-h-0 w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 md:py-8",
        )}
      >
        <header className="mb-8 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Sparkles
              className="h-8 w-8 shrink-0 text-primary"
              aria-hidden
            />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Coming soon
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Unfinished modules and work-in-progress features will live here
                until they are ready for the main workspace.
              </p>
            </div>
          </div>
        </header>

        <section aria-labelledby="coming-soon-modules-heading" className="space-y-4">
          <h2
            id="coming-soon-modules-heading"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            Modules in progress
          </h2>
          <div className="dlc-surface-card rounded-dlc-lg px-4 py-8 sm:px-6">
            <OperationalEmptyState
              data-testid="coming-soon-empty"
              icon={<Sparkles className="h-5 w-5" aria-hidden />}
              title="Nothing here yet"
              description="When unfinished tabs move out of primary navigation, they will appear in this list. Check back as new modules land."
            />
          </div>
        </section>
      </div>
    </PageErrorBoundary>
  );
}
