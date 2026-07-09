"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [username, setUsername] = useState("");
  const [done, setDone] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setDevToken(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        devResetToken?: string;
      };
      setDone(true);
      if (data.devResetToken) setDevToken(data.devResetToken);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Reset password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your username. If an account exists, you can reset with the link we provide
          (email delivery is not enabled yet in all environments).
        </p>
        {done ? (
          <div className="mt-4 space-y-3 text-sm">
            <p>
              If that username is registered, a reset was recorded. Check your email when
              outbound mail is configured.
            </p>
            {devToken ? (
              <div className="rounded-md border border-border bg-muted/40 p-3 break-all font-mono text-xs">
                Dev token: {devToken}
                <br />
                <Link href={`/reset-password?token=${devToken}`} className="mt-2 inline-block underline">
                  Open reset page
                </Link>
              </div>
            ) : null}
            <Link href="/login" className="inline-block text-sm underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Username</span>
              <input
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-brand py-2 text-sm font-medium text-brand-foreground disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Continue"}
            </button>
            <Link href="/login" className="block text-center text-xs text-muted-foreground underline">
              Cancel
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
