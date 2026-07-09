"use client";

import { useEffect, useRef } from "react";
import {
  getConvexSubDiagnostics,
  isConvexSubDebugEnabled,
  type ConvexSubDiagBucket,
} from "@/lib/convexSubDiagnostics";
import {
  getConvexCostGovernance,
  type ConvexCostRoute,
} from "@/lib/convexCostGovernance";

export function useConvexSubMountTrace(scope: ConvexSubDiagBucket) {
  useEffect(() => {
    if (!isConvexSubDebugEnabled()) return;
    const diag = getConvexSubDiagnostics();
    diag.bump(scope, "mount");
    diag.log(scope, "mount");
    return () => {
      diag.bump(scope, "unmount");
      diag.log(scope, "unmount");
    };
  }, [scope]);
}

export function useConvexSubRenderTrace(scope: ConvexSubDiagBucket) {
  const diag = getConvexSubDiagnostics();
  if (isConvexSubDebugEnabled()) {
    diag.recordRender(scope);
  }
}

export function useConvexSubQueryArgsTrace(
  scope: ConvexSubDiagBucket | string,
  args: unknown,
  options?: { queryKey?: string; route?: ConvexCostRoute },
) {
  const argsKey =
    args === "skip" ? "skip" : JSON.stringify(args ?? null);
  const queryKey = options?.queryKey ?? scope;
  const route = options?.route;

  useEffect(() => {
    getConvexCostGovernance().registerSubscription({
      scope,
      queryKey,
      queryArgs: args,
      route,
    });
    if (isConvexSubDebugEnabled()) {
      getConvexSubDiagnostics().recordQueryArgs(scope, args);
    }
    return () => {
      getConvexCostGovernance().unregisterSubscription(scope);
    };
  }, [scope, argsKey, queryKey, route, args]);
}

export function useConvexSubPillTrace(
  hubState: string | null | undefined,
  hubActivity: string | null | undefined,
) {
  const prevRef = useRef<string>("");
  useEffect(() => {
    if (!isConvexSubDebugEnabled()) return;
    const key = `${hubState ?? "?"}|${hubActivity ?? "?"}`;
    if (prevRef.current && prevRef.current !== key) {
      getConvexSubDiagnostics().recordPillFlip(prevRef.current, key);
    }
    prevRef.current = key;
  }, [hubState, hubActivity]);
}
