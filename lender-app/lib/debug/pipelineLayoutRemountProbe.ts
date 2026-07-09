"use client";

import { useLayoutEffect, useRef } from "react";
import {
  isPipelineLayoutDebugEnabled,
  pipelineLayoutDebugController,
} from "@/lib/debug/pipelineLayoutDebug";

/**
 * Phase 24.4E — log React mount/remount when layout debug is enabled.
 * Call at top of pipeline hierarchy row components with a stable instance key.
 */
export function usePipelineLayoutRemountProbe(
  component: string,
  instanceKey: string,
): void {
  const mountGen = useRef(0);

  useLayoutEffect(() => {
    if (!isPipelineLayoutDebugEnabled()) return;
    mountGen.current += 1;
    pipelineLayoutDebugController.logComponentRemount({
      component,
      instanceKey,
      mountGeneration: mountGen.current,
      isRemount: mountGen.current > 1,
    });
  }, [component, instanceKey]);
}
