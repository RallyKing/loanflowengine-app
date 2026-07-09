"use client";

/** Ensures capture-phase error listeners load on every route, before Convex mounts. */
import "@/components/debug/registerEarlyErrorTap";

export function DebugEarlyClientBootstrap() {
  return null;
}
