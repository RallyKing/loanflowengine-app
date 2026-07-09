"use client";

import { useLayoutEffect } from "react";
import {
  installPipelineLayoutDebugGlobal,
  isPipelineLayoutDebugEnabled,
  pipelineLayoutDebugController,
} from "@/lib/debug/pipelineLayoutDebug";

/** Phase 24.4E — layout shift forensics mount (opt-in). */
export function PipelineLayoutDebugMount() {
  useLayoutEffect(() => {
    installPipelineLayoutDebugGlobal();
    if (!isPipelineLayoutDebugEnabled()) return;
    pipelineLayoutDebugController.enable();
    return () => pipelineLayoutDebugController.disable();
  }, []);

  return null;
}
