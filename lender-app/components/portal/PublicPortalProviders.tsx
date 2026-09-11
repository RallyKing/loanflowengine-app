"use client";

/**
 * Lightweight provider shell for public / tokenized portals.
 *
 * Root `app/layout.tsx` only mounts UserSettings / UserPreferences / ColorScheme
 * when a signed-in viewer exists. Client portal, lender delivery, upload, and
 * related public routes still share deal/PFS widgets that call those hooks —
 * wrap them here without AppChrome or org/auth chrome.
 */

import type { ReactNode } from "react";
import { ColorSchemeProvider } from "@/lib/colorScheme";
import { UserSettingsProvider } from "@/lib/userSettingsContext";
import { UserPreferencesProvider } from "@/lib/userPreferencesContext";

export function PublicPortalProviders({ children }: { children: ReactNode }) {
  return (
    <ColorSchemeProvider>
      <UserSettingsProvider>
        <UserPreferencesProvider>{children}</UserPreferencesProvider>
      </UserSettingsProvider>
    </ColorSchemeProvider>
  );
}
