"use client";



import { usePathname } from "next/navigation";

import { useLayoutEffect } from "react";

import {

  PHASE_24_4Q_PROGRAMMING_PURGE,

  PIPELINE_PROGRAMMING_PURGE_HTML_ATTR,

  PIPELINE_SCROLL_BEHAVIOR_AUTO_HTML_ATTR,

} from "@/lib/debug/phase24-4Q-programming-purge";

import { resolvePipelineSurfaceRoute } from "@/lib/navigation/isPipelineSurfaceRoute";

import { setPipelineViewportNavSignalsFrozen } from "@/lib/navigation/useResponsiveNavLayout";

import { setPipelineNarrowViewportFrozen } from "@/lib/useNarrowViewport";



/**

 * Phase 24.4Q — freeze viewport hooks on pipeline surfaces (structural stability).

 */

export function PipelineProgrammingPurgeMount() {

  const pathname = usePathname();



  useLayoutEffect(() => {

    const onPipeline = resolvePipelineSurfaceRoute(pathname);

    const purge = PHASE_24_4Q_PROGRAMMING_PURGE;



    if (onPipeline && purge.freezeViewportSignals) {

      setPipelineViewportNavSignalsFrozen(true);

    } else {

      setPipelineViewportNavSignalsFrozen(false);

    }



    if (onPipeline && purge.freezeNarrowViewport) {

      setPipelineNarrowViewportFrozen(true);

    } else {

      setPipelineNarrowViewportFrozen(false);

    }



    document.documentElement.toggleAttribute(

      PIPELINE_PROGRAMMING_PURGE_HTML_ATTR,

      onPipeline && (purge.freezeViewportSignals || purge.freezeNarrowViewport),

    );

    document.documentElement.toggleAttribute(

      PIPELINE_SCROLL_BEHAVIOR_AUTO_HTML_ATTR,

      onPipeline && purge.forceScrollBehaviorAuto,

    );



    return () => {

      setPipelineViewportNavSignalsFrozen(false);

      setPipelineNarrowViewportFrozen(false);

      document.documentElement.removeAttribute(PIPELINE_PROGRAMMING_PURGE_HTML_ATTR);

      document.documentElement.removeAttribute(PIPELINE_SCROLL_BEHAVIOR_AUTO_HTML_ATTR);

    };

  }, [pathname]);



  return null;

}


