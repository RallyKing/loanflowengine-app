"use client";

import { useEffect } from "react";
import {
  dismissOperationalToast,
  showOperationalToast,
} from "@/lib/ui/operationalToast";

/** @deprecated Prefer `showOperationalToast` directly. */
export function EventToast({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
  className?: string;
}) {
  useEffect(() => {
    if (!message) return;
    const id = showOperationalToast({ title: message });
    const t = window.setTimeout(() => {
      dismissOperationalToast(id);
      onDismiss();
    }, 3200);
    return () => window.clearTimeout(t);
  }, [message, onDismiss]);

  return null;
}
