"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  clearClientPortalSessionToken,
  getClientPortalSessionToken,
} from "@/lib/clientPortalSession";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/cn";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PortalHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:max-w-2xl sm:px-6">
        {children}
      </main>
      <footer className="border-t border-border py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
        <p>
          Questions about your loan? Contact your loan officer or broker directly.
        </p>
        <p className="mt-1 opacity-90">
          This portal does not replace legal disclosures or signed agreements.
        </p>
      </footer>
    </div>
  );
}

function PortalHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const logoutMut = useMutation(api.clientPortal.logout);
  const showNav =
    pathname?.startsWith("/portal/files") === true ||
    pathname?.startsWith("/portal/file/") === true;

  async function logout() {
    const t = getClientPortalSessionToken();
    if (t) {
      try {
        await logoutMut({ sessionToken: t });
      } catch {
        /* still clear locally */
      }
    }
    clearClientPortalSessionToken();
    router.replace("/portal/login");
  }

  return (
      <header className="border-b border-border bg-card/40 px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
        <Link href={showNav ? "/portal/files" : "/portal/login"} className="flex items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-xs font-bold text-brand-foreground">
            DLC
          </div>
          <div>
            <div className={cn("text-sm font-semibold leading-tight")}>
              Client portal
            </div>
            <div className="text-[10px] text-muted-foreground">
              Shared loan file access
            </div>
          </div>
        </Link>
        {showNav ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground"
            onClick={() => void logout()}
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </Button>
        ) : null}
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">
          You only see files and documents your lender explicitly shared with your
          email. This site is for your transaction — not general banking.
        </p>
      </div>
    </header>
  );
}
