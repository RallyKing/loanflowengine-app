import { expect, type Page } from "@playwright/test";
import {
  isPipelineHubPath,
  isPipelineHubDegraded,
  isWorkspaceDegraded,
  recoverWorkspaceErrorBoundary,
} from "./pipelineHubReady";

/**
 * After navigating to `/pipeline/[id]`, wait until the workspace is usable or the
 * explicit not-found section appears (Convex miss / stale E2E id).
 */
export async function waitPipelineFileWorkspaceOrSkip(
  page: Page,
  testInfo: { skip: (cond: boolean, msg?: string) => void },
): Promise<void> {
  await recoverWorkspaceErrorBoundary(page);

  await expect
    .poll(
      async () => {
        await recoverWorkspaceErrorBoundary(page);

        if (await isWorkspaceDegraded(page).isVisible().catch(() => false)) {
          return "degraded";
        }

        const missing = await page
          .locator('[data-section-id="pipeline-file-not-found"]')
          .count();
        if (missing > 0) return "missing";

        const loading = await page
          .locator('[data-section-id="pipeline-file-loading"]')
          .count();
        if (loading > 0) return "loading";

        const ws = await page.getByTestId("pipeline-workspace-scroll").count();
        if (ws > 0) return "ready";

        const pathname = new URL(page.url()).pathname;
        if (isPipelineHubPath(pathname)) {
          if (await isPipelineHubDegraded(page).isVisible().catch(() => false)) {
            return "degraded";
          }
        }

        return "loading";
      },
      { timeout: 90_000, intervals: [250, 500, 1000, 2000] },
    )
    .toMatch(/^(ready|missing|degraded)$/);

  if (await isWorkspaceDegraded(page).isVisible().catch(() => false)) {
    testInfo.skip(
      true,
      "Pipeline workspace unavailable (Convex error boundary). Retry when Convex is healthy.",
    );
  }

  const missing = await page
    .locator('[data-section-id="pipeline-file-not-found"]')
    .count();
  if (missing > 0) {
    testInfo.skip(
      true,
      "Pipeline file missing for this session; set E2E_PIPELINE_SCROLL_FILE_ID (or PROD_PIPELINE_FILE_ID) to a valid Convex pipeline id.",
    );
  }

  await expect(page.getByTestId("pipeline-workspace-scroll")).toBeVisible({
    timeout: 15_000,
  });
}
