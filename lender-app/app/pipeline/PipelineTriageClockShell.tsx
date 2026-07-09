"use client";

import type { ReactNode } from "react";
import { TriageClockProvider } from "@/components/providers/TriageClockProvider";

export function PipelineTriageClockShell({ children }: { children: ReactNode }) {
  return <TriageClockProvider>{children}</TriageClockProvider>;
}
