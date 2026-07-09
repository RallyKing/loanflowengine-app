import type { Metadata } from "next";
import { NavManager } from "@/components/navigation/NavManager";
import { SettingsBreadcrumb } from "@/components/settings/SettingsBreadcrumb";

export const metadata: Metadata = {
  title: "Navigation manager · Settings",
  description:
    "Customize primary routes, bottom navigation slots, quick actions, and layout preferences.",
};

export default function NavigationManagerPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <SettingsBreadcrumb
        parentSection="navigation"
        current="Navigation manager"
      />
      <h1 className="mb-6 text-xl font-semibold tracking-tight text-foreground">
        Navigation manager
      </h1>
      <NavManager />
    </div>
  );
}
