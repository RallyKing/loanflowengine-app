"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import {
  installPipelineChromeDebugGlobal,
} from "@/lib/debug/pipelineChromeDebug";
import { resolvePipelineSurfaceRoute } from "@/lib/navigation/isPipelineSurfaceRoute";
import {
  PHASE_24_4K_NATIVE_SCROLL_TEST,
  PIPELINE_NATIVE_SCROLL_HTML_ATTR,
} from "@/lib/debug/phase24-4K-native-scroll-test";
import {
  PHASE_24_4N_VELOCITY_SCROLL_FIX,
  PIPELINE_VELOCITY_OVERSCROLL_HTML_ATTR,
} from "@/lib/debug/phase24-4N-velocity-scroll-fix";
import {
  PHASE_24_4L_DOM_MOUNT_LOCK,
  PIPELINE_NAV_DOM_LOCK_HTML_ATTR,
} from "@/lib/debug/phase24-4L-dom-mount-lock";
import {
  PHASE_24_4P_MASTER_LAYOUT_LOCKDOWN,
  PIPELINE_MASTER_LAYOUT_LOCK_HTML_ATTR,
  PIPELINE_SAFE_AREA_FROZEN_HTML_ATTR,
} from "@/lib/debug/phase24-4P-master-layout-lockdown";
import { resolvePipelineHubNativeScrollTestRoute } from "@/lib/navigation/isPipelineSurfaceRoute";
import {
  NATIVE_DOCUMENT_SCROLL_HTML_ATTR,
  PHASE_24_4R_NATIVE_SCROLL_PWA,
} from "@/lib/debug/phase24-4R-native-scroll-pwa";

/** Phase 24.4F — static chrome verification on pipeline routes. */
export function PipelineChromeDebugMount() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    installPipelineChromeDebugGlobal();
    const onPipeline = resolvePipelineSurfaceRoute(pathname);
    const nativeDocumentScroll =
      PHASE_24_4R_NATIVE_SCROLL_PWA.enableNativeDocumentScroll &&
      resolvePipelineHubNativeScrollTestRoute(pathname);
    const nativeScrollTest =
      !nativeDocumentScroll &&
      PHASE_24_4K_NATIVE_SCROLL_TEST &&
      !PHASE_24_4N_VELOCITY_SCROLL_FIX.revertNativeScrollTest &&
      resolvePipelineHubNativeScrollTestRoute(pathname);
    const velocityOverscroll =
      PHASE_24_4N_VELOCITY_SCROLL_FIX.velocityOverscrollNone && onPipeline;
    const masterLayoutLock =
      PHASE_24_4P_MASTER_LAYOUT_LOCKDOWN.lockTopHeader && onPipeline;
    const safeAreaFrozen =
      PHASE_24_4P_MASTER_LAYOUT_LOCKDOWN.freezeSafeAreaInsets && onPipeline;
    const navDomLock =
      PHASE_24_4L_DOM_MOUNT_LOCK && onPipeline;
    document.documentElement.toggleAttribute(
      "data-pipeline-static-chrome",
      onPipeline,
    );
    document.documentElement.toggleAttribute(
      NATIVE_DOCUMENT_SCROLL_HTML_ATTR,
      nativeDocumentScroll,
    );
    document.documentElement.toggleAttribute(
      PIPELINE_NATIVE_SCROLL_HTML_ATTR,
      nativeScrollTest,
    );
    document.documentElement.toggleAttribute(
      PIPELINE_NAV_DOM_LOCK_HTML_ATTR,
      navDomLock,
    );
    document.documentElement.toggleAttribute(
      PIPELINE_VELOCITY_OVERSCROLL_HTML_ATTR,
      velocityOverscroll,
    );
    document.documentElement.toggleAttribute(
      PIPELINE_MASTER_LAYOUT_LOCK_HTML_ATTR,
      masterLayoutLock,
    );
    document.documentElement.toggleAttribute(
      PIPELINE_SAFE_AREA_FROZEN_HTML_ATTR,
      safeAreaFrozen,
    );
    return () => {
      document.documentElement.removeAttribute("data-pipeline-static-chrome");
      document.documentElement.removeAttribute(NATIVE_DOCUMENT_SCROLL_HTML_ATTR);
      document.documentElement.removeAttribute(PIPELINE_NATIVE_SCROLL_HTML_ATTR);
      document.documentElement.removeAttribute(PIPELINE_NAV_DOM_LOCK_HTML_ATTR);
      document.documentElement.removeAttribute(PIPELINE_VELOCITY_OVERSCROLL_HTML_ATTR);
      document.documentElement.removeAttribute(PIPELINE_MASTER_LAYOUT_LOCK_HTML_ATTR);
      document.documentElement.removeAttribute(PIPELINE_SAFE_AREA_FROZEN_HTML_ATTR);
    };
  }, [pathname]);

  return null;
}
