"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, Loader2, Mail, Shield } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import type { RegistryItem } from "@/lib/registry/registryItem";

export type DeliverToLenderModalProps = {
  open: boolean;
  onClose: () => void;
  pipelineFileId: Id<"pipeline">;
  organizationId: Id<"organizations">;
  memberUserKey?: string;
  fileTasks: Doc<"documentVaultFileTasks">[];
  folders: Doc<"documentFolders">[];
  documents: {
    _id: Id<"libraryDocuments">;
    title: string;
    fileTaskId?: Id<"documentVaultFileTasks">;
    folderId?: Id<"documentFolders">;
  }[];
  onError: (message: string) => void;
};

type ExpiryPreset = "24h" | "3d" | "7d";

import { buildClientPortalUrl } from "@/lib/clientPortalUrl";

export function DeliverToLenderModal({
  open,
  onClose,
  pipelineFileId,
  organizationId,
  memberUserKey,
  fileTasks,
  folders,
  documents,
  onError,
}: DeliverToLenderModalProps) {
  const [search, setSearch] = useState("");
  const [lenderId, setLenderId] = useState<Id<"lenders"> | "">("");
  const [expiry, setExpiry] = useState<ExpiryPreset>("3d");
  const [permission, setPermission] = useState<"view_only" | "downloadable">(
    "view_only",
  );
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  const lenders = useQuery(
    api.registry.list,
    open && memberUserKey
      ? {
          organizationId,
          memberUserKey,
          searchQuery: search.trim() || undefined,
          typeFilter: ["lender"],
          limit: 30,
        }
      : "skip",
  );

  const issueDelivery = useMutation(api.lenderDeliveryPortal.issueDeliveryToken);
  const sendDelivery = useMutation(api.lenderDeliveryPortal.sendDeliveryToLender);

  const lenderOptions = useMemo(
    () => ((lenders ?? []) as RegistryItem[]).filter((r) => r.registryType === "lender"),
    [lenders],
  );

  const selectedLender = useMemo(
    () => lenderOptions.find((l) => String(l._id) === String(lenderId)),
    [lenderOptions, lenderId],
  );

  const activeTasks = fileTasks.filter((t) => !t.isArchived);
  const activeFolders = folders.filter((f) => !f.fileTaskId || activeTasks.some((t) => String(t._id) === String(f.fileTaskId)));

  const toggle = (
    set: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
  ) => {
    set((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasSelection =
    selectedDocs.size > 0 ||
    selectedFolders.size > 0 ||
    selectedTasks.size > 0;

  const handleDeliver = async () => {
    if (!memberUserKey || !lenderId || busy) return;
    if (!hasSelection) {
      onError("Please select at least one document, folder, or file task to deliver.");
      showOperationalToast({
        title: "Nothing selected",
        description: "Please select at least one document or task to deliver.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const result = await issueDelivery({
        pipelineFileId,
        lenderId,
        expiryPreset: expiry,
        permission,
        includedDocumentIds: [...selectedDocs].map(
          (id) => id as Id<"libraryDocuments">,
        ),
        includedFolderIds: [...selectedFolders].map(
          (id) => id as Id<"documentFolders">,
        ),
        includedFileTaskIds: [...selectedTasks].map(
          (id) => id as Id<"documentVaultFileTasks">,
        ),
        memberUserKey,
      });
      const url = buildClientPortalUrl(result.companySlug ?? "portal", result.token);
      setDeliveryUrl(url);
      showOperationalToast({
        title: "Lender delivery link created",
        description: `${result.documentCount} document(s) packaged.`,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Delivery failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    if (!memberUserKey || !lenderId || !deliveryUrl || sending) return;
    if (!selectedLender?.primaryEmail) {
      onError("This lender has no email on file. Add an email in the Global Registry.");
      return;
    }
    setSending(true);
    try {
      const result = await sendDelivery({
        pipelineFileId,
        lenderId,
        deliveryUrl,
        expiryPreset: expiry,
        permission,
        memberUserKey,
      });
      showOperationalToast({
        title: "Email sent",
        description: `Delivery link sent to ${result.sentTo}.`,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not send email.");
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async () => {
    if (!deliveryUrl) return;
    try {
      await navigator.clipboard.writeText(deliveryUrl);
      showOperationalToast({ title: "Link copied" });
    } catch {
      onError("Could not copy link.");
    }
  };

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      aria-label="Deliver to lender"
      panelClassName="w-full max-w-xl p-5"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Shield className="h-4 w-4" aria-hidden />
        Deliver to Lender
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Package selected vault assets with time-limited secure access.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Lender
          </label>
          <Input
            className="mt-1"
            placeholder="Search lenders…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="mt-1 h-9 w-full rounded-dlc-md border border-border bg-background px-2 text-sm"
            value={lenderId}
            onChange={(e) => setLenderId(e.target.value as Id<"lenders"> | "")}
          >
            <option value="">Select lender…</option>
            {lenderOptions.map((l) => (
              <option key={l._id} value={l._id}>
                {l.displayName}
                {l.primaryEmail ? ` · ${l.primaryEmail}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Expiration
            </label>
            <select
              className="mt-1 h-9 w-full rounded-dlc-md border border-border bg-background px-2 text-sm"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as ExpiryPreset)}
            >
              <option value="24h">24 Hours</option>
              <option value="3d">3 Days</option>
              <option value="7d">7 Days</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Access Level
            </label>
            <div className="mt-1 flex gap-2">
              {(["view_only", "downloadable"] as const).map((p) => (
                <label
                  key={p}
                  className={cn(
                    "flex flex-1 cursor-pointer items-center justify-center rounded-dlc-md border px-2 py-2 text-xs",
                    permission === p
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    checked={permission === p}
                    onChange={() => setPermission(p)}
                  />
                  {p === "view_only" ? "View Only" : "Allow Download"}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="max-h-48 space-y-2 overflow-y-auto rounded-dlc-md border border-border/60 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            File Tasks
          </p>
          {activeTasks.map((t) => (
            <label key={t._id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={selectedTasks.has(String(t._id))}
                onChange={() => toggle(setSelectedTasks, String(t._id))}
              />
              {t.title}
            </label>
          ))}
          <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Folders
          </p>
          {activeFolders.slice(0, 20).map((f) => (
            <label key={f._id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={selectedFolders.has(String(f._id))}
                onChange={() => toggle(setSelectedFolders, String(f._id))}
              />
              {f.name}
            </label>
          ))}
          <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Documents
          </p>
          {documents.slice(0, 30).map((d) => (
            <label key={d._id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={selectedDocs.has(String(d._id))}
                onChange={() => toggle(setSelectedDocs, String(d._id))}
              />
              {d.title}
            </label>
          ))}
        </div>

        {deliveryUrl ? (
          <div className="space-y-2">
            <Input value={deliveryUrl} readOnly className="text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void handleCopy()}>
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copy link
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={sending || !selectedLender?.primaryEmail}
                onClick={() => void handleSend()}
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Mail className="h-3.5 w-3.5" aria-hidden />
                    Send to Lender
                  </>
                )}
              </Button>
            </div>
            {!selectedLender?.primaryEmail ? (
              <p className="text-xs text-amber-700">
                Add an email to this lender in the Global Registry to send the link.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!lenderId || busy}
          onClick={() => void handleDeliver()}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create Link"}
        </Button>
      </div>
    </OverlayShell>
  );
}
