/**
 * Basic CSRF mitigation for cookie-authenticated POSTs from same-site browsers.
 */
export function assertSameSiteRequest(req: Request): void {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (!origin || !host) {
    throw new Error("Missing Origin or Host.");
  }
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    throw new Error("Invalid Origin.");
  }
  if (u.hostname.toLowerCase() !== host) {
    throw new Error("Origin does not match Host.");
  }
}
