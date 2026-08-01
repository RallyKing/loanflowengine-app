import type { AuthConfig } from "convex/server";

/**
 * Native workspace JWT (RS256) issued by Next.js `/api/convex/token` after cookie
 * session verification. NOT Clerk — see `lib/auth/convexJwt.ts` and `audit:no-clerk`.
 *
 * Convex dashboard env (must match Next.js issuer + JWKS URL):
 *   CONVEX_JWT_ISSUER=https://your-app.vercel.app
 *   CONVEX_JWT_APPLICATION_ID=dlc-workspace
 *   CONVEX_JWT_JWKS_URL=https://your-app.vercel.app/.well-known/jwks.json
 *     (or data:application/json;base64,...)
 *
 * Optional second provider for local Next against prod Convex:
 *   CONVEX_JWT_LOCAL_ISSUER=http://localhost:3004
 *   CONVEX_JWT_LOCAL_JWKS_URL=data:application/json;base64,...
 */
const applicationID =
  process.env.CONVEX_JWT_APPLICATION_ID?.trim() || "dlc-workspace";

type JwtProvider = AuthConfig["providers"][number];

function customJwtProvider(
  issuer: string | undefined,
  jwks: string | undefined,
): JwtProvider | null {
  const iss = issuer?.trim();
  const keys = jwks?.trim();
  if (!iss || !keys) return null;
  return {
    type: "customJwt",
    applicationID,
    issuer: iss.replace(/\/$/, ""),
    jwks: keys,
    algorithm: "RS256",
  };
}

const providers: AuthConfig["providers"] = [
  customJwtProvider(
    process.env.CONVEX_JWT_ISSUER,
    process.env.CONVEX_JWT_JWKS_URL,
  ),
  customJwtProvider(
    process.env.CONVEX_JWT_LOCAL_ISSUER,
    process.env.CONVEX_JWT_LOCAL_JWKS_URL,
  ),
].filter((p): p is JwtProvider => p !== null);

export default {
  providers,
} satisfies AuthConfig;
