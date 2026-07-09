"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

export const COLOR_SCHEME_STORAGE_KEY = "dlc-color-scheme";

export type ColorScheme = "default" | "saas";

const ColorSchemeContext = createContext<{
  scheme: ColorScheme;
  setScheme: (s: ColorScheme) => void;
} | null>(null);

function readScheme(): ColorScheme {
  if (typeof window === "undefined") return "saas";
  try {
    const v = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
    if (v === "saas" || v === "default") return v;
  } catch {
    /* private mode */
  }
  return "saas";
}

/**
 * User-selectable UI shell: classic DLC forest/gold, or a SaaS-style
 * deep-green nav + light workspace + blue action accents.
 */
export function ColorSchemeProvider({ children }: { children: React.ReactNode }) {
  const [scheme, setSchemeState] = useState<ColorScheme>("saas");

  useLayoutEffect(() => {
    const s = readScheme();
    setSchemeState(s);
    document.documentElement.setAttribute("data-color-scheme", s);
  }, []);

  const setScheme = useCallback((s: ColorScheme) => {
    setSchemeState(s);
    try {
      localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, s);
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute("data-color-scheme", s);
  }, []);

  const v = useMemo(
    () => ({ scheme, setScheme }),
    [scheme, setScheme]
  );

  return (
    <ColorSchemeContext.Provider value={v}>
      {children}
    </ColorSchemeContext.Provider>
  );
}

export function useColorScheme(): {
  scheme: ColorScheme;
  setScheme: (s: ColorScheme) => void;
} {
  const c = useContext(ColorSchemeContext);
  if (!c) {
    throw new Error("useColorScheme must be used within ColorSchemeProvider");
  }
  return c;
}
