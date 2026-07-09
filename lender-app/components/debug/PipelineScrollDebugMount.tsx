"use client";

import { useEffect } from "react";
import {
  installPipelineScrollDebugGlobal,
  isPipelineScrollDebugEnabled,
  pipelineScrollDebugController,
} from "@/lib/debug/pipelineScrollDebug";

/**
 * Phase 24.4C — mounts opt-in scroll forensics on pipeline routes only.
 * No UI; console API: window.PIPELINE_SCROLL_DEBUG
 */
export function PipelineScrollDebugMount() {
  useEffect(() => {
    installPipelineScrollDebugGlobal();
    if (!isPipelineScrollDebugEnabled()) return;
    pipelineScrollDebugController.enable();
    return () => pipelineScrollDebugController.disable();
  }, []);

  return null;
}
