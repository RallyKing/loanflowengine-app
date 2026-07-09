/**
 * Convex React convention: **positional** `useQuery` only.
 *
 * ```tsx
 * import { useQuery } from "convex/react";
 * import { api } from "@/convex/_generated/api";
 *
 * const data = useQuery(api.module.functionName, enabled ? args : "skip");
 * ```
 *
 * Never pass `{ query, args }` as the first argument to `useQuery` — that
 * shape is not supported and will surface as a function reference error.
 *
 * To isolate failures, wrap UI in `ConvexQueryBoundary` or route-level error
 * boundaries instead of soft-query helpers.
 */

export type ConvexQueryTriState<T> =
  | { status: "pending"; data?: undefined; error?: undefined }
  | { status: "error"; data?: undefined; error: Error }
  | { status: "success"; data: T; error?: undefined };
