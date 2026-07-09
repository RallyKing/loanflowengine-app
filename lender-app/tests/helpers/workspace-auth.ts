import type { Browser, Page } from "@playwright/test";

import type { E2ETestPersona } from "../../lib/testing/e2eUserCatalog";
import { E2E_USER_CATALOG } from "../../lib/testing/e2eUserCatalog";

/**
 * Cookie-session helpers for Playwright.
 *
 * **Default:** Prefer E2E sandbox users (`APP_AUTH_E2E_USERS_ENABLED=true` + `E2E_PASS_*`)
 * so repeated automation does not trip lockout on real customer accounts.
 *
 * **Escape hatch:** `PLAYWRIGHT_USE_PRIMARY_AUTH=1` forces primary auth creds
 * (`APP_AUTH_PRIMARY_*` or `APP_AUTH_*`) only (not recommended against production).
 *
 * Persona override: `PLAYWRIGHT_E2E_PERSONA` (e.g. `loan_officer`). Defaults to `super_admin`.
 */

const SESSION_COOKIE_NAME = "dlc_session";

function getPrimaryCreds(): { username: string; password: string } | null {
  const username =
    process.env.APP_AUTH_PRIMARY_EMAIL?.trim() ??
    process.env.APP_AUTH_USERNAME?.trim() ??
    "";
  const password =
    process.env.APP_AUTH_PRIMARY_PASSWORD ??
    process.env.APP_AUTH_PASSWORD ??
    "";
  if (!username || !password) return null;
  return { username, password };
}

function resolvedE2EPersona(): E2ETestPersona {
  const raw = process.env.PLAYWRIGHT_E2E_PERSONA?.trim();
  if (raw) {
    const entry = E2E_USER_CATALOG.find((e) => e.persona === raw);
    if (entry) return entry.persona;
  }
  return "super_admin";
}

function e2eSignInReady(): boolean {
  return (
    process.env.APP_AUTH_E2E_USERS_ENABLED === "true" &&
    testPersonaReady(resolvedE2EPersona())
  );
}

/**
 * Resolved username/password for `/api/auth/login` — same precedence as `signInWorkspaceSession`.
 */
export function playwrightLoginCredentials(): { username: string; password: string } | null {
  if (process.env.PLAYWRIGHT_USE_PRIMARY_AUTH === "1") {
    return getPrimaryCreds();
  }
  if (e2eSignInReady()) {
    const persona = resolvedE2EPersona();
    const entry = E2E_USER_CATALOG.find((e) => e.persona === persona);
    if (!entry) return null;
    const password = process.env[`E2E_PASS_${entry.passEnvSuffix}`];
    if (typeof password !== "string" || !password.length) return null;
    return { username: entry.username, password };
  }
  return getPrimaryCreds();
}

/**
 * `assertSameSiteRequest` on `/api/auth/login` requires `Origin` to match `Host`.
 * `page.request.post` omits `Origin` unless set; establish a same-origin navigation first.
 */
function isTransientLoginTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|network/i.test(message);
}

async function postLogin(
  page: Page,
  username: string,
  password: string,
): Promise<import("@playwright/test").APIResponse> {
  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/interrupted by another navigation/i.test(message)) {
      throw error;
    }
    await page.waitForURL(/\/login(?:\?|$)/i, { timeout: 15_000 });
  }
  const origin = new URL(page.url()).origin;
  const maxAttempts = 4;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await page.request.post("/api/auth/login", {
        data: { username, password },
        headers: { Origin: origin },
      });
    } catch (error) {
      lastError = error;
      if (!isTransientLoginTransportError(error) || attempt === maxAttempts) {
        throw error;
      }
      await page.waitForTimeout(400 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Signs in via `/api/auth/login` using `playwrightLoginCredentials()`. */
export async function signInWorkspaceSession(page: Page): Promise<void> {
  const creds = playwrightLoginCredentials();
  if (!creds) {
    throw new Error(
      "signInWorkspaceSession: no auth path — set APP_AUTH_E2E_USERS_ENABLED=true and E2E_PASS_* (sandbox), or APP_AUTH_PRIMARY_* / APP_AUTH_* primary creds, or PLAYWRIGHT_USE_PRIMARY_AUTH=1",
    );
  }
  const res = await postLogin(page, creds.username, creds.password);
  if (!res.ok()) {
    throw new Error(`signInWorkspaceSession: ${res.status()} ${await res.text()}`);
  }
}

/** Sign in as a seeded E2E persona (`lib/testing/e2eUserCatalog.ts`). */
export async function signInWithTestPersona(
  page: Page,
  persona: E2ETestPersona,
): Promise<void> {
  const entry = E2E_USER_CATALOG.find((e) => e.persona === persona);
  if (!entry) throw new Error(`Unknown E2E persona: ${persona}`);
  if (persona === "client_portal") {
    throw new Error("Use portal-specific login for client_portal persona.");
  }
  const passKey = `E2E_PASS_${entry.passEnvSuffix}`;
  const password = process.env[passKey];
  if (!password) {
    throw new Error(`Missing env ${passKey} for persona ${persona}`);
  }
  const res = await postLogin(page, entry.username, password);
  if (!res.ok()) {
    throw new Error(
      `signInWithTestPersona(${persona}): ${res.status()} ${await res.text()}`,
    );
  }
}

/** @deprecated No-op retained for older specs; prefer `use` fixtures. */
export async function registerWorkspaceSessionHook(_arg?: Browser | unknown): Promise<void> {
  void _arg;
}

/** True when Playwright can obtain a workspace session. */
export function workspaceSessionReady(_page?: Page | unknown, _arg?: unknown): boolean {
  void _page;
  void _arg;
  return playwrightLoginCredentials() !== null;
}

/** True when a given persona has a password env var (and is not portal-only). */
export function testPersonaReady(persona: E2ETestPersona): boolean {
  if (persona === "client_portal") return false;
  const entry = E2E_USER_CATALOG.find((e) => e.persona === persona);
  if (!entry) return false;
  const v = process.env[`E2E_PASS_${entry.passEnvSuffix}`];
  return typeof v === "string" && v.length > 0;
}

export { SESSION_COOKIE_NAME };
