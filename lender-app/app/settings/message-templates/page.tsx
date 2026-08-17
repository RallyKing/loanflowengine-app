import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { AUTOMATIONS_PATH } from "@/lib/settingsRegistry";

export const metadata: Metadata = {
  title: "Message templates · Automations",
  description:
    "Message templates moved to Automations. Redirecting to the canonical template hub.",
};

/**
 * Legacy Settings route — thin redirect so Automations owns the template hub
 * (no shadow second UI). Deep links keep working.
 */
export default function MessageTemplatesSettingsPage() {
  permanentRedirect(AUTOMATIONS_PATH);
}
