import type { Metadata } from "next";
import { APP_DISPLAY_NAME } from "@/lib/brandIdentity";
import { SettingsPageClient } from "./SettingsPageClient";

export const metadata: Metadata = {
  title: `Settings · ${APP_DISPLAY_NAME}`,
  description:
    "Central preferences: appearance, accessibility, workflow defaults, data and connectivity, and more for this browser.",
};

export default function SettingsPage() {
  return <SettingsPageClient />;
}
