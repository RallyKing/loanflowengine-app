"use client";

import { APP_DISPLAY_NAME } from "@/lib/brandIdentity";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type HelpOpenOptions = {
  /** Prefill the help search box. */
  query?: string;
  /** Open directly on this article id. */
  articleId?: string;
};

type HelpSupportContextValue = {
  isOpen: boolean;
  initialQuery: string;
  initialArticleId: string | null;
  openHelp: (opts?: HelpOpenOptions) => void;
  closeHelp: () => void;
  toggleHelp: () => void;
};

const HelpSupportContext = createContext<HelpSupportContextValue | null>(null);

function targetIsTextField(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest("[contenteditable='true']"));
}

export function HelpSupportProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState("");
  const [initialArticleId, setInitialArticleId] = useState<string | null>(null);

  const openHelp = useCallback((opts?: HelpOpenOptions) => {
    setInitialQuery((opts?.query ?? "").trim());
    setInitialArticleId(opts?.articleId?.trim() || null);
    setOpen(true);
  }, []);

  const closeHelp = useCallback(() => {
    setOpen(false);
  }, []);

  const toggleHelp = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setInitialQuery("");
      setInitialArticleId(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        closeHelp();
        return;
      }
      // ? / Shift+/ — open help when not typing in a field
      if (
        e.key === "?" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !targetIsTextField(e.target)
      ) {
        e.preventDefault();
        openHelp({});
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [closeHelp, isOpen, openHelp]);

  const value = useMemo(
    () => ({
      isOpen,
      initialQuery,
      initialArticleId,
      openHelp,
      closeHelp,
      toggleHelp,
    }),
    [closeHelp, initialArticleId, initialQuery, isOpen, openHelp, toggleHelp],
  );

  return (
    <HelpSupportContext.Provider value={value}>
      {children}
    </HelpSupportContext.Provider>
  );
}

export function useHelpSupport(): HelpSupportContextValue {
  const ctx = useContext(HelpSupportContext);
  if (!ctx) {
    throw new Error("useHelpSupport must be used within HelpSupportProvider");
  }
  return ctx;
}

/** Public support email from env; empty if not configured. */
export function getSupportMailtoHref(): string | null {
  const raw =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim()
      : "";
  if (!raw) return null;
  const subject = encodeURIComponent(
    `${APP_DISPLAY_NAME} — support request`,
  );
  const body = encodeURIComponent(
    "Please describe what you were trying to do and what happened (screenshots welcome).\n\n",
  );
  return `mailto:${raw}?subject=${subject}&body=${body}`;
}
