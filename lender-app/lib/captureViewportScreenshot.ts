/**
 * Capture the current viewport as an image File for bug reports.
 * Uses `html-to-image` (works in Next 15 client components).
 *
 * Performance (heavy DOM / pipeline hub):
 * - Yield to the browser before capture so the Report-a-bug sheet can paint.
 * - Prefer a smaller capture root (`[data-app-main-scroll]`).
 * - Avoid `cacheBust` on first pass; skip font embedding; JPEG @ 1× DPR.
 * - Skip video/iframe/canvas nodes; downscale the canvas output.
 * - Race a short timeout and return `null` so the form stays usable when
 *   the page is too heavy (timeout cannot abort mid-clone, but cheap options
 *   + degrade prevent multi-minute freezes from blocking submit UX).
 * Timing: `console.info("[bug-report] screenshot capture", …)`.
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

export type CaptureViewportScreenshotOptions = {
  /** Soft time budget; returns null if exceeded (capture may still finish later). */
  timeoutMs?: number;
  signal?: AbortSignal;
};

/** CSS pixels only — triage does not need retina rasters. */
const CAPTURE_PIXEL_RATIO = 1;
/** Soft budget so Capturing… does not hang indefinitely on huge DOMs. */
const DEFAULT_CAPTURE_TIMEOUT_MS = 8_000;
/** Cap output width to limit canvas raster cost. */
const MAX_CANVAS_WIDTH = 1280;
const JPEG_QUALITY = 0.72;

function stampFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `lfe-bug-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
}

function resolveCaptureRoot(): HTMLElement {
  // Prefer the authenticated scroll owner (smaller tree than <html>/<body>).
  const main = document.querySelector<HTMLElement>("[data-app-main-scroll]");
  if (main) return main;
  if (document.body) return document.body;
  return document.documentElement;
}

function shouldIncludeNode(node: HTMLElement): boolean {
  // Skip the bug-report UI itself if open (safe for open-during-capture).
  if (node.dataset?.bugReportOverlay === "true") return false;
  if (node.dataset?.bugReportFab === "true") return false;
  if (node.getAttribute("data-testid") === "report-bug-dialog") return false;
  if (node.dataset?.skipBugScreenshot === "true") return false;

  const tag = node.tagName;
  // Expensive / low-value for triage layout screenshots.
  if (
    tag === "VIDEO" ||
    tag === "IFRAME" ||
    tag === "CANVAS" ||
    tag === "OBJECT" ||
    tag === "EMBED"
  ) {
    return false;
  }
  return true;
}

function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<"timeout" | "aborted"> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve("aborted");
      return;
    }
    const timer = window.setTimeout(() => resolve("timeout"), ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        resolve("aborted");
      },
      { once: true },
    );
  });
}

async function toViewportBlob(
  root: HTMLElement,
  width: number,
  height: number,
  options: { cacheBust: boolean },
): Promise<Blob | null> {
  const scale = Math.min(1, MAX_CANVAS_WIDTH / width);
  const canvasWidth = Math.max(1, Math.round(width * scale));
  const canvasHeight = Math.max(1, Math.round(height * scale));

  return toBlob(root, {
    cacheBust: options.cacheBust,
    skipFonts: true,
    pixelRatio: CAPTURE_PIXEL_RATIO,
    type: "image/jpeg",
    quality: JPEG_QUALITY,
    backgroundColor: "#ffffff",
    width,
    height,
    canvasWidth,
    canvasHeight,
    style: {
      // Avoid capturing scrolled-off content as a tall strip when possible.
      transform: "none",
      width: `${width}px`,
      height: `${height}px`,
      overflow: "hidden",
    },
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return true;
      return shouldIncludeNode(node);
    },
  });
}

/**
 * Capture the viewport tree clipped to window metrics.
 * Returns `null` on timeout/abort (caller should allow submit without shot).
 * Callers should revoke `objectUrl` when done.
 */
export async function captureViewportScreenshot(
  opts: CaptureViewportScreenshotOptions = {},
): Promise<ViewportScreenshotResult | null> {
  if (typeof document === "undefined") {
    throw new Error("Screenshot capture requires a browser.");
  }
  if (opts.signal?.aborted) {
    return null;
  }

  // Let React paint the open sheet (“Capturing…”) before main-thread clone work.
  await yieldToPaint();
  if (opts.signal?.aborted) {
    return null;
  }

  const width = Math.max(1, Math.round(window.innerWidth));
  const height = Math.max(1, Math.round(window.innerHeight));
  const root = resolveCaptureRoot();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS;
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const work = (async (): Promise<Blob | null> => {
    // Fast path: no cache-bust (avoids re-fetching every <img> on heavy pages).
    let blob = await toViewportBlob(root, width, height, { cacheBust: false });
    if (!blob && !opts.signal?.aborted) {
      blob = await toViewportBlob(root, width, height, { cacheBust: true });
    }
    return blob;
  })();

  const raced = await Promise.race([
    work.then((blob) => ({ kind: "blob" as const, blob })),
    sleep(timeoutMs, opts.signal).then((reason) => ({
      kind: reason,
    })),
  ]);

  const elapsedMs = Math.round(
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
      startedAt,
  );

  if (raced.kind !== "blob") {
    console.info("[bug-report] screenshot capture", {
      ms: elapsedMs,
      pixelRatio: CAPTURE_PIXEL_RATIO,
      outcome: raced.kind,
      root:
        root.id ||
        root.getAttribute("data-testid") ||
        root.tagName.toLowerCase(),
      viewport: `${width}x${height}`,
    });
    // Abandoned work may still finish; ignore its result (no object URL created).
    void work.catch(() => undefined);
    return null;
  }

  const blob = raced.blob;
  console.info("[bug-report] screenshot capture", {
    ms: elapsedMs,
    pixelRatio: CAPTURE_PIXEL_RATIO,
    outcome: blob ? "ok" : "empty",
    format: "image/jpeg",
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

  const file = new File([blob], stampFileName(), { type: "image/jpeg" });
  const objectUrl = URL.createObjectURL(file);
  return { file, objectUrl, width, height };
}
