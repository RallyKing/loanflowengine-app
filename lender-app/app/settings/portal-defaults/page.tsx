import type { Metadata } from "next";
import { SettingsBreadcrumb } from "@/components/settings/SettingsBreadcrumb";
import { PortalDefaultsManager } from "@/components/settings/PortalDefaultsManager";

export const metadata: Metadata = {
  title: "Portal defaults · Settings",
  description:
    "Create reusable portal default templates for clients, lenders, referrers, and deal partners.",
};

export default function PortalDefaultsSettingsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 max-md:px-4">
      <SettingsBreadcrumb
        parentSection="organization"
        current="Portal defaults"
      />
      <h1 className="mb-2 text-xl font-semibold tracking-tight text-foreground">
        Portal defaults
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Build portal pages from premade sections, publish a version as the
        default, then assign it on contacts. Linked contacts appear under
        Portals &amp; Progress. Live invites still use the existing link
        repository.
      </p>
      <PortalDefaultsManager />
    </div>
  );
}
