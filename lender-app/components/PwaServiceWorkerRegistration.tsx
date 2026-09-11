"use client";

import { useEffect } from "react";

/** Registers public/sw.js once per tab for PWA install eligibility (+ Web Push). */
export function PwaServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const allowDev =
      process.env.NODE_ENV !== "production" &&
      process.env.NEXT_PUBLIC_WEB_PUSH_DEV === "1";
    if (process.env.NODE_ENV !== "production" && !allowDev) return;

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* Non-fatal — app remains usable without install prompt. */
    });
  }, []);

  return null;
}
