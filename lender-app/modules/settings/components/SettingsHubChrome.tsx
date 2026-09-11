"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  AI_PROVIDERS_PATH,
  MESSAGE_TEMPLATES_PATH,
  SETTINGS_CATEGORIES,
  SETTINGS_SECTIONS,
  resolveCanonicalSettingsSection,
  type SettingsSectionId,
} from "@/lib/settingsRegistry";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

/**
 * Sticky Jump-to nav for the Settings hub. Collapses to a horizontal chip
 * scroller below `md`. Does not introduce a nested page scrollport.
 *
 * Layout classes must stay discoverable by Tailwind (`modules/` is in
 * `tailwind.config.ts` content) — otherwise desktop `md:flex-col` / width
 * utilities purge and the parent row layout squeezes content to blank.
 */
export function SettingsJumpNav({
  hashSection,
  isGlobalAdmin,
}: {
  hashSection: SettingsSectionId | null;
  isGlobalAdmin: boolean;
}) {
  const pathname = usePathname();
  const activeCanonical = hashSection
    ? resolveCanonicalSettingsSection(hashSection)
    : null;
  const onMessageTemplatesRoute =
    pathname === MESSAGE_TEMPLATES_PATH ||
    pathname.startsWith(`${MESSAGE_TEMPLATES_PATH}/`) ||
    pathname === "/settings/message-templates";
  const onAiProvidersRoute = pathname === AI_PROVIDERS_PATH;

  return (
    <nav
      className="w-full min-w-0 md:sticky md:top-28 md:w-56 md:shrink-0 md:self-start"
      aria-label="Settings sections"
      data-testid="settings-jump-nav"
    >
      <p className="mb-2 hidden text-xs font-medium uppercase tracking-wider text-muted-foreground md:block">
        Jump to
      </p>
      <div
        className="flex flex-row gap-1 overflow-x-auto pb-1 md:flex-col md:gap-5 md:overflow-visible md:pb-0"
        data-testid="settings-jump-nav-list"
      >
        {SETTINGS_CATEGORIES.filter(
          (category) => !category.adminOnly || isGlobalAdmin,
        ).map((category) => (
          <div
            key={category.id}
            className="flex shrink-0 flex-row gap-1 md:block md:w-full md:shrink"
            data-settings-jump-category={category.id}
          >
            <p
              className="hidden text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 md:mb-1.5 md:block"
              title={category.description}
            >
              {category.label}
            </p>
            <ul className="flex flex-row gap-1 md:w-full md:flex-col md:gap-0.5">
              {category.sectionIds
                .map((id) => SETTINGS_SECTIONS.find((s) => s.id === id))
                .filter(
                  (s): s is (typeof SETTINGS_SECTIONS)[number] =>
                    s != null && !s.jumpHidden,
                )
                .map((s) => {
                  const href = s.jumpHref ?? `#${s.id}`;
                  const active = s.jumpHref
                    ? (s.jumpHref === MESSAGE_TEMPLATES_PATH &&
                        onMessageTemplatesRoute) ||
                      (s.jumpHref === AI_PROVIDERS_PATH && onAiProvidersRoute) ||
                      activeCanonical === s.id ||
                      pathname === s.jumpHref
                    : activeCanonical === s.id;
                  const className = cn(
                    "block rounded-dlc-md border px-3 py-2 text-sm transition-colors duration-dlc-short ease-dlc-standard md:w-full md:py-1.5",
                    active
                      ? "border-primary/35 bg-primary/5 font-medium text-foreground shadow-dlc-1"
                      : "border-transparent text-muted-foreground hover:bg-dlc-surface-high/80 hover:text-foreground",
                  );
                  return (
                    <li key={s.id} className="shrink-0 md:w-full md:shrink">
                      {s.jumpHref ? (
                        <Link
                          href={href}
                          title={s.description}
                          className={className}
                          data-testid={`settings-jump-${s.id}`}
                        >
                          {s.label}
                        </Link>
                      ) : (
                        <a
                          href={href}
                          title={s.description}
                          className={className}
                          data-testid={`settings-jump-${s.id}`}
                        >
                          {s.label}
                        </a>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

export function SettingsSectionCard({
  id,
  title,
  description,
  children,
  className,
}: {
  id: SettingsSectionId;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={`settings-section-${id}`}
      aria-labelledby={`settings-heading-${id}`}
      className={cn(
        "scroll-mt-28 overflow-hidden rounded-dlc-xl border border-border/60 bg-dlc-surface shadow-dlc-1 md:scroll-mt-32",
        className,
      )}
      data-testid={`settings-section-${id}`}
    >
      <div className="border-b border-border/50 bg-dlc-surface-low/50 px-4 py-3 sm:px-5">
        <h2
          id={`settings-heading-${id}`}
          className="text-sm font-semibold tracking-tight text-foreground sm:text-base"
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            {description}
          </p>
        ) : null}
      </div>
      <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
        <SectionErrorBoundary
          fallback={
            <p className="text-sm text-muted-foreground">
              This section could not load. Refresh the page or try again later.
            </p>
          }
        >
          {children}
        </SectionErrorBoundary>
      </div>
    </section>
  );
}

export function SettingsSectionTabs<T extends string>({
  ariaLabel,
  tabs,
  value,
  onChange,
  testIdPrefix,
}: {
  ariaLabel: string;
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  testIdPrefix: string;
}) {
  return (
    <div
      className="flex flex-wrap gap-1 rounded-dlc-md border border-border/55 bg-dlc-surface-low/40 p-0.5"
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn(
              "min-h-9 flex-1 rounded-dlc-sm px-3 py-1.5 text-xs font-medium transition-colors duration-dlc-short ease-dlc-standard sm:flex-none sm:text-sm",
              selected
                ? "bg-dlc-surface-high text-foreground shadow-dlc-1"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid={`${testIdPrefix}-${tab.id}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
