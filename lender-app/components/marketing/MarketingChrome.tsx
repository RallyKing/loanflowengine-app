"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { MARKETING_BRAND_NAME } from "@/lib/marketingBrand";

export function MarketingNav({
  className,
}: {
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70",
        className,
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
        >
          {MARKETING_BRAND_NAME}
        </Link>
        <Link
          href="/login"
          className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background shadow-dlc-1 transition-all duration-dlc-standard ease-dlc-standard hover:scale-[1.02] hover:shadow-dlc-2 active:scale-[0.98]"
        >
          Partner / Client Login
        </Link>
      </div>
    </header>
  );
}

export function MarketingFooter({ className }: { className?: string }) {
  const year = new Date().getFullYear();
  return (
    <footer
      className={cn(
        "border-t border-border/40 bg-background",
        className,
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="text-xs text-muted-foreground">
          © {year} {MARKETING_BRAND_NAME}. All rights reserved.
        </p>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
          <Link
            href="/terms"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Terms of Service
          </Link>
          <Link
            href="/privacy"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Privacy Policy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
