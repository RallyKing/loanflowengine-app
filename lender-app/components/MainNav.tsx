"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { PIPELINE_SUB_ITEMS } from "@/lib/navigation/navigationCatalog";
import {
  isActivePath,
  isPipelineZonePath,
} from "@/lib/navigation/navPathUtils";
import { useNavigationConfigOptional } from "@/components/navigation/NavigationConfigProvider";
import { resolveVisibleNavItems } from "@/lib/navigation/navigationResolve";
import { defaultResolvedConfig } from "@/lib/navigation/navigationResolve";

function NavPillLink({
  href,
  label,
  pathname,
  productTourId,
}: {
  href: string;
  label: string;
  pathname: string | null;
  productTourId?: string;
}) {
  const active = isActivePath(pathname, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      {...(productTourId ? { "data-product-tour": productTourId } : {})}
      className={cn(
        "relative rounded-md px-3 py-1.5 transition-colors",
        active
          ? "bg-brand-accent text-brand-accent-foreground font-semibold shadow-sm before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-brand-accent-foreground"
          : "text-foreground/85 hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

function NavSubmenu({
  id,
  label,
  items,
  pathname,
  isGroupActive,
}: {
  id: string;
  label: string;
  items: { href: string; label: string; tourId?: string }[];
  pathname: string | null;
  isGroupActive: (p: string | null) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const groupActive = isGroupActive(pathname);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  useEffect(() => {
    close();
  }, [pathname, close]);

  return (
    <div className="relative" ref={rootRef} data-nav-submenu={id} data-product-tour="pipeline">
      <button
        type="button"
        className={cn(
          "relative flex items-center gap-0.5 rounded-md px-3 py-1.5 pr-2 transition-colors",
          open || groupActive
            ? "bg-brand-accent text-brand-accent-foreground font-semibold shadow-sm before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-brand-accent-foreground"
            : "text-foreground/85 hover:bg-muted hover:text-foreground",
        )}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 opacity-90", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          id={listId}
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[12.5rem] rounded-lg border border-border bg-background py-1 text-sm shadow-lg ring-1 ring-foreground/5"
        >
          {items.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <li key={item.href} role="none">
                <Link
                  href={item.href}
                  role="menuitem"
                  onClick={close}
                  {...(item.tourId ? { "data-product-tour": item.tourId } : {})}
                  className={cn(
                    "block px-3 py-2",
                    active
                      ? "bg-brand-accent/10 font-medium text-foreground"
                      : "text-foreground/90 hover:bg-muted",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const PIPELINE_MENU_ITEMS = PIPELINE_SUB_ITEMS.map((s) => ({
  href: s.href,
  label: s.label,
  tourId: s.productTourId,
}));

/**
 * Top-level classic chrome navigation — config-driven when wrapped in `NavigationConfigProvider`.
 */
export function MainNav() {
  const pathname = usePathname();
  const navCtx = useNavigationConfigOptional();
  const resolved =
    navCtx?.resolvedItems ??
    resolveVisibleNavItems(navCtx?.config ?? defaultResolvedConfig());

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {resolved.map((entry) => {
        if (entry.pipelineGroup) {
          return (
            <NavSubmenu
              key={entry.id}
              id="pipeline"
              label="Pipeline"
              items={PIPELINE_MENU_ITEMS}
              pathname={pathname}
              isGroupActive={isPipelineZonePath}
            />
          );
        }
        return (
          <NavPillLink
            key={entry.id}
            href={entry.href}
            label={entry.label}
            pathname={pathname}
            productTourId={entry.productTourId}
          />
        );
      })}
    </nav>
  );
}
