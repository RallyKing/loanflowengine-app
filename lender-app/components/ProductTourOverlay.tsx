"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import {
  PRODUCT_TOUR_STEP_COUNT,
  PRODUCT_TOUR_STEPS,
} from "@/lib/productTour";
import { useProductTour } from "@/lib/productTourContext";
import { shellZIndexStyle } from "@/lib/ui/layerTokens";

const PADDING = 10;
const HOLE_RADIUS = 10;

function queryTarget(id: string): HTMLElement | null {
  return document.querySelector(`[data-product-tour="${id}"]`);
}

/**
 * Full-screen dim + optional spotlight (box-shadow hole) + step tooltip.
 */
export function ProductTourOverlay() {
  const titleId = useId();
  const descId = useId();
  const { isActive, stepIndex, stopTour, nextStep, prevStep } =
    useProductTour();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [hasTarget, setHasTarget] = useState(false);

  const step = PRODUCT_TOUR_STEPS[stepIndex];
  const isLast = stepIndex >= PRODUCT_TOUR_STEP_COUNT - 1;

  const refreshRect = useCallback(() => {
    if (!isActive || !step) {
      setRect(null);
      setHasTarget(false);
      return;
    }
    const el = queryTarget(step.id);
    if (!el) {
      setRect(null);
      setHasTarget(false);
      return;
    }
    setHasTarget(true);
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    setRect(el.getBoundingClientRect());
  }, [isActive, step]);

  useLayoutEffect(() => {
    refreshRect();
  }, [refreshRect, stepIndex]);

  useEffect(() => {
    if (!isActive) return;
    const onResize = () => refreshRect();
    const onScroll = () => refreshRect();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    const t = window.setInterval(() => refreshRect(), 400);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      window.clearInterval(t);
    };
  }, [isActive, refreshRect]);

  useEffect(() => {
    if (!isActive) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") stopTour();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, stopTour]);

  const body = useMemo(() => {
    if (!isActive || !step || typeof document === "undefined") return null;

    const tip = hasTarget && rect ? step.tip : step.fallbackTip;

    const spotlight =
      hasTarget && rect
        ? (
            <div
              className="pointer-events-none fixed"
              style={{
                ...shellZIndexStyle("productTourHighlight"),
                left: rect.left - PADDING,
                top: rect.top - PADDING,
                width: rect.width + PADDING * 2,
                height: rect.height + PADDING * 2,
                borderRadius: HOLE_RADIUS,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.52)",
                transition: "left 0.2s, top 0.2s, width 0.2s, height 0.2s",
              }}
              aria-hidden
            />
          )
        : null;

    const tooltipAnchorStyle =
      hasTarget && rect
        ? {
            left: Math.min(
              Math.max(rect.left + rect.width / 2, 160),
              window.innerWidth - 160,
            ),
            top:
              rect.bottom + 220 < window.innerHeight
                ? rect.bottom + PADDING + 8
                : rect.top - PADDING - 8,
            transform:
              rect.bottom + 220 < window.innerHeight
                ? "translateX(-50%)"
                : "translate(-50%, -100%)",
          }
        : {
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          };

    return (
      <>
        <div
          className="fixed inset-0"
          style={{
            pointerEvents: "auto",
            background:
              hasTarget && rect ? "transparent" : "rgba(0, 0, 0, 0.55)",
            ...shellZIndexStyle("productTourBackdrop"),
          }}
          aria-hidden
        />
        {spotlight}
      <div
            className="fixed w-[min(22rem,calc(100dvw-2rem))] rounded-xl border border-border bg-background p-4 text-foreground shadow-2xl"
            style={{
              ...shellZIndexStyle("productTourPopover"),
              ...tooltipAnchorStyle,
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
          >
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tour · Step {stepIndex + 1} of {PRODUCT_TOUR_STEP_COUNT}
              </span>
              <span className="mt-1 block">{step.title}</span>
            </h2>
            <p
              id={descId}
              className="mt-2 text-sm leading-relaxed text-muted-foreground"
            >
              {tip}
            </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={stopTour}
            >
              Close
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={stepIndex === 0}
                onClick={prevStep}
              >
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={isLast ? stopTour : nextStep}
              >
                {isLast ? "Done" : "Next"}
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }, [isActive, step, stepIndex, hasTarget, rect, stopTour, nextStep, prevStep, isLast, titleId, descId]);

  if (!isActive || !body) return null;

  return createPortal(body, document.body);
}
