import Link from "next/link";
import type { Metadata } from "next";
import { APP_DISPLAY_NAME } from "@/lib/brandIdentity";

export const metadata: Metadata = {
  title: `Session expired — ${APP_DISPLAY_NAME}`,
};

export default function SessionExpiredPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground">
      <h1 className="text-xl font-semibold">Session expired</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your session ended or was signed out elsewhere. Sign in again to continue.
      </p>
      <Link
        href="/login"
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground"
      >
        Sign in
      </Link>
    </main>
  );
}
