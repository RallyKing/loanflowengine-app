"use client";

import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ChevronDown, ChevronRight, FileSignature } from "lucide-react";
import { cn } from "@/lib/cn";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";

function envelopeStatusLabel(status: string): string {
  const m: Record<string, string> = {
    draft: "Draft",
    sending: "Sending…",
    sent: "Sent",
    in_progress: "In progress",
    completed: "Completed",
    declined: "Declined",
    voided: "Voided",
    error: "Error",
  };
  return m[status] ?? status;
}

function signerStatusLabel(status: string): string {
  const m: Record<string, string> = {
    pending: "Pending",
    awaiting_turn: "Waiting",
    email_sent: "Awaiting signature",
    viewed: "Viewed",
    signed: "Signed",
    declined: "Declined",
  };
  return m[status] ?? status;
}

type SignerRow = { name: string; email: string };

export function DocumentSignatureBlock({
  documentId,
  documentTitle,
  proof,
  memberUserKey,
  canMutate,
  hasFile,
  defaultVersionId,
}: {
  documentId: Id<"libraryDocuments">;
  /** Used as default e-sign subject line. */
  documentTitle?: string;
  proof: LibraryDocumentsProof;
  memberUserKey?: string;
  canMutate: boolean;
  hasFile: boolean;
  defaultVersionId?: Id<"libraryDocumentVersions">;
}) {
  const { confirm } = useOperationalConfirm();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(() => documentTitle ?? "");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"sequential" | "parallel">("sequential");
  const [signers, setSigners] = useState<SignerRow[]>(() => [
    { name: "", email: "" },
    { name: "", email: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [auditFor, setAuditFor] = useState<Id<"signatureEnvelopes"> | null>(
    null,
  );

  const versions = useQuery(
    api.libraryDocuments.listVersions,
    memberUserKey && open
      ? { documentId, memberUserKey }
      : "skip",
  );

  const [versionId, setVersionId] = useState<
    Id<"libraryDocumentVersions"> | undefined
  >(defaultVersionId);

  const envelopes = useQuery(
    api.signatures.listEnvelopesForDocument,
    memberUserKey
      ? { libraryDocumentId: documentId, memberUserKey }
      : "skip",
  );

  const audit = useQuery(
    api.signatures.listSignatureAudit,
    auditFor && memberUserKey
      ? { envelopeId: auditFor, memberUserKey }
      : "skip",
  );

  const createSend = useMutation(api.signatures.createAndSendSignatureEnvelope);
  const voidEnv = useMutation(api.signatures.voidSignatureEnvelope);

  const versionOptions = useMemo(() => versions ?? [], [versions]);

  const selectedVersion =
    versionId && versionOptions.some((v) => v._id === versionId)
      ? versionId
      : versionOptions[0]?._id ?? defaultVersionId;

  useEffect(() => {
    if (defaultVersionId && !versionId) {
      setVersionId(defaultVersionId);
    }
  }, [defaultVersionId, versionId]);

  useEffect(() => {
    if (!versions?.length) return;
    if (versionId && !versions.some((v) => v._id === versionId)) {
      setVersionId(versions[0]!._id);
    }
  }, [versions, versionId]);

  if (!open) {
    return (
      <button
        type="button"
        className="mt-2 flex w-full items-center gap-1 rounded-md border border-dashed border-border/80 bg-muted/10 px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted/30"
        onClick={() => setOpen(true)}
      >
        <FileSignature className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>E-signatures &amp; tracking</span>
        <ChevronRight className="ml-auto h-3.5 w-3.5" aria-hidden />
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border/70 bg-muted/15 px-2 py-2 text-[11px]">
      <button
        type="button"
        className="flex w-full items-center gap-1 text-left font-medium text-foreground"
        onClick={() => setOpen(false)}
      >
        <FileSignature className="h-3.5 w-3.5 shrink-0" aria-hidden />
        E-signatures
        <ChevronDown className="ml-auto h-3.5 w-3.5" aria-hidden />
      </button>
      <p className="text-muted-foreground">
        Send a library file for legally binding e-sign (Dropbox Sign / HelloSign
        when <code className="rounded bg-muted px-0.5">DROPBOX_SIGN_API_KEY</code>{" "}
        is set in Convex; otherwise demo mode). PDFs work best. Sequential order
        matches signer rows top-to-bottom.
      </p>
      {!hasFile ? (
        <p className="text-amber-800 dark:text-amber-200">
          Upload a document version first.
        </p>
      ) : null}
      {!memberUserKey ? (
        <p className="text-muted-foreground">Sign in to send or void.</p>
      ) : null}

      {envelopes === undefined ? (
        <p className="text-muted-foreground">Loading requests…</p>
      ) : envelopes.length > 0 ? (
        <ul className="space-y-2">
          {envelopes.map(({ envelope: ev, signers: sigs }) => (
            <li
              key={ev._id}
              className="rounded border border-border/60 bg-background/80 px-2 py-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-foreground">{ev.title}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                    ev.status === "completed" &&
                      "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
                    ev.status === "error" &&
                      "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
                    ev.status === "in_progress" || ev.status === "sent"
                      ? "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {envelopeStatusLabel(ev.status)}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Provider: {ev.provider === "dropbox_sign" ? "Dropbox Sign" : "Demo"}
                {ev.externalRequestId
                  ? ` · Request ${ev.externalRequestId.slice(0, 12)}…`
                  : ""}
              </div>
              {ev.lastError ? (
                <p className="mt-1 text-[10px] text-destructive">{ev.lastError}</p>
              ) : null}
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-[10px]">
                {sigs.map((s) => (
                  <li key={s._id}>
                    <span className="font-medium">{s.name}</span> ({s.emailNormalized}) —{" "}
                    {signerStatusLabel(s.status)}
                    {s.signUrl ? (
                      <>
                        {" "}
                        <a
                          href={s.signUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline"
                        >
                          Open (demo)
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ol>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={() =>
                    setAuditFor((x) => (x === ev._id ? null : ev._id))
                  }
                >
                  {auditFor === ev._id ? "Hide audit" : "Audit trail"}
                </Button>
                {canMutate &&
                memberUserKey &&
                ["sending", "sent", "in_progress"].includes(ev.status) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] text-destructive"
                    onClick={() => {
                      void (async () => {
                        const ok = await confirm({
                          title: "Void signature request",
                          entityName: documentTitle?.trim() || "Document",
                          impact:
                            "Voids this request in the app. Cancel in Dropbox Sign separately if live.",
                          confirmLabel: "Void",
                        });
                        if (!ok) return;
                        void voidEnv({
                        envelopeId: ev._id,
                        proof,
                        memberUserKey,
                      }).catch((e) =>
                        setFormErr(
                          e instanceof Error ? e.message : String(e),
                        ),
                      );
                      })();
                    }}
                  >
                    Void
                  </Button>
                ) : null}
              </div>
              {auditFor === ev._id && audit !== undefined ? (
                <ul className="mt-2 max-h-32 overflow-y-auto border-t border-border/50 pt-1 text-[10px] text-muted-foreground">
                  {audit.length === 0 ? (
                    <li>No audit entries.</li>
                  ) : (
                    audit.map((a) => (
                      <li key={a._id}>
                        <span className="text-foreground">{a.kind}</span> ·{" "}
                        {a.actorType}/{a.actorKey} ·{" "}
                        {new Date(a.at).toLocaleString()}
                        {a.detail ? (
                          <span className="block truncate">{a.detail}</span>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No signature requests yet.</p>
      )}

      {formErr ? (
        <p className="text-[10px] text-destructive" role="alert">
          {formErr}
        </p>
      ) : null}

      {canMutate && memberUserKey && hasFile ? (
        <div className="space-y-2 border-t border-border/50 pt-2">
          <div className="font-medium text-foreground">New request</div>
          {versionOptions.length > 0 ? (
            <label className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Version to send</span>
              <select
                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                value={selectedVersion ?? ""}
                onChange={(e) =>
                  setVersionId(e.target.value as Id<"libraryDocumentVersions">)
                }
              >
                {versionOptions.map((v) => (
                  <option key={v._id} value={v._id}>
                    v{v.version} — {v.fileName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Subject</span>
            <Input
              className="h-8 text-xs"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Sign: disclosure packet"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Message (optional)</span>
            <Input
              className="h-8 text-xs"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Short note to signers"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Signing order</span>
            <select
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              value={mode}
              onChange={(e) =>
                setMode(e.target.value as "sequential" | "parallel")
              }
            >
              <option value="sequential">Sequential (top → bottom)</option>
              <option value="parallel">Parallel (all at once)</option>
            </select>
          </label>
          <div className="space-y-1">
            <div className="text-muted-foreground">Signers</div>
            {signers.map((row, i) => (
              <div key={i} className="flex flex-wrap gap-1">
                <Input
                  placeholder={`Signer ${i + 1} name`}
                  className="h-8 min-w-[7rem] flex-1 text-xs"
                  value={row.name}
                  onChange={(e) => {
                    const next = [...signers];
                    next[i] = { ...next[i]!, name: e.target.value };
                    setSigners(next);
                  }}
                />
                <Input
                  placeholder="Email"
                  type="email"
                  className="h-8 min-w-[9rem] flex-1 text-xs"
                  value={row.email}
                  onChange={(e) => {
                    const next = [...signers];
                    next[i] = { ...next[i]!, email: e.target.value };
                    setSigners(next);
                  }}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 mt-1 text-[10px]"
              onClick={() =>
                setSigners((s) => [...s, { name: "", email: "" }])
              }
            >
              Add signer
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            disabled={busy || !selectedVersion}
            onClick={() => {
              setFormErr(null);
              setBusy(true);
              void (async () => {
                try {
                  await createSend({
                    libraryDocumentId: documentId,
                    libraryVersionId: selectedVersion!,
                    title: subject.trim() || documentTitle || "Please sign",
                    message: message.trim() || undefined,
                    signingMode: mode,
                    signers: signers.filter((s) => s.email.trim()),
                    proof,
                    memberUserKey,
                  });
                  setSigners([
                    { name: "", email: "" },
                    { name: "", email: "" },
                  ]);
                  setMessage("");
                } catch (e) {
                  setFormErr(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {busy ? "Sending…" : "Send for signature"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
