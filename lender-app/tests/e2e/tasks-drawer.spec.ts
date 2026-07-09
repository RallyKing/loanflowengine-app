import { test, expect, type Page } from "@playwright/test";
import { registerWorkspaceSessionHook, workspaceSessionReady, signInWorkspaceSession } from "../helpers/workspace-auth";
import { existsSync, readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { join } from "node:path";

function convexConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
}

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

function attachConvexFailureGuards(page: Page): { assertClean: () => void } {
  const messages: string[] = [];
  page.on("pageerror", (err) => {
    messages.push(`pageerror: ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      messages.push(`console: ${msg.text()}`);
    }
  });
  return {
    assertClean: () => {
      const bad = messages.filter((m) =>
        /could not find.*function|function not found|query.*not found|mutation.*not found|\[CONVEX/i.test(
          m
        )
      );
      expect(
        bad,
        `Expected no Convex missing-function style errors; got:\n${bad.join("\n")}`
      ).toEqual([]);
    },
  };
}

describeOrSkip("Task drawer + attachments (Convex)", () => {
  registerWorkspaceSessionHook(test);
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    if (!workspaceSessionReady()) {
      testInfo.skip(true, "Set APP_AUTH_USERNAME and APP_AUTH_PASSWORD");
    }
    await signInWorkspaceSession(page);
  });

  test("TaskDrawer renders; attachments work or degrade without breaking UI", async ({
    page,
  }, testInfo) => {
    const { assertClean } = attachConvexFailureGuards(page);

    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Task/i })).toBeVisible({
      timeout: 30_000,
    });

    await expect(page.getByText("Loading tasks…")).toHaveCount(0, {
      timeout: 45_000,
    });

    const openDetails = page.getByRole("button", { name: "Open task details" });
    if ((await openDetails.count()) === 0) {
      try {
        await expect(page.getByRole("button", { name: "Add" })).toBeEnabled({
          timeout: 45_000,
        });
      } catch {
        testInfo.skip(
          true,
          "Convex hub never enabled Add (no tasks to open drawer); check NEXT_PUBLIC_CONVEX_URL / network.",
        );
      }
      const addBtn = page.getByRole("button", { name: "Add" });
      await page.getByLabel("New task title").fill("E2E — drawer validation");
      await addBtn.click();
      await expect(openDetails.first()).toBeVisible({ timeout: 30_000 });
    }

    await openDetails.first().click();

    await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Description").first()).toBeVisible();

    const filesHeading = page.getByText(/Files.*attachments/i).first();
    await expect(filesHeading).toBeVisible({ timeout: 15_000 });

    const attachmentState = page.getByText(
      /No files attached yet|Loading attachments|Attachments unavailable|attachment data cannot be loaded/i
    );
    await expect(attachmentState.first()).toBeVisible({ timeout: 20_000 });

    const taskDlg = page.getByRole("dialog", { name: "Task" });
    const taskBody = taskDlg.locator(".touch-scroll-y.overflow-y-auto").first();
    await expect(taskBody).toBeVisible();
    const drawerScrollOk = await taskBody.evaluate((el) => {
      const d = document.createElement("div");
      d.setAttribute("data-e2e-task-drawer-probe", "");
      d.style.height = "700px";
      d.style.width = "1px";
      el.appendChild(d);
      return el.scrollHeight - el.clientHeight > 80;
    });
    expect(drawerScrollOk).toBeTruthy();
    const t0 = await taskBody.evaluate((el) => el.scrollTop);
    await taskBody.hover({ position: { x: 24, y: 48 } });
    for (let i = 0; i < 10; i += 1) await page.mouse.wheel(0, 180);
    const t1 = await taskBody.evaluate((el) => el.scrollTop);
    expect(t1).toBeGreaterThan(t0 + 20);
    await taskBody.evaluate(() =>
      document
        .querySelectorAll("[data-e2e-task-drawer-probe]")
        .forEach((n) => n.remove()),
    );

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Task" })).toHaveCount(0, {
      timeout: 10_000,
    });

    assertClean();
  });

  test("matrix row shows attachment indicator after upload", async ({
    page,
  }, testInfo) => {
    const { assertClean } = attachConvexFailureGuards(page);

    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Task/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Loading tasks…")).toHaveCount(0, {
      timeout: 45_000,
    });

    const existingOpen = page.getByRole("button", { name: "Open task details" });
    if ((await existingOpen.count()) === 0) {
      try {
        await expect(page.getByRole("button", { name: "Add" })).toBeEnabled({
          timeout: 45_000,
        });
      } catch {
        testInfo.skip(
          true,
          "Convex hub never enabled Add; cannot create task for attachment test.",
        );
      }
    }

    const uniqueLabel = `E2E paperclip ${Date.now()}`;
    const addForm = page.locator("form").filter({
      has: page.getByLabel("New task title"),
    });
    await addForm.getByLabel("New task title").fill(uniqueLabel);
    await addForm.getByRole("button", { name: "Add" }).click();

    const row = page.locator("li").filter({ hasText: uniqueLabel }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });

    await row.getByRole("button", { name: "Open task details" }).click();
    await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible({
      timeout: 15_000,
    });

    const fileInput = page.getByLabel(/Upload files to this task/i);
    await fileInput.setInputFiles({
      name: "e2e-attach.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("e2e"),
    });
    await expect(
      page.getByRole("dialog", { name: "Task" }).getByText("e2e-attach.txt"),
    ).toBeVisible({ timeout: 60_000 });

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Task" })).toHaveCount(0, {
      timeout: 10_000,
    });

    await expect(
      page
        .locator("li")
        .filter({ hasText: uniqueLabel })
        .getByTitle(/1 file\(s\) attached/),
    ).toBeVisible({ timeout: 60_000 });

    assertClean();
  });
});
