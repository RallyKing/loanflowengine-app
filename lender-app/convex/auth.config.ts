import type { AuthConfig } from "convex/server";

/**
 * Native workspace JWT (RS256) issued by Next.js `/api/convex/token` after cookie
 * session verification. NOT Clerk — see `lib/auth/convexJwt.ts` and `audit:no-clerk`.
 *
 * Convex dashboard env (must match Next.js issuer + JWKS URL):
 *   CONVEX_JWT_ISSUER=https://your-app.vercel.app
 *   CONVEX_JWT_APPLICATION_ID=dlc-workspace
 *   CONVEX_JWT_JWKS_URL=https://your-app.vercel.app/.well-known/jwks.json
 */
const issuer = process.env.CONVEX_JWT_ISSUER?.trim();
const jwksUrl = process.env.CONVEX_JWT_JWKS_URL?.trim();
const applicationID =
  process.env.CONVEX_JWT_APPLICATION_ID?.trim() || "dlc-workspace";

const providers: AuthConfig["providers"] =
  issuer && jwksUrl
    ? [
        {
          type: "customJwt",
          applicationID,
          issuer,
          jwks: jwksUrl,
          algorithm: "RS256",
        },
      ]
    : [];

export default {
  providers,
} satisfies AuthConfig;
