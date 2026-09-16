/**
 * Capture the current viewport as a PNG File for bug reports.
 * Uses `html-to-image` (works in Next 15 client components).
 *
 * Performance notes (heavy DOM / pipeline hub):
 * - Prefer a smaller capture root when the app scroll owner exists.
 * - Avoid `cacheBust` on first pass (images are already in the page).
 * - Cap pixelRatio below 2× — triage does not need retina-scale rasters.
 * Timing is logged via `console.info` so we can verify improvements in DevTools.
 */

import { toBlob } from "html-to-image";
import {
  BUG_REPORT_MAX_SCREENSHOT_BYTES,
  validateBugReportScreenshotSize,
} from "@/lib/bugReportValidation";

export type ViewportScreenshotResult = {
  file: File;
  objectUrl: string;
  width: number;
  height: number;
};

/** Cap below retina 2× — CSS pixels (+ slight bump) are enough for triage. */
const CAPTURE_PIXEL_RATIO_CAP = 1.25;

function stampFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `lfe-bug-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
}

function resolveCaptureRoot(): HTMLElement {
  // Prefer the authenticated scroll owner (smaller tree than <html>).
  const main = document.querySelector<HTMLElement>("[data-app-main-scroll]");
  if (main) return main;
  if (document.body) return document.body;
  return document.documentElement;
}

function bugReportUiFilter(node: HTMLElement): boolean {
  // Skip the bug-report UI itself if open (safe for open-during-capture).
  if (node.dataset?.bugReportOverlay === "true") return false;
  if (node.dataset?.bugReportFab === "true") return false;
  if (node.getAttribute("data-testid") === "report-bug-dialog") return false;
  return true;
}

async function toViewportBlob(
  root: HTMLElement,
  width: number,
  height: number,
  options: { cacheBust: boolean; pixelRatio: number },
): Promise<Blob | null> {
  return toBlob(root, {
    cacheBust: options.cacheBust,
    pixelRatio: options.pixelRatio,
    width,
    height,
    style: {
      // Avoid capturing scrolled-off content as a tall strip when possible.
      transform: "none",
      width: `${width}px`,
      height: `${height}px`,
      overflow: "hidden",
    },
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return true;
      return bugReportUiFilter(node);
    },
  });
}

/**
 * Capture the viewport tree clipped to window metrics.
 * Callers should revoke `objectUrl` when done.
 */
export async function captureViewportScreenshot(): Promise<ViewportScreenshotResult> {
  if (typeof document === "undefined") {
    throw new Error("Screenshot capture requires a browser.");
  }

  const width = Math.max(1, Math.round(window.innerWidth));
  const height = Math.max(1, Math.round(window.innerHeight));
  const root = resolveCaptureRoot();
  const pixelRatio = Math.min(
    CAPTURE_PIXEL_RATIO_CAP,
    window.devicePixelRatio || 1,
  );
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  // Fast path: no cache-bust (avoids re-fetching every <img> on heavy pages).
  let blob = await toViewportBlob(root, width, height, {
    cacheBust: false,
    pixelRatio,
  });

  // Retry once with cacheBust if the first pass produced nothing usable.
  let usedCacheBust = false;
  if (!blob) {
    usedCacheBust = true;
    blob = await toViewportBlob(root, width, height, {
      cacheBust: true,
      pixelRatio,
    });
  }

  const elapsedMs = Math.round(
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
      startedAt,
  );
  console.info("[bug-report] screenshot capture", {
    ms: elapsedMs,
    pixelRatio,
    cacheBust: usedCacheBust,
    root:
      root.id ||
      root.getAttribute("data-testid") ||
      root.tagName.toLowerCase(),
    viewport: `${width}x${height}`,
  });

  if (!blob) {
    throw new Error("Could not capture screenshot.");
  }

  const sizeErr = validateBugReportScreenshotSize(blob.size);
  if (sizeErr) {
    throw new Error(sizeErr);
  }
  if (blob.size > BUG_REPORT_MAX_SCREENSHOT_BYTES) {
    throw new Error(
      `Screenshot is too large (max ${Math.round(BUG_REPORT_MAX_SCREENSHOT_BYTES / (1024 * 1024))} MB).`,
    );
  }

  const file = new File([blob], stampFileName(), { type: "image/png" });
  const objectUrl = URL.createObjectURL(file);
  return { file, objectUrl, width, height };
}
