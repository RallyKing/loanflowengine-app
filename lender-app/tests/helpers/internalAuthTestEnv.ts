import { parseConvexPublicUrl } from "../../lib/convexPublicUrl";

/** Convex-backed `/api/auth/*` routes (login, signup, …) need these in the test process and on the Next server. */
export function isInternalConvexAuthTestEnvReady(): boolean {
  if ((process.env.AUTH_BRIDGE_SECRET?.trim().length ?? 0) < 24) return false;
  return parseConvexPublicUrl(process.env.NEXT_PUBLIC_CONVEX_URL).ok;
}
