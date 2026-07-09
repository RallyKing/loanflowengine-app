import {
  parseConvexPublicUrl,
  convexHttpActionsBaseUrl,
} from "@/lib/convexPublicUrl";
import { ConvexHttpClient } from "convex/browser";
let cached: ConvexHttpClient | null = null;

export function getConvexHttpClient(): ConvexHttpClient {
  if (cached) return cached;
  const raw = process.env.NEXT_PUBLIC_CONVEX_URL;
  const parsed = parseConvexPublicUrl(raw);
  if (!parsed.ok) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured.");
  }
  cached = new ConvexHttpClient(parsed.href);
  return cached;
}

/** Origin for Convex `httpRouter` (hosted deployments). */
export function getConvexSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_CONVEX_URL;
  const parsed = parseConvexPublicUrl(raw);
  if (!parsed.ok) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured.");
  }
  return convexHttpActionsBaseUrl(parsed.href);
}
