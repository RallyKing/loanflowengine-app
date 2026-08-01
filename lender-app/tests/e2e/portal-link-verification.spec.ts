import { expect, test } from "@playwright/test";

test.describe("Portal link verification gateway", () => {
  test("verify-access page renders for unknown token without leaking payload", async ({
    page,
  }) => {
    await page.goto("/public/verify-access/invalid-token-abc123?returnTo=%2F");
    await expect(page.getByTestId("portal-verify-access")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Invalid Link")).toBeVisible();
    await expect(page.getByText("Lender Data Room")).toHaveCount(0);
  });
});
