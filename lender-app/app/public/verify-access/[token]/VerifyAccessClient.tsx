"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Lock, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { writePortalAccessProof } from "@/lib/portalAccessProof";

type VerifyAccessClientProps = {
  token: string;
};

export function VerifyAccessClient({ token }: VerifyAccessClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/";

  const gate = useQuery(api.portalAccessVerification.getLinkVerificationGate, {
    token,
  });
  const verifyPasscode = useMutation(api.portalAccessVerification.verifyLinkPasscode);
  const sendOtp = useMutation(api.portalAccessVerification.sendLinkEmailOtp);
  const verifyOtp = useMutation(api.portalAccessVerification.verifyLinkEmailOtp);

  const [passcode, setPasscode] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);

  const verificationType = useMemo(() => {
    if (gate?.status === "verification_required") return gate.verificationType;
    return null;
  }, [gate]);

  async function completeVerification(proofToken: string) {
    writePortalAccessProof(token, proofToken);
    router.replace(returnTo);
  }

  if (gate === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        Loading…
      </div>
    );
  }

  if (gate.status === "revoked") {
    return <GateCard title="Link Revoked">This secure link has been revoked.</GateCard>;
  }
  if (gate.status === "expired") {
    return <GateCard title="Link Expired">This secure link has expired.</GateCard>;
  }
  if (gate.status === "not_found") {
    return <GateCard title="Invalid Link">This secure link is not valid.</GateCard>;
  }
  if (gate.status === "ok" && !gate.requiresVerification) {
    router.replace(returnTo);
    return null;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-dlc-surface px-4 py-10">
      <div
        className="w-full max-w-md rounded-dlc-lg border border-border/80 bg-white p-6 shadow-dlc-2"
        data-testid="portal-verify-access"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Lock className="h-4 w-4 text-primary" aria-hidden />
          Verify access
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Additional verification is required before you can open this secure link.
        </p>

        {verificationType === "passcode" ? (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              void verifyPasscode({ token, passcode })
                .then((result) => completeVerification(result.proofToken))
                .catch((err) =>
                  setError(err instanceof Error ? err.message : "Verification failed."),
                )
                .finally(() => setBusy(false));
            }}
          >
            <label className="block text-xs font-medium text-foreground">
              Passcode
              <Input
                className="mt-1"
                type="password"
                autoComplete="one-time-code"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                data-testid="portal-verify-passcode"
              />
            </label>
            {error ? (
              <p className="text-xs text-red-600" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              size="sm"
              variant="primary"
              className="w-full"
              disabled={busy || !passcode.trim()}
              data-testid="portal-verify-submit"
            >
              {busy ? "Verifying…" : "Continue"}
            </Button>
          </form>
        ) : null}

        {verificationType === "email_otp" ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              {gate.status === "verification_required" && gate.maskedEmail
                ? `We'll send a 6-digit code to ${gate.maskedEmail}.`
                : "We'll email a 6-digit verification code."}
            </p>
            {!otpSent ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full gap-1.5"
                disabled={busy}
                data-testid="portal-verify-send-otp"
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  void sendOtp({ token })
                    .then(() => setOtpSent(true))
                    .catch((err) =>
                      setError(err instanceof Error ? err.message : "Could not send code."),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                <Mail className="h-3.5 w-3.5" aria-hidden />
                Send verification code
              </Button>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError(null);
                  void verifyOtp({ token, code: otp })
                    .then((result) => completeVerification(result.proofToken))
                    .catch((err) =>
                      setError(err instanceof Error ? err.message : "Verification failed."),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                <label className="block text-xs font-medium text-foreground">
                  6-digit code
                  <Input
                    className="mt-1"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    data-testid="portal-verify-otp"
                  />
                </label>
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  className="w-full"
                  disabled={busy || otp.trim().length < 6}
                >
                  {busy ? "Verifying…" : "Verify and continue"}
                </Button>
              </form>
            )}
            {error ? (
              <p className="text-xs text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GateCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md rounded-dlc-lg border border-border/80 bg-white p-6 text-center shadow-dlc-1">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
