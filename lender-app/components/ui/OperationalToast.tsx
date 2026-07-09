"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  OP_TOAST_DESCRIPTION,
  OP_TOAST_DESTRUCTIVE,
  OP_TOAST_SUCCESS,
  OP_TOAST_SURFACE,
  OP_TOAST_TITLE,
} from "@/lib/ui/operationalFeedback";
import { layerZIndexStyle } from "@/lib/ui/layering";
import {
  dismissOperationalToast,
  subscribeOperationalToasts,
  type OperationalToastItem,
} from "@/lib/ui/operationalToast";
import { opMotionStructuralTransition } from "@/lib/ui/operationalMotion";

function ToastCard({
  item,
  onDismiss,
}: {
  item: OperationalToastItem;
  onDismiss: () => void;
}) {
  const variant = item.variant ?? "default";
  return (
    <div
      role="status"
      className={cn(
        OP_TOAST_SURFACE,
        "flex items-start gap-3 px-4 py-3",
        opMotionStructuralTransition,
        variant === "destructive" && OP_TOAST_DESTRUCTIVE,
        variant === "success" && OP_TOAST_SUCCESS,
      )}
    >
      <div className="min-w-0 flex-1">
        <p data-toast-title className={OP_TOAST_TITLE}>
          {item.title}
        </p>
        {item.description ? (
          <p className={cn("mt-0.5", OP_TOAST_DESCRIPTION)}>{item.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        className="shrink-0 rounded-md p-1 text-muted-foreground/70 hover:bg-muted/40 hover:text-foreground"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** Global toast host — mount once inside AppChrome. */
export function OperationalToastHost() {
  const [stack, setStack] = useState<OperationalToastItem[]>([]);

  useEffect(() => subscribeOperationalToasts(setStack), []);

  if (stack.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[var(--dlc-z-toast,50)] flex flex-col items-center gap-2 px-3"
      style={layerZIndexStyle("TOAST")}
      aria-live="polite"
    >
      {stack.map((item) => (
        <div key={item.id} className="pointer-events-auto w-full max-w-sm">
          <ToastCard
            item={item}
            onDismiss={() => dismissOperationalToast(item.id)}
          />
        </div>
      ))}
    </div>
  );
}
