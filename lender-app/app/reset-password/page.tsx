"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import {
  MAX_PLAINTEXT_PASSWORD_LENGTH,
  MIN_PLAINTEXT_PASSWORD_LENGTH,
  plaintextPasswordRequirementSummary,
  validatePlaintextPasswordPolicy,
} from "@/lib/auth/passwordPolicy";

function ResetForm() {
  const search = useSearchParams();
  const tokenFromUrl = search.get("token")?.trim() ?? "";
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Reset failed.");
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4 text-sm">
        <p>Your password was updated. Sign in with your new password.</p>
        <Link href="/login" className="font-medium text-primary underline">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Reset token</span>
        <input
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          autoComplete="off"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">
          New password ({plaintextPasswordRequirementSummary()})
        </span>
        <input
          type="password"
          required
          minLength={MIN_PLAINTEXT_PASSWORD_LENGTH}
          maxLength={MAX_PLAINTEXT_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          autoComplete="new-password"
        />
      </label>
      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={
          submitting || !token || validatePlaintextPasswordPolicy(password) !== null
        }
        className="w-full rounded-md bg-brand py-2 text-sm font-medium text-brand-foreground disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Paste the token from your reset email (or dev link).
        </p>
        <div className="mt-4">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
            <ResetForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
