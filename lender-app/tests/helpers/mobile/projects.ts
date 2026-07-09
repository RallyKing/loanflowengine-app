import { test, type TestInfo } from "@playwright/test";

/** Primary CI pair — Android Chrome + iOS Safari (smallest matrix). */
export const MOBILE_CORE_PROJECT_NAMES = [
  "Mobile Chrome",
  "Mobile Safari",
] as const;

/** Full mobile touch matrix (+ iPad). */
export const MOBILE_TOUCH_PROJECT_NAMES = [
  "Mobile Chrome",
  "Mobile Chrome Galaxy",
  "Mobile Safari",
  "Mobile Safari SE",
  "iPad",
] as const;

export function isMobileCoreProject(projectName: string): boolean {
  return projectName === "Mobile Chrome" || projectName === "Mobile Safari";
}

export function isMobileTouchProject(projectName: string): boolean {
  return (MOBILE_TOUCH_PROJECT_NAMES as readonly string[]).includes(projectName);
}

export function isTabletProject(projectName: string): boolean {
  return projectName === "tablet" || projectName === "iPad";
}

/**
 * Playwright WebKit on Windows often flakes with localhost + cookie auth.
 * Run WebKit mobile/iPad projects on macOS/Linux CI or against a staging URL.
 */
export function skipPlaywrightWebKitOnWindows(testInfo: TestInfo): void {
  if (process.platform !== "win32") return;
  const n = testInfo.project.name;
  if (n.includes("Safari") || n === "iPad") {
    test.skip(
      true,
      "Playwright WebKit (Safari / iPad projects) on Windows: run on macOS/Linux CI or set PW_BASE_URL to a remote env",
    );
  }
}
