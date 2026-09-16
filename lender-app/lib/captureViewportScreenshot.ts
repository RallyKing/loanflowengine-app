/**
 * Capture the current viewport as a PNG File for bug reports.
 * Uses `html-to-image` (works in Next 15 client components).
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

function stampFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `lfe-bug-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
}

/**
 * Capture `document.documentElement` (full page tree) clipped to viewport metrics.
 * Callers should revoke `objectUrl` when done.
 */
export async function captureViewportScreenshot(): Promise<ViewportScreenshotResult> {
  if (typeof document === "undefined") {
    throw new Error("Screenshot capture requires a browser.");
  }

  const width = Math.max(1, Math.round(window.innerWidth));
  const height = Math.max(1, Math.round(window.innerHeight));
  const root = document.documentElement;

  const blob = await toBlob(root, {
    cacheBust: true,
    pixelRatio: Math.min(2, window.devicePixelRatio || 1),
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
      // Skip the bug-report UI itself if open.
      if (node.dataset?.bugReportOverlay === "true") return false;
      if (node.dataset?.bugReportFab === "true") return false;
      if (node.getAttribute("data-testid") === "report-bug-dialog") return false;
      return true;
    },
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
