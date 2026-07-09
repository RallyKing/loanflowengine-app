import Link from "next/link";
import {
  settingsCategoryForSection,
  settingsHref,
  settingsSectionMeta,
  type SettingsSectionId,
} from "@/lib/settingsRegistry";

/**
 * Hierarchical settings trail: Settings › [Category] › [Sub-section].
 * Category + section link back to the parent console anchor; the terminal
 * label is the current standalone page.
 */
export function SettingsBreadcrumb({
  parentSection,
  current,
}: {
  /** Settings hub section this page belongs to (anchor target). */
  parentSection: SettingsSectionId;
  /** Terminal crumb — the current sub-page title. */
  current: string;
}) {
  const category = settingsCategoryForSection(parentSection);
  const section = settingsSectionMeta(parentSection);
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
      data-testid="settings-breadcrumb"
    >
      <Link
        href={settingsHref()}
        className="rounded-dlc-sm transition-colors hover:text-foreground"
      >
        Settings
      </Link>
      {category ? (
        <>
          <span aria-hidden>›</span>
          <Link
            href={settingsHref(parentSection)}
            className="rounded-dlc-sm transition-colors hover:text-foreground"
          >
            {category.label}
          </Link>
        </>
      ) : null}
      {section ? (
        <>
          <span aria-hidden>›</span>
          <Link
            href={settingsHref(parentSection)}
            className="rounded-dlc-sm transition-colors hover:text-foreground"
          >
            {section.label}
          </Link>
        </>
      ) : null}
      <span aria-hidden>›</span>
      <span className="font-medium text-foreground" aria-current="page">
        {current}
      </span>
    </nav>
  );
}
