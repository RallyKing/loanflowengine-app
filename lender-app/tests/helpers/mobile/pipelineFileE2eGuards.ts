import { expect, type Page } from "@playwright/test";

/**
 * After navigating to `/pipeline/[id]`, wait until the workspace is usable or the
 * explicit not-found section appears (Convex miss / stale E2E id).
 */
export async function waitPipelineFileWorkspaceOrSkip(
  page: Page,
  testInfo: { skip: (cond: boolean, msg?: string) => void },
): Promise<void> {
  await expect
    .poll(
      async () => {
        const missing = await page
          .locator('[data-section-id="pipeline-file-not-found"]')
          .count();
        if (missing > 0) return "missing";
        const ws = await page.getByTestId("pipeline-workspace-scroll").count();
        if (ws > 0) return "ready";
        return "loading";
      },
      { timeout: 45_000 },
    )
    .not.toBe("loading");

  const missing = await page
    .locator('[data-section-id="pipeline-file-not-found"]')
    .count();
  if (missing > 0) {
    testInfo.skip(
      true,
      "Pipeline file missing for this session; set E2E_PIPELINE_SCROLL_FILE_ID (or PROD_PIPELINE_FILE_ID) to a valid Convex pipeline id.",
    );
  }
}
