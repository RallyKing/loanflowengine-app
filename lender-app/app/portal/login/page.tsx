"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import {
  getRememberedOrgScope,
  setClientPortalSessionToken,
  setRememberedOrgScope,
} from "@/lib/clientPortalSession";
import { TrustErrorBlock } from "@/components/trust/TrustSurfaces";
import {
  MAX_PLAINTEXT_PASSWORD_LENGTH,
  MIN_PLAINTEXT_PASSWORD_LENGTH,
  validatePlaintextPasswordPolicy,
} from "@/lib/auth/passwordPolicy";
import { formatPortalTrustError } from "@/lib/portalTrustErrors";

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgScope, setOrgScope] = useState(() => getRememberedOrgScope() ?? "");
  const [err, setErr] = useState<{
    title: string;
    detail?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const scopes = useQuery(
    api.clientPortal.listScopesForEmail,
    email.trim().includes("@") ? { email: email.trim() } : "skip",
  );
  const loginWithPassword = useMutation(api.clientPortal.loginWithPassword);

  useEffect(() => {
    if (scopes?.length === 1) {
      setOrgScope(scopes[0]!.orgScope);
    }
  }, [scopes]);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the workspace your loan officer selected, or open the magic link
          from your email first.
        </p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void (async () => {
            setErr(null);
            if (!email.trim() || !orgScope.trim()) {
              setErr({
                title: "Sign-in incomplete",
                detail:
                  "Enter your email and select the workspace your loan team assigned.",
              });
              return;
            }
            const portalLoginPw = validatePlaintextPasswordPolicy(password);
            if (portalLoginPw) {
              setErr({ title: "Invalid password", detail: portalLoginPw });
              return;
            }
            setBusy(true);
            try {
              const res = await loginWithPassword({
                orgScope: orgScope.trim(),
                email: email.trim(),
                password,
              });
              setClientPortalSessionToken(res.sessionToken);
              setRememberedOrgScope(orgScope.trim());
              router.replace("/portal/files");
            } catch (e) {
              const raw = e instanceof Error ? e.message : String(e);
              setErr(formatPortalTrustError(raw));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2"
          />
        </label>
        {scopes && scopes.length > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Workspace</span>
            <select
              required
              value={orgScope}
              onChange={(e) => setOrgScope(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="">Select…</option>
              {scopes.map((s) => (
                <option key={s.orgScope} value={s.orgScope}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Workspace id</span>
            <input
              type="text"
              value={orgScope}
              onChange={(e) => setOrgScope(e.target.value)}
              placeholder='Usually filled automatically after magic link — or "none"'
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            />
            <span className="text-[11px] text-muted-foreground">
              After you open a magic link once, we remember your workspace. If you
              only use password login, your officer can tell you the scope (
              <code className="rounded bg-muted px-1">none</code> for non-team
              accounts).
            </span>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={MIN_PLAINTEXT_PASSWORD_LENGTH}
            maxLength={MAX_PLAINTEXT_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2"
          />
        </label>
        {err ? (
          <TrustErrorBlock title={err.title} description={err.detail} />
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="text-center text-xs text-muted-foreground">
        First time? Open the secure link from your broker&apos;s email, then set a
        password from your file page.
      </p>
    </div>
  );
}
