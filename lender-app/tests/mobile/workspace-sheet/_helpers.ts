import { expect, type Page } from "@playwright/test";

import { waitPipelineFileWorkspaceOrSkip } from "../../helpers/mobile/pipelineFileE2eGuards";

import {

  dismissMobileNavIfOpen,

  ensurePipelineHubListVisible,

  waitPipelineFileWorkspaceLoaded,

  waitPipelineHubReady,
  isPipelineHubDegraded,

} from "../../helpers/mobile/pipelineHubReady";



export function convexConfigured(): boolean {

  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL?.trim());

}



export { dismissMobileNavIfOpen };



/**

 * Lands on a pipeline file detail URL for workspace-sheet tests.

 */

export async function openAnyPipelineFileWorkspace(

  page: Page,

  testInfo: { skip: (cond: boolean, msg?: string) => void },

): Promise<void> {

  await page.goto("/pipeline", { waitUntil: "domcontentloaded" });

  await dismissMobileNavIfOpen(page);

  await waitPipelineHubReady(page, { allowDegraded: true });

  if (await isPipelineHubDegraded(page).isVisible().catch(() => false)) {
    testInfo.skip(
      true,
      "Pipeline hub unavailable (Convex/org scope). Retry when Convex is healthy.",
    );
    return;
  }

  await ensurePipelineHubListVisible(page);

  if (await isPipelineHubDegraded(page).isVisible().catch(() => false)) {
    testInfo.skip(
      true,
      "Pipeline hub unavailable (Convex/org scope). Retry when Convex is healthy.",
    );
    return;
  }

  const envId =

    process.env.E2E_PIPELINE_SCROLL_FILE_ID?.trim() ||

    process.env.PROD_PIPELINE_FILE_ID?.trim();

  if (envId) {

    await page.goto(`/pipeline/${encodeURIComponent(envId)}`, {

      waitUntil: "domcontentloaded",

    });

    await dismissMobileNavIfOpen(page);

  } else {

    const openControl = page.locator('[title="Open file"], a[aria-label^="Open file"]').first();

    const hasOpen = await openControl.isVisible({ timeout: 8_000 }).catch(() => false);

    if (!hasOpen) {

      testInfo.skip(

        true,

        "Need visible Open file control, or set E2E_PIPELINE_SCROLL_FILE_ID / PROD_PIPELINE_FILE_ID",

      );

      return;

    }

    const fallbackFileId =

      await page.locator("[data-pipeline-row]").first().getAttribute("data-pipeline-row");

    await openControl.click({ timeout: 10_000 });

    const navigated = await page

      .waitForURL(/\/pipeline\/[^/]+$/i, { timeout: 10_000 })

      .then(() => true)

      .catch(() => false);

    if (!navigated) {

      if (!fallbackFileId?.trim()) {

        testInfo.skip(

          true,

          "Open file navigation did not complete and no fallback pipeline row id was available.",

        );

        return;

      }

      await page.goto(`/pipeline/${encodeURIComponent(fallbackFileId.trim())}`, {

        waitUntil: "domcontentloaded",

      });

      await dismissMobileNavIfOpen(page);

    }

  }



  await waitPipelineFileWorkspaceOrSkip(page, testInfo);

  await waitPipelineFileWorkspaceLoaded(page);

}


