"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  type UserSettingsV1,
  applyUserSettingsToDocument,
  loadUserSettings,
  saveUserSettings,
  getDefaultUserSettings,
} from "@/lib/userSettingsStorage";

const UserSettingsContext = createContext<{
  settings: UserSettingsV1;
  update: (patch: Partial<UserSettingsV1>) => void;
} | null>(null);

export function UserSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UserSettingsV1>(getDefaultUserSettings);

  useLayoutEffect(() => {
    const s = loadUserSettings();
    setSettings(s);
    applyUserSettingsToDocument(s);
  }, []);

  // When the OS “reduce motion” flag flips, re-apply while `motionPreference === "system"`.
  useEffect(() => {
    if (settings.motionPreference !== "system") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      setSettings((s) => {
        applyUserSettingsToDocument(s);
        return s;
      });
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings.motionPreference]);

  const update = useCallback((patch: Partial<UserSettingsV1>) => {
    setSettings((prev) => {
      const next: UserSettingsV1 = {
        ...prev,
        ...patch,
        v: 1,
      };
      saveUserSettings(next);
      applyUserSettingsToDocument(next);
      return next;
    });
  }, []);

  const v = useMemo(
    () => ({ settings, update }),
    [settings, update]
  );

  return (
    <UserSettingsContext.Provider value={v}>
      {children}
    </UserSettingsContext.Provider>
  );
}

export function useUserSettings(): {
  settings: UserSettingsV1;
  update: (patch: Partial<UserSettingsV1>) => void;
} {
  const c = useContext(UserSettingsContext);
  if (!c) {
    throw new Error("useUserSettings must be used within UserSettingsProvider");
  }
  return c;
}
