"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/sessionUiClient";

type TokenProbe = "idle" | "loading" | "ready" | "failed";

/**
 * Bridges the native workspace cookie session to Convex via `/api/convex/token`.
 * Replaces trusting client-supplied `memberUserKey` args.
 *
 * Convex customJwt requires a valid RS256 token before org-scoped queries run;
 * we keep `isLoading` true until the first token probe succeeds.
 */
export function useConvexWorkspaceAuth() {
  const { isLoaded, isSignedIn } = useAuth();
  const [tokenProbe, setTokenProbe] = useState<TokenProbe>("idle");
  const probeGenRef = useRef(0);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      void forceRefreshToken;
      try {
        const res = await fetch("/api/convex/token", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[convex-jwt] /api/convex/token failed", res.status);
          }
          return null;
        }
        const body = (await res.json()) as { ok?: boolean; token?: string };
        const token = body.ok && body.token ? body.token : null;
        if (!token && process.env.NODE_ENV === "development") {
          console.warn("[convex-jwt] token endpoint returned no token");
        }
        return token;
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[convex-jwt] token fetch error", err);
        }
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setTokenProbe("idle");
      return;
    }

    const gen = ++probeGenRef.current;
    setTokenProbe("loading");

    const attemptFetch = (attempt: number) => {
      void fetchAccessToken({ forceRefreshToken: attempt > 0 }).then((token) => {
        if (probeGenRef.current !== gen) return;
        if (token) {
          setTokenProbe("ready");
          return;
        }
        if (attempt < 4) {
          window.setTimeout(() => attemptFetch(attempt + 1), 800 * (attempt + 1));
          return;
        }
        setTokenProbe("failed");
        console.error(
          "[convex-jwt] token probe failed after retries — org queries stay skipped until refresh",
        );
      });
    };

    attemptFetch(0);
  }, [isLoaded, isSignedIn, fetchAccessToken]);

  return useMemo(
    () => ({
      isLoading:
        !isLoaded || (isSignedIn && (tokenProbe === "idle" || tokenProbe === "loading")),
      /** True only when `/api/convex/token` returned a JWT Convex can validate. */
      isAuthenticated: isLoaded && isSignedIn && tokenProbe === "ready",
      fetchAccessToken,
    }),
    [isLoaded, isSignedIn, tokenProbe, fetchAccessToken],
  );
}
