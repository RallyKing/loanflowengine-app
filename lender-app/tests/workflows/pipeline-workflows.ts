import type { Page } from "@playwright/test";

/** Shared navigation helpers for agent-style E2E flows (expand per roadmap). */
export async function openPipelineHub(page: Page) {
  await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
}

export async function assertMainScrollOwner(page: Page) {
  const main = page.locator("[data-app-main-scroll]");
  await main.waitFor({ state: "visible", timeout: 30_000 });
}
