/**
 * `APIRequestContext` from the Playwright `request` fixture does not send
 * `Origin` by default; cookie-auth routes use `assertSameSiteRequest` and
 * reject without it (403). Browser `page.request` includes Origin.
 */
export function sameOriginApiHeaders(
  baseURL: string | undefined,
): Record<string, string> {
  if (!baseURL?.trim()) {
    throw new Error(
      "sameOriginApiHeaders: Playwright baseURL missing — check playwright.config use.baseURL.",
    );
  }
  return { Origin: baseURL.replace(/\/$/, "") };
}
