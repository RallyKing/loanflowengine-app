import Link from "next/link";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingChrome";
import { MARKETING_BRAND_NAME } from "@/lib/marketingBrand";
import { cn } from "@/lib/cn";

export function LegalDocumentShell({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {MARKETING_BRAND_NAME}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <article
          className={cn(
            "mt-10 space-y-6 text-sm leading-relaxed text-muted-foreground",
            "[&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground",
            "[&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground",
            "[&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5",
            "[&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5",
            "[&_strong]:font-semibold [&_strong]:text-foreground",
            className,
          )}
        >
          {children}
        </article>
        <p className="mt-12 text-sm text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:underline">
            ← Back to home
          </Link>
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
