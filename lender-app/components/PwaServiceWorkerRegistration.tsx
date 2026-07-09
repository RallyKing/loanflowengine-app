"use client";

import { useEffect } from "react";

/** Registers public/sw.js once per tab for PWA install eligibility. */
export function PwaServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* Non-fatal — app remains usable without install prompt. */
    });
  }, []);

  return null;
}
