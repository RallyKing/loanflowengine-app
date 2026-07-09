"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveConnectionPhase } from "@/lib/connectionState";

/**
 * Values that change when the client may be able to succeed again after a
 * Convex attachment-query failure (tab focus, live connection, etc.).
 * Pass the returned array to `ConvexQueryBoundary` as `recoverOnKeys`.
 */
export function useAttachmentQueryRecovery(
  canUseHub: boolean,
  phase: LiveConnectionPhase
): unknown[] {
  const [visibilityGen, setVisibilityGen] = useState(0);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        setVisibilityGen((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const prevHub = useRef(canUseHub);
  useEffect(() => {
    if (canUseHub && !prevHub.current) {
      setVisibilityGen((n) => n + 1);
    }
    prevHub.current = canUseHub;
  }, [canUseHub]);

  const prevPhase = useRef(phase);
  useEffect(() => {
    if (phase === "connected" && prevPhase.current !== "connected") {
      setVisibilityGen((n) => n + 1);
    }
    prevPhase.current = phase;
  }, [phase]);

  return useMemo(
    () => [canUseHub, phase, visibilityGen] as unknown[],
    [canUseHub, phase, visibilityGen]
  );
}
