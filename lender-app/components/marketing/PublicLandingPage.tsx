import Link from "next/link";
import {
  Building2,
  FileStack,
  Globe2,
  LayoutGrid,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingChrome";
import {
  MARKETING_BRAND_NAME,
  MARKETING_DESCRIPTION,
} from "@/lib/marketingBrand";
import { cn } from "@/lib/cn";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Client Portals",
    description:
      "Frictionless, secure document uploads for borrowers — branded links, passcode gates, and audit trails.",
  },
  {
    icon: Building2,
    title: "Lender Data Rooms",
    description:
      "Curated, version-controlled access for institutional partners. Share only what you intend, when you intend.",
  },
  {
    icon: LayoutGrid,
    title: "Pipeline CRM",
    description:
      "Visual deal tracking from intake to funding. One workspace for files, contacts, tasks, and lender outreach.",
  },
  {
    icon: MessageSquare,
    title: "Task Automation",
    description:
      "Automated SMS and email notifications for missing documents, client reminders, and broker follow-ups.",
  },
  {
    icon: FileStack,
    title: "Dynamic Templates",
    description:
      "Standardized requirement stacks for rapid deal deployment. Apply once, inject tasks and folders instantly.",
  },
  {
    icon: Globe2,
    title: "USA-Based Infrastructure",
    description:
      "Hosted and maintained securely in the United States with enterprise-grade encryption and tenant isolation.",
  },
] as const;

export function PublicLandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <MarketingNav />
      <main>
        <section className="mx-auto max-w-6xl px-5 pb-24 pt-20 sm:px-8 sm:pt-28 lg:pt-32">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {MARKETING_BRAND_NAME}
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-[3.25rem]">
              Enterprise-Grade Deal Flow &amp; Documentation.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              {MARKETING_DESCRIPTION} Build client trust with bank-level security
              and automated pipelines.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-full bg-foreground px-8 text-sm font-semibold text-background shadow-dlc-2 transition-all duration-dlc-standard ease-dlc-standard hover:scale-[1.02] hover:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.45)] active:scale-[0.98]"
              >
                Partner / Client Login
              </Link>
              <p className="text-sm text-muted-foreground">
                Secure workspace for brokers, lenders, and funding teams.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-border/40 bg-dlc-surface/30 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="mb-12 max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Built for high-trust deal operations
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                Every capability reflects production workflow — document vaults,
                client portals, lender delivery, and pipeline CRM in one
                platform.
              </p>
            </div>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <li
                  key={title}
                  className={cn(
                    "group rounded-dlc-lg border border-border/50 bg-background p-6 shadow-dlc-1",
                    "transition-all duration-dlc-standard ease-dlc-standard",
                    "hover:-translate-y-0.5 hover:border-border hover:shadow-[0_0_40px_-12px_rgba(3,79,53,0.18)]",
                  )}
                >
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-dlc-md border border-border/60 bg-dlc-surface-high text-foreground transition-colors duration-dlc-standard group-hover:border-primary/30 group-hover:text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h3 className="text-base font-semibold tracking-tight">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="rounded-dlc-xl border border-border/50 bg-gradient-to-br from-dlc-surface-high/80 to-background px-8 py-12 text-center sm:px-12 sm:py-16">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Ready to open your workspace?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Sign in to manage deals, coordinate clients, and deliver
              documentation with confidence.
            </p>
            <Link
              href="/login"
              className="mt-8 inline-flex h-11 items-center justify-center rounded-full border border-foreground/15 bg-foreground px-7 text-sm font-semibold text-background transition-all duration-dlc-standard hover:opacity-90"
            >
              Go to Login
            </Link>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
