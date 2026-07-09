"use client";



import { HelpCenterPanel } from "@/components/HelpCenterPanel";

import { ContextualQuickTip } from "@/components/ContextualQuickTip";

import { SilentFeatureErrorBoundary } from "@/components/SilentFeatureErrorBoundary";



/** Global help encyclopedia + route tips — fixed overlays, not inside `<main>`. */

export function HelpKnowledgeShellMount() {

  return (

    <>

      <SilentFeatureErrorBoundary feature="help-center-panel">

        <HelpCenterPanel />

      </SilentFeatureErrorBoundary>

      <ContextualQuickTip />

    </>

  );

}

