import type { AuthConfig } from "convex/server";

/**
 * Single-user deployment: authentication happens at the Next.js edge via the
 * cookie session (`lib/sessionAuth.ts`), so Convex itself is configured with
 * no JWT providers. `ctx.auth.getUserIdentity()` will usually return null;
 * server functions that need a viewer fall back via `convex/viewerIdentity.ts#requireIdentity`.
 */
export default {
  providers: [],
} satisfies AuthConfig;
